-- Retira la revisión automática de imágenes y sus reintentos pagados.
-- Los archivos, las decisiones explícitas y ai_generations no se modifican.
begin;
-- Bloquea pedidos concurrentes durante la sustitución de las RPC y sus campos.
lock table public.products in share row exclusive mode;
create temporary table retired_image_review_stamps on commit drop as
 select id, public.pi_ugc_context_stamp(id) as previous_stamp from public.products;

-- Conserva la posición histórica false en el hash, sin consultar configuración de QA.
-- Las huellas de los productos que ya tenían la revisión apagada no cambian.
create or replace function public.pi_ugc_context_stamp(p_product_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select public.pi_snapshot_hash(jsonb_build_array(public.pi_context_snapshot(p_product_id), false,
  coalesce((select jsonb_agg(to_jsonb(r)-'created_at'-'updated_at' order by r.id)
   from public.product_reference_images r where r.product_id=p_product_id),'[]'::jsonb)))
$$;
alter table retired_image_review_stamps add column current_stamp text;
update retired_image_review_stamps set current_stamp=public.pi_ugc_context_stamp(id);
-- Solo sustituye huellas que aún coincidían: no reactiva trabajos o inputs obsoletos.
update public.pi_gallery_operations o set context_stamp=s.current_stamp from retired_image_review_stamps s
 where o.product_id=s.id and o.context_stamp=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.pi_ugc_operations o set context_stamp=s.current_stamp from retired_image_review_stamps s
 where o.product_id=s.id and o.context_stamp=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.page_image_runs r set input=jsonb_set(r.input,'{generation_stamp}',to_jsonb(s.current_stamp))
 from retired_image_review_stamps s where r.product_id=s.id and r.input->>'generation_stamp'=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.creative_runs r set input=jsonb_set(r.input,'{generation_stamp}',to_jsonb(s.current_stamp))
 from retired_image_review_stamps s where r.product_id=s.id and r.input->>'generation_stamp'=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.video_scripts v set provenance=jsonb_set(v.provenance,'{context_stamp}',to_jsonb(s.current_stamp))
 from retired_image_review_stamps s where v.product_id=s.id and v.provenance->>'context_stamp'=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.ad_media m set content_provenance=jsonb_set(m.content_provenance,'{generation_stamp}',to_jsonb(s.current_stamp))
 from retired_image_review_stamps s where m.product_id=s.id and m.content_provenance->>'generation_stamp'=s.previous_stamp and s.previous_stamp<>s.current_stamp;
update public.video_montages m set context_stamp=s.current_stamp from retired_image_review_stamps s
 where m.product_id=s.id and m.context_stamp=s.previous_stamp and s.previous_stamp<>s.current_stamp;

-- Sustituye el contrato interno; no deja un overload que acepte habilitar QA.
drop function public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean,boolean);
create function public.pi_enqueue_gallery_generation(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_provider text,p_jobs jsonb,p_estimated numeric,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; rev bigint; receipt public.pi_idempotency_records; op_id uuid; image_id uuid; ids jsonb:='[]'; job jsonb; result jsonb; base_id uuid; request_id uuid:=gen_random_uuid();
begin
 owner_id:=public.pi_authorize_context(p_access,'landing:generate');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'landing:generate');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='generate_gallery_images' and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_content_state(p_product_id,owner_id,'gallery'); rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if rev is distinct from p_expected_revision or p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,public.pi_context_snapshot(p_product_id))) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if state->>'content_etag' is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_provider is null or p_provider not in ('higgsfield','gemini') or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or p_estimated is null or p_estimated<0 or jsonb_typeof(p_jobs) is distinct from 'array' or jsonb_array_length(p_jobs) not between 1 and 9 or octet_length(p_jobs::text)>65536 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from public.page_images where product_id=p_product_id and user_id=owner_id and render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if (select count(*) from public.page_images where user_id=owner_id and source='ai' and created_at>now()-interval '24 hours')+jsonb_array_length(p_jobs)>150 then raise exception 'PI_RATE_LIMITED'; end if;
 select id into base_id from public.product_reference_images where product_id=p_product_id and user_id=owner_id and not excluded order by is_base desc,is_cover desc,position,id limit 1;
 if base_id is null then raise exception 'PI_INVALID_REFERENCE'; end if;
 if not p_dry_run then
   insert into public.pi_gallery_operations(product_id,user_id,access,context_stamp,base_reference_id,estimated_usd)
     values(p_product_id,owner_id,p_access,public.pi_ugc_context_stamp(p_product_id),base_id,p_estimated) returning id into op_id;
 end if;
 for job in select value from jsonb_array_elements(p_jobs) loop
   if not exists(select 1 from public.page_image_shots s join public.page_image_runs r on r.id=s.run_id where s.id=(job->>'shot_id')::uuid and s.product_id=p_product_id and s.user_id=owner_id and s.superseded_at is null and s.slot=job->>'slot'
      and r.input->>'source'='mcp_chat' and r.input->>'generation_stamp'=public.pi_ugc_context_stamp(p_product_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if (select count(*) from public.page_images where product_id=p_product_id and user_id=owner_id and slot=job->>'slot' and status<>'rejected')+
      (select count(*) from jsonb_array_elements(p_jobs) j where j->>'slot'=job->>'slot')>12 then raise exception 'PI_RATE_LIMITED'; end if;
   if not p_dry_run then
     insert into public.page_images(product_id,user_id,slot,source,shot_id,provider,endpoint,input,render_status,pi_operation_id)
       values(p_product_id,owner_id,job->>'slot','ai',(job->>'shot_id')::uuid,p_provider,job->>'endpoint',job->'input','queued',op_id) returning id into image_id;
     ids:=ids||jsonb_build_array(image_id);
   end if;
 end loop;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('operation_id',op_id,'dry_run',p_dry_run,'status',case when p_dry_run then 'preview' else 'queued' end,
   'image_ids',ids,'estimated_usd',p_estimated,'requires_review',true,'warnings',jsonb_build_array('Estimación de imágenes, no un tope de facturación del proveedor.', 'Sin reintentos automáticos de envíos ambiguos. Revisa y decide en DropFlex.')));
 if not p_dry_run then
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,request_id,'generate_gallery_images',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('operation_id',op_id,'image_ids',ids));
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='generate_gallery_images' and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,'generate_gallery_images',p_key,p_hash,array['product_intelligence:read','landing:generate'],result,rev,request_id);
 end if;
 return result;
