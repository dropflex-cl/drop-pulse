-- Arrays de ejecución sobre page_components; sin tablas ni assets nuevos.
create or replace function public.pi_validate_landing_variants(p_content jsonb,p_product_id uuid,p_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare variant jsonb; image jsonb;
begin
 if jsonb_typeof(p_content)='object' then return; end if;
 if jsonb_typeof(p_content) is distinct from 'array' or jsonb_array_length(p_content) not between 1 and 12 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if (select count(*) from jsonb_array_elements(p_content) v where v->>'key'='default' and v->'angle_id'='null'::jsonb and v->'hook_id'='null'::jsonb)<>1
   or (select count(distinct v->>'key') from jsonb_array_elements(p_content) v)<>jsonb_array_length(p_content)
   or (select count(distinct jsonb_build_array(v->'angle_id',v->'hook_id')) from jsonb_array_elements(p_content) v)<>jsonb_array_length(p_content) then raise exception 'PI_VALIDATION_ERROR'; end if;
 for variant in select value from jsonb_array_elements(p_content) loop
   if jsonb_typeof(variant) is distinct from 'object' or jsonb_typeof(variant->'content') is distinct from 'object'
     or not (variant ?& array['key','angle_id','hook_id','content']) or variant->>'key' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or (variant->'angle_id'<>'null'::jsonb and (jsonb_typeof(variant->'angle_id')<>'string' or variant->>'angle_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'))
     or (variant->'hook_id'<>'null'::jsonb and (variant->'angle_id'='null'::jsonb or jsonb_typeof(variant->'hook_id')<>'string' or variant->>'hook_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'))
     or ((variant->>'key'='default') is distinct from (variant->'angle_id'='null'::jsonb and variant->'hook_id'='null'::jsonb)) then raise exception 'PI_VALIDATION_ERROR'; end if;
   if variant ? 'images' then
     if jsonb_typeof(variant->'images') is distinct from 'array' or jsonb_array_length(variant->'images')>30 then raise exception 'PI_VALIDATION_ERROR'; end if;
     for image in select value from jsonb_array_elements(variant->'images') loop
       if not exists(select 1 from jsonb_array_elements(public.pi_landing_state(p_product_id,p_owner_id)->'image_catalog') i
         where i->>'id'=image->>'id' and i->>'source'=image->>'source') then raise exception 'PI_INVALID_REFERENCE'; end if;
     end loop;
   end if;
 end loop;
end $$;
create or replace function public.pi_landing_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('image_catalog',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'source',i.source) order by i.source,i.id) from (
   select id,'reference'::text as source from public.product_reference_images where product_id=p_product_id and user_id=p_owner_id and not excluded
   union all select id,'page_image'::text from public.page_images where product_id=p_product_id and user_id=p_owner_id and source<>'reference'
     and slot<>'gifs' and render_status='succeeded' and status<>'rejected' and storage_path is not null
   order by source,id limit 500) i),'[]'::jsonb), 'rows',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.page_components c
   where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',coalesce(r.body_edited,case when r.use_translation then coalesce(r.body_translated,r.body_original) else coalesce(r.body_original,r.body_translated) end,''),'rating',r.rating) order by r.id)
     from (select * from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0 order by position,id limit 30) r),'[]'::jsonb),
   'review_count',(select count(*) from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0),
   'active_runs',coalesce((select jsonb_agg(id order by id) from public.copy_runs where product_id=p_product_id and user_id=p_owner_id and status in ('queued','running')),'[]'::jsonb))
$$;

create or replace function public.pi_commit_landing(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 run_id uuid; request_id uuid:=gen_random_uuid(); part jsonb; existing public.page_components; component_id uuid; items jsonb:='[]'::jsonb;
 ids text[]:=array['listing','review-stars','benefit-usps','inventory','shipping-timeline','benefit-double-box','gif-strip','review-slider',
 'ugc-slider','pain-block','stats-with-image','scrolling-benefits','image-with-benefits','insta-story','review-wall','comparison-table','faq-and-text'];
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 -- Bloquear reseñas y contenido durante la validación final. Mutaciones de página se serializan con el producto.
 perform 1 from public.product_reviews where product_id=p_product_id and user_id=owner_id for share;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from public.pi_snapshot_hash(state->'rows') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if jsonb_array_length(state->'active_runs')>0 then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 17
   or octet_length(p_entries::text)>262144 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not (e->>'component'=any(ids)) or jsonb_typeof(e->'content') not in ('object','array'))
   or (select count(distinct e->>'component') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   run_id:=gen_random_uuid();
   insert into public.copy_runs(id,product_id,user_id,status,input,payload,started_at,finished_at)
     values(run_id,p_product_id,owner_id,'succeeded',jsonb_build_object('source','mcp_chat','contract_version','1.1','analysis_revision',rev,
       'actor_id',p_access->>'actor_id','snapshot',snap),jsonb_build_object('entries',p_entries),now(),now());
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
   perform public.pi_validate_landing_variants(part->'content',p_product_id,owner_id);
   if part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   if not p_dry_run then
     select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,enabled,images,status)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',part->>'component'='listing',coalesce(existing.images,'[]'::jsonb),'generated');
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status','generated'));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action','Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.'));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;


-- CAS de revisión: el lock del producto y el snapshot cierran la carrera MCP/UI/contexto.
create or replace function public.pi_review_landing(p_access jsonb,p_product_id uuid,p_component text,p_id uuid,p_updated_at timestamptz,p_stamp text,p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; row public.page_components; pending_content jsonb; approving boolean;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 select * into row from public.page_components where id=p_id and product_id=p_product_id and user_id=owner_id and component=p_component and superseded_at is null for update;
 if not found or row.updated_at is distinct from p_updated_at then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 if public.pi_snapshot_hash(jsonb_build_array(state,snap)) is distinct from p_stamp then raise exception 'PI_REVISION_CONFLICT'; end if;
 pending_content:=case when p_patch ? 'content' then p_patch->'content' else coalesce(row.content,row.proposal) end;
 approving:=coalesce((p_patch->>'approve')::boolean,false) or p_patch ? 'content' or p_patch ? 'images' or p_patch->>'enabled'='true';
 if approving then perform public.pi_validate_landing_variants(pending_content,p_product_id,owner_id); end if;
 update public.page_components set
   content=case when p_patch ? 'content' then case when pending_content=proposal then null else pending_content end else page_components.content end,
   images=case when p_patch ? 'images' then p_patch->'images' else images end,
   enabled=case when p_component='listing' then true when p_patch ? 'enabled' then (p_patch->>'enabled')::boolean when approving then true else enabled end,
   status=case when approving then 'approved'::public.content_status else status end,
   decided_at=case when approving then clock_timestamp() else decided_at end, updated_at=clock_timestamp()
 where id=p_id and user_id=owner_id;
end $$;
revoke all on function public.pi_validate_landing_variants(jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pi_review_landing(jsonb,uuid,text,uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.pi_review_landing(jsonb,uuid,text,uuid,timestamptz,text,jsonb) to service_role;
