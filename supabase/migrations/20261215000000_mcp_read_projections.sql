-- Proyecciones internas. Las RPC anteriores y los contratos MCP permanecen invocables.
-- Los hashes conservan la representación completa original; no se cachea estado comercial.
CREATE OR REPLACE FUNCTION public.pi_pdp_state_with_snapshot(p_product_id uuid, p_owner_id uuid, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('enabled',(select pdp_persuasion_enabled from public.products where id=p_product_id and user_id=p_owner_id),
  'snapshot',p_snapshot,'landing',public.pi_landing_state(p_product_id,p_owner_id),
  'empty_etag',public.pi_snapshot_hash(jsonb_build_object('plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'etag',etag) order by id) from public.pi_persuasion_plans where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),'experiences',coalesce((select jsonb_agg(jsonb_build_object('id',id,'etag',etag) order by id) from public.pi_landing_experiences where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb))),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_persuasion_plans where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'experiences',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_landing_experiences where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('source',source,'id',id,'role',role,'slot',slot,'selected',selected)) order by source,id) from (
    select id,'reference'::text as source,'hero'::text as role,null::text as slot,null::boolean as selected from public.product_reference_images where product_id=p_product_id and user_id=p_owner_id and not excluded
    union all select id,'page_image','explanation',slot,is_selected from public.page_images where product_id=p_product_id and user_id=p_owner_id
     and source<>'reference' and render_status='succeeded' and status<>'rejected' and storage_path is not null
    union all select id,'ugc','demo',null::text,true from public.video_scripts where product_id=p_product_id and user_id=p_owner_id and superseded_at is null
     and final_status in ('approved','in_review','generated') and final_storage_path is not null
  ) a),'[]'::jsonb))
$function$;

create or replace function public.pi_pdp_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.pi_pdp_state_with_snapshot(p_product_id,p_owner_id,public.pi_context_snapshot(p_product_id))
$$;

create or replace function public.pi_visual_source_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with ctx as materialized (select public.pi_context_snapshot(p_product_id) as snapshot)
 select jsonb_build_object('context',ctx.snapshot,'pdp',public.pi_pdp_state_with_snapshot(p_product_id,p_owner_id,ctx.snapshot),
  'references',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.product_reference_images r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb),
  'gallery',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.page_image_runs r where r.product_id=p_product_id and r.user_id=p_owner_id and r.status='succeeded'),'[]'::jsonb),
  'gallery_shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.position,s.id) from public.page_image_shots s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null),'[]'::jsonb),
  'creative_concepts',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.creative_concepts c where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null),'[]'::jsonb),
  'scripts',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_scripts s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null),'[]'::jsonb),
  'video_shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_shots s where s.product_id=p_product_id and s.user_id=p_owner_id),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'etag',r.etag,'status',r.status,'payload',r.payload,'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id) from public.pi_visual_records r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb)) from ctx
$$;


create or replace function public.pi_landing_read_data(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('image_catalog',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'source',i.source) order by i.source,i.id) from (
   select id,'reference'::text as source from public.product_reference_images where product_id=p_product_id and user_id=p_owner_id and not excluded
   union all select id,'page_image'::text from public.page_images where product_id=p_product_id and user_id=p_owner_id and source<>'reference'
     and slot<>'gifs' and render_status='succeeded' and status<>'rejected' and storage_path is not null
   order by source,id limit 500) i),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',coalesce(r.body_edited,case when r.use_translation then coalesce(r.body_translated,r.body_original) else coalesce(r.body_original,r.body_translated) end,''),'rating',r.rating) order by r.id)
     from (select * from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0 order by position,id limit 30) r),'[]'::jsonb),
   'review_count',(select count(*) from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0))
$$;

