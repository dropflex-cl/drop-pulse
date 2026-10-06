create table public.pi_gallery_operations (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, user_id uuid not null,
 access jsonb not null, context_stamp text not null, base_reference_id uuid not null, -- id congelado: borrar una referencia no purga imágenes ni su Storage.
 estimated_usd numeric not null check(estimated_usd>=0), qa_enabled boolean not null, status text not null default 'queued'
   check(status in ('queued','running','succeeded','failed','reconciling','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);
-- access contiene grant/session de la operación, solo el servidor puede leerlo.
alter table public.pi_gallery_operations enable row level security;
alter table public.page_images add column pi_operation_id uuid references public.pi_gallery_operations(id) on delete cascade;
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels','save_ugc_content','generate_ugc',
 'save_creative_content','save_gallery_content','save_event_content','save_usage_tip','save_product_learning','generate_gallery_images'));
create function public.pi_gallery_operation_result(p_product_id uuid,p_owner_id uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare op public.pi_gallery_operations; images jsonb; state text;
begin
 select * into op from public.pi_gallery_operations where id=p_id and product_id=p_product_id and user_id=p_owner_id;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slot',slot,'render_status',render_status,'status',status,'error_code',error_code) order by created_at,id),'[]'::jsonb) into images from public.page_images where pi_operation_id=p_id and product_id=p_product_id and user_id=p_owner_id;
 state:=case when op.status='cancelled' then 'cancelled'
   when exists(select 1 from public.page_images where pi_operation_id=p_id and error_code='dispatch_unknown') then 'reconciling'
   when exists(select 1 from public.page_images where pi_operation_id=p_id and render_status in ('queued','running')) then case when op.status='queued' then 'queued' else 'running' end
   when exists(select 1 from public.page_images where pi_operation_id=p_id and render_status='failed') then 'failed' else 'succeeded' end;
 return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),'request_id',gen_random_uuid(),
   'data',jsonb_build_object('operation_id',p_id,'status',state,'estimated_usd',op.estimated_usd,'images',images,'requires_review',true,'next_action',
     case when state='reconciling' then 'Revisa el proveedor antes de pedir otra imagen. Un envío ambiguo no se repite automáticamente.' else 'Revisa y elige las imágenes en DropFlex; luego guarda la página desde el chat y publica en la UI.' end));
end $$;
create function public.pi_load_gallery_generation(p_access jsonb,p_product_id uuid,p_operation_id uuid default null,p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; receipt public.pi_idempotency_records;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_key is not null then perform public.pi_authorize_context(p_access,'landing:generate'); end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_operation_id is not null then return public.pi_gallery_operation_result(p_product_id,owner_id,p_operation_id); end if;
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='generate_gallery_images' and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return jsonb_build_object('replay',receipt.result);
   end if;
 end if;
 return public.pi_load_content(p_access,p_product_id,'gallery');
end $$;
create function public.pi_enqueue_gallery_generation(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_provider text,p_jobs jsonb,p_estimated numeric,p_qa boolean,p_dry_run boolean default false) returns jsonb
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
   insert into public.pi_gallery_operations(product_id,user_id,access,context_stamp,base_reference_id,estimated_usd,qa_enabled)
     values(p_product_id,owner_id,p_access,public.pi_ugc_context_stamp(p_product_id),base_id,p_estimated,p_qa) returning id into op_id;
 end if;
 for job in select value from jsonb_array_elements(p_jobs) loop
   if not exists(select 1 from public.page_image_shots s join public.page_image_runs r on r.id=s.run_id where s.id=(job->>'shot_id')::uuid and s.product_id=p_product_id and s.user_id=owner_id and s.superseded_at is null and s.slot=job->>'slot'
      and r.input->>'source'='mcp_chat' and r.input->>'generation_stamp'=public.pi_ugc_context_stamp(p_product_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if (select count(*) from public.page_images where product_id=p_product_id and user_id=owner_id and slot=job->>'slot' and status<>'rejected')+
      (select count(*) from jsonb_array_elements(p_jobs) j where j->>'slot'=job->>'slot')>12 then raise exception 'PI_RATE_LIMITED'; end if;
   if not p_dry_run then
     insert into public.page_images(product_id,user_id,slot,source,shot_id,provider,endpoint,input,baked_texts,render_status,pi_operation_id)
       values(p_product_id,owner_id,job->>'slot','ai',(job->>'shot_id')::uuid,p_provider,job->>'endpoint',job->'input',job->'baked_texts','queued',op_id) returning id into image_id;
     ids:=ids||jsonb_build_array(image_id);
   end if;
 end loop;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('operation_id',op_id,'dry_run',p_dry_run,'status',case when p_dry_run then 'preview' else 'queued' end,
   'image_ids',ids,'estimated_usd',p_estimated,'requires_review',true,'warnings',jsonb_build_array('Estimación de imágenes, no un tope de facturación del proveedor. QA visual opcional se cobra aparte con tu clave Anthropic.', 'Sin reintentos automáticos de envíos ambiguos ni del QA. Revisa y decide en DropFlex.')));
 if not p_dry_run then
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,request_id,'generate_gallery_images',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('operation_id',op_id,'image_ids',ids));
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='generate_gallery_images' and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,'generate_gallery_images',p_key,p_hash,array['product_intelligence:read','landing:generate'],result,rev,request_id);
 end if;
 return result;
end $$;
create function public.pi_claim_gallery_image(p_image_id uuid) returns jsonb
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
   update public.page_images set render_status='failed',error_code='context_or_authorization_changed',error_message='Cambió el contexto o la autorización. Revisa el plan en el chat.',updated_at=now() where id=p_image_id;
   update public.pi_gallery_operations set status='cancelled',updated_at=now() where id=op.id;
   return null;
 end;
 update public.page_images set error_code='dispatching',updated_at=now() where id=p_image_id returning * into image;
 update public.pi_gallery_operations set status='running',updated_at=now() where id=op.id;
 return to_jsonb(image)||jsonb_build_object('pi_base_reference_id',op.base_reference_id);
end $$;
revoke all on function public.pi_gallery_operation_result(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pi_load_gallery_generation(jsonb,uuid,uuid,text,text,boolean),public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean,boolean),public.pi_claim_gallery_image(uuid) from public,anon,authenticated;
grant execute on function public.pi_load_gallery_generation(jsonb,uuid,uuid,text,text,boolean),public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean,boolean),public.pi_claim_gallery_image(uuid) to service_role;