end $$;
create or replace function public.pi_claim_gallery_image(p_image_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare image public.page_images; op public.pi_gallery_operations;
begin
 select * into image from public.page_images where id=p_image_id;
 if image.pi_operation_id is null then return null; end if;
 select * into op from public.pi_gallery_operations where id=image.pi_operation_id;
 perform 1 from public.products where id=op.product_id and user_id=op.user_id and pi_deleting_at is null for update;
 if not found then return null; end if;
 select * into image from public.page_images where id=p_image_id for update;
 if image.render_status<>'queued' or image.error_code='dispatching' or op.status in ('cancelled','failed','reconciling') then return null; end if;
 begin
   perform public.pi_authorize_context(op.access,'landing:generate');
   if op.context_stamp is distinct from public.pi_ugc_context_stamp(op.product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
 exception when others then
   update public.page_images set render_status='failed',error_code='context_or_authorization_changed',error_message='Cambió el contexto o la autorización. Revisa el plan en el chat.',updated_at=now() where pi_operation_id=op.id and render_status='queued' and (error_code is distinct from 'dispatching' or id=p_image_id);
   update public.pi_gallery_operations set status='cancelled',updated_at=now() where id=op.id;
   return null;
 end;
 update public.page_images set error_code='dispatching',updated_at=now() where id=p_image_id returning * into image;
 update public.pi_gallery_operations set status='running',updated_at=now() where id=op.id;
 return to_jsonb(image)||jsonb_build_object('pi_base_reference_id',op.base_reference_id);
end $$;

revoke all on function public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean) from public,anon,authenticated;
grant execute on function public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean) to service_role;
-- CREATE OR REPLACE conserva los permisos cerrados de las otras RPC.
alter table public.products drop column image_qa;
alter table public.pi_gallery_operations drop column qa_enabled;
alter table public.page_images drop column qa, drop column baked_texts, drop column retry_of, drop column attempt;
alter table public.creative_assets drop column qa, drop column baked_texts, drop column attempt;
alter table public.video_shots drop column qa;
notify pgrst, 'reload schema';
commit;