create or replace function public.pi_read_landing_component(p_access jsonb,p_product_id uuid,p_component text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rows jsonb; selected_row jsonb; accent text;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 select page_accent_color into accent from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 -- El etag del conjunto usa todas las columnas y el mismo orden que pi_landing_state.
 select coalesce(jsonb_agg(to_jsonb(c) order by c.position,c.id),'[]'::jsonb),
   (jsonb_agg(to_jsonb(c) order by c.position,c.id) filter(where c.component=p_component))->0
 into rows,selected_row from public.page_components c
 where c.product_id=p_product_id and c.user_id=owner_id and c.superseded_at is null;
 return public.pi_landing_read_data(p_product_id,owner_id)||jsonb_build_object(
  'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
  'landing_etag',public.pi_snapshot_hash(rows),'context_stale',false,
  'rows',case when selected_row is null then '[]'::jsonb else jsonb_build_array(selected_row) end,
  'snapshot',jsonb_build_object(
    'pricing',(select to_jsonb(r)-'created_at'-'updated_at'-'user_id'-'product_id' from public.product_pricing r where r.product_id=p_product_id and r.user_id=owner_id),
    'settings',(select to_jsonb(s)-'user_id'-'updated_at'-'ai_cost_cap' from public.merchant_settings s where s.user_id=owner_id)),
  'page_accent_color',accent);
end $$;

create or replace function public.pi_read_visual_operation(p_access jsonb,p_product_id uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; raw jsonb; op jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 -- El stamp cubre todo el estado fuente. No se puede reemplazar por hashes parciales.
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 if jsonb_array_length(raw->'records')>1000 then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 -- Misma autorización y orden de locks que pi_visual_operation, sin fuentes o credenciales de la ingestión.
 select jsonb_build_object('id',o.id,'kind',o.kind,'iteration_id',o.iteration_id,'status',o.status,
   'expires_at',o.expires_at,'result',o.result,'error_message',o.error_message)
 into op from public.pi_visual_operations o where o.id=p_operation_id and o.product_id=p_product_id and o.user_id=owner_id for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 return jsonb_build_object('revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw),'operation',op);
end $$;

create or replace function public.pi_read_visual(p_access jsonb,p_product_id uuid,p_tool text default null,p_key text default null,
 p_hash text default null,p_dry_run boolean default false,p_snapshot_id uuid default null,p_paginate boolean default false,p_history boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; raw jsonb; result jsonb; receipt public.pi_visual_receipts; sid uuid; effective jsonb; expiry timestamptz;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_tool is not null then perform public.pi_authorize_context(p_access,'product_intelligence:write'); end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_tool is not null then perform public.pi_authorize_context(p_access,'product_intelligence:write'); end if;
 if p_tool is not null and not p_dry_run then
  select * into receipt from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return jsonb_build_object('replay',receipt.result);
  end if;
 end if;
 if p_snapshot_id is not null then
  -- Comparte snapshots con el lector anterior y siempre reautoriza el permiso vigente.
  select snapshot into result from public.pi_visual_read_snapshots where id=p_snapshot_id and product_id=p_product_id and user_id=owner_id and actor_id=p_access->>'actor_id' and expires_at>clock_timestamp();
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  return result;
 end if;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 if jsonb_array_length(raw->'records')>1000 then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 effective:=p_access->'scopes'; expiry:=clock_timestamp()+interval '1 hour';
 if p_access->>'actor_kind'='delegated' then
  select to_jsonb(array(select jsonb_array_elements_text(p_access->'scopes') intersect select unnest(g.scopes))),g.expires_at
   into effective,expiry from public.pi_access_grants g where user_id=owner_id and client_id=(p_access->>'client_id')::uuid;
 end if;
 result:=jsonb_build_object('product_id',p_product_id,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
  'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw),'records',raw->'records',
  -- context y records están ya en sus campos canónicos; no se transfieren duplicados.
  'source',jsonb_set(raw-'context'-'records','{pdp}',(raw->'pdp')-'snapshot'),
  'history',case when p_history then coalesce((select jsonb_agg(v.record order by v.created_at,v.version) from public.pi_visual_versions v where v.product_id=p_product_id and v.user_id=owner_id),'[]'::jsonb) else '[]'::jsonb end,
  'files',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.pi_visual_files f where f.product_id=p_product_id and f.user_id=owner_id),'[]'::jsonb),
  'knowledge_projection',jsonb_build_object('snapshot',raw->'context','stamp',public.pi_snapshot_hash(raw->'context'),'effective_scopes',effective,'grant_expires_at',expiry));
 if p_paginate then
  -- Una escritura; mismo TTL y permisos. Los clientes anteriores pueden leer este snapshot.
  -- Mantener el envelope de conocimiento anterior en snapshots para compatibilidad cruzada.
  result:=(result-'knowledge_projection')||jsonb_build_object('source',raw,'knowledge',jsonb_build_object(
    'revision',result->'revision','current_revision',result->'revision','snapshot',raw->'context',
    'stamp',public.pi_snapshot_hash(raw->'context'),'current_snapshot',raw->'context','current_knowledge',raw->'context'->'knowledge',
    'internal_references',public.pi_internal_references(p_product_id,owner_id),'effective_scopes',effective,
    'grant_expires_at',expiry,'requested_strategy',null));
  sid:=gen_random_uuid(); result:=result||jsonb_build_object('snapshot_id',sid);
  insert into public.pi_visual_read_snapshots(id,product_id,user_id,actor_id,snapshot) values(sid,p_product_id,owner_id,p_access->>'actor_id',result);
 end if;
 return result;
end $$;

revoke all on function public.pi_pdp_state_with_snapshot(uuid,uuid,jsonb),public.pi_landing_read_data(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pi_read_landing_component(jsonb,uuid,text),public.pi_read_visual_operation(jsonb,uuid,uuid),
 public.pi_read_visual(jsonb,uuid,text,text,text,boolean,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.pi_read_landing_component(jsonb,uuid,text),public.pi_read_visual_operation(jsonb,uuid,uuid),
 public.pi_read_visual(jsonb,uuid,text,text,text,boolean,uuid,boolean,boolean) to service_role;
