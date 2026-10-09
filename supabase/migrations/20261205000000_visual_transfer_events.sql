-- Diagnóstico operativo: usa la auditoría existente (cascade hacia products).
-- No modifica la revisión de negocio ni conserva URLs, tokens o IDs de archivo del host.
create unique index pi_visual_transfer_event_unique on public.pi_audit_events(product_id,request_id)
 where operation like 'visual_transfer.%';

create function public.pi_visual_transfer(p_access jsonb,p_product_id uuid,p_event jsonb default null,p_attempt_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; event_id uuid; prior public.pi_audit_events; events jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_event is null then
  select coalesce(jsonb_agg(t.diff||jsonb_build_object('created_at',t.created_at) order by t.created_at desc),'[]'::jsonb) into events
   from (select diff,created_at from public.pi_audit_events where product_id=p_product_id and user_id=owner_id
    and operation like 'visual_transfer.%' and (p_attempt_id is null or diff->>'attempt_id'=p_attempt_id::text) order by created_at desc limit 50) t;
  return jsonb_build_object('ok',true,'request_id',gen_random_uuid(),'product_id',p_product_id,'revision',rev,'data',jsonb_build_object('events',events));
 end if;
 if jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>2000
  or exists(select 1 from jsonb_each(p_event) e where e.value='null'::jsonb)
  or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('event_id','attempt_id','stage','state','duration_ms','reference_image_id','reference_content_hash','iteration_id','operation_id','error_code','tool','reported_by'))
  or not p_event ?& array['event_id','attempt_id','stage','state','duration_ms','reported_by']
  or p_event->>'stage' not in ('reference_download','host_upload','followup','tool_execution','ingestion')
  or p_event->>'state' not in ('started','succeeded','failed') or p_event->>'reported_by' not in ('widget','server')
  or jsonb_typeof(p_event->'duration_ms') is distinct from 'number'
  or (p_event->>'duration_ms')::numeric not between 0 and 300000
  or (p_event->>'duration_ms')::numeric<>trunc((p_event->>'duration_ms')::numeric)
  or (p_event ? 'error_code' and p_event->>'error_code' !~ '^[A-Z_]{1,80}$')
  or (p_event ? 'tool' and p_event->>'tool' !~ '^[a-z_]{1,80}$')
  or (p_event ? 'reference_content_hash' and p_event->>'reference_content_hash' !~ '^[a-f0-9]{64}$') then raise exception 'PI_VALIDATION_ERROR'; end if;
 event_id:=(p_event->>'event_id')::uuid;
 if event_id is null or (p_event->>'attempt_id')::uuid is null then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_event ? 'reference_image_id' and not exists(select 1 from public.product_reference_images where id=(p_event->>'reference_image_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_event ? 'iteration_id' and not exists(select 1 from public.pi_visual_records where id=(p_event->>'iteration_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='iteration') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_event ? 'operation_id' and not exists(select 1 from public.pi_visual_operations where id=(p_event->>'operation_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select * into prior from public.pi_audit_events where product_id=p_product_id and request_id=event_id and operation like 'visual_transfer.%';
 if found then
  if prior.diff is distinct from p_event or prior.actor_id is distinct from p_access->>'actor_id' then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
 else
  if (select count(*) from public.pi_audit_events where product_id=p_product_id and operation like 'visual_transfer.%' and created_at>clock_timestamp()-interval '1 hour')>=1000 then raise exception 'PI_RATE_LIMITED'; end if;
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,event_id,'visual_transfer.'||(p_event->>'stage'),p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,p_event)
   on conflict(product_id,request_id) where operation like 'visual_transfer.%' do nothing;
  select * into prior from public.pi_audit_events where product_id=p_product_id and request_id=event_id and operation like 'visual_transfer.%';
  if prior.diff is distinct from p_event or prior.actor_id is distinct from p_access->>'actor_id' then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
 end if;
 return jsonb_build_object('ok',true,'request_id',event_id,'product_id',p_product_id,'revision',rev,'data',jsonb_build_object('event_id',event_id,'recorded',true));
end $$;
revoke all on function public.pi_visual_transfer(jsonb,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pi_visual_transfer(jsonb,uuid,jsonb,uuid) to service_role;
