-- Las referencias a la nueva versión de identidad se validan en el mismo batch CAS.
-- Cada candidato conserva las validaciones de dueño, aprobación delegada y versión del commit.
create function public.pi_validate_visual_record_batch(p_access jsonb,p_product_id uuid,p_record jsonb,p_batch jsonb) returns void
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare owner_id uuid:=(p_access->>'user_id')::uuid; visual_payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(visual_payload) is distinct from 'object' or octet_length(visual_payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_access->>'actor_kind'<>'merchant' and not public.pi_shopify_visual_approval_allowed(p_access,p_product_id,p_record) and ((p_record->>'status' in ('approved','selected','rejected','in_review') and kind<>'iteration') or kind='review' or (p_record->>'status'='archived' and (kind<>'binding' or exists(select 1 from public.pi_visual_records where id=(p_record->>'id')::uuid and status='selected')))) then raise exception 'PI_FORBIDDEN'; end if;
 if kind='identity' then
  if not exists(select 1 from public.product_reference_images where id=(visual_payload->>'canonical_reference_image_id')::uuid and product_id=p_product_id and user_id=owner_id and not excluded) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if (select id from public.product_reference_images where product_id=p_product_id and user_id=owner_id and not excluded order by is_base desc,is_cover desc,position,id limit 1) is distinct from (visual_payload->>'canonical_reference_image_id')::uuid then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif kind='plan' then
  if not exists(select 1 from public.pi_strategy_versions where id=(visual_payload->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  for ref in select value from jsonb_array_elements(visual_payload->'shots') loop
   if ref->>'angle_id' is not null and not exists(select 1 from public.pi_angles where id=(ref->>'angle_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if ref->'persuasion_plan_ref'->>'id' is not null and not exists(select 1 from public.pi_persuasion_plans where id=(ref->'persuasion_plan_ref'->>'id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
  if jsonb_array_length(visual_payload->'shots') not between 1 and 30 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='asset' then
  if p_access->>'actor_kind'<>'merchant' and p_record->>'status'<>'generated' and not public.pi_shopify_visual_approval_allowed(p_access,p_product_id,p_record) then raise exception 'PI_FORBIDDEN'; end if;
  if not exists(select 1 from public.pi_visual_files where id=(visual_payload->>'file_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if visual_payload->>'representation'='real_evidence' and visual_payload->>'source_system'<>'manual' then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='binding' then
  -- Quitar un uso obsoleto es válido aunque su destino ya esté deshabilitado.
  if p_record->>'status'='archived' or (p_record->>'status'='proposed' and exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.status='selected')) then
   if not exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.user_id=owner_id and r.kind='binding'
    and r.payload->'target'=visual_payload->'target' and r.payload->>'asset_id'=visual_payload->>'asset_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
  else perform public.pi_visual_validate_target(p_product_id,owner_id,visual_payload->'target'); end if;
  select * into row from public.pi_visual_records where id=(visual_payload->>'asset_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset';
  if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_record->>'status'='selected' and (row.status<>'approved' or row.payload->>'archived_at' is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='review' then
  if not exists(select 1 from public.pi_visual_records where id=(visual_payload->>'subject_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 for ref in select visual_payload->'identity_ref' union all select visual_payload->'plan_ref' loop
  if ref is not null and ref<>'null'::jsonb and not exists(select 1 from public.pi_visual_versions where record_id=(ref->>'id')::uuid and product_id=p_product_id and user_id=owner_id and version=(ref->>'version')::bigint and record->>'etag'=ref->>'etag')
   and not exists(select 1 from jsonb_array_elements(p_batch) b where b->>'id'=ref->>'id' and b->>'version'=ref->>'version' and b->>'etag'=ref->>'etag'
    and b->>'kind'=case when ref=visual_payload->'identity_ref' then 'identity' else 'plan' end)
   then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(coalesce(visual_payload->'reference_asset_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.pi_visual_records where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
end $$;

create or replace function public.pi_validate_visual_record(p_access jsonb,p_product_id uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.pi_validate_visual_record_batch(p_access,p_product_id,p_record,'[]'::jsonb); end $$;
create or replace function public.pi_commit_visual(p_access jsonb,p_product_id uuid,p_tool text,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_dry_run boolean default false,p_operation jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
 if p_tool not in ('save_visual_identity','save_visual_generation_plan','prepare_visual_iteration','record_visual_iteration_result','prepare_visual_asset_upload','ingest_external_visual_asset','bind_visual_asset','unbind_visual_asset','save_visual_reconciliation','save_visual_binding_suggestions','review_visual_record') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_tool='review_visual_record' and p_access->>'actor_kind'<>'merchant' and not public.pi_shopify_automation_active(p_access,p_product_id) then raise exception 'PI_FORBIDDEN'; end if;
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
  select * into receipt from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(raw) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>40 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 for candidate in select value from jsonb_array_elements(p_records) loop
  select * into old from public.pi_visual_records where id=(candidate->>'id')::uuid;
  if found and (old.product_id<>p_product_id or old.user_id<>owner_id or old.kind<>candidate->>'kind') then raise exception 'PI_INVALID_REFERENCE'; end if;
  if found and candidate->>'etag'=old.etag then continue; end if;
  if (candidate->>'version')::bigint is distinct from coalesce(old.version,0)+1 then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  if not found and (select count(*) from public.pi_visual_records where product_id=p_product_id)>=1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  if old.kind='review' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if old.kind='asset' and candidate->>'status' in ('rejected','archived') and exists(select 1 from public.pi_visual_records b where b.product_id=p_product_id and b.kind='binding' and b.status='selected' and b.payload->>'asset_id'=old.id::text) then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  perform public.pi_validate_visual_record_batch(p_access,p_product_id,candidate,p_records);
  changes:=changes||jsonb_build_array(candidate); changed:=true;
 end loop;
 -- The etag is the read collection or the single edited head; version CAS checks every batch member.
 if p_etag is distinct from public.pi_snapshot_hash(raw->'records') and not exists(select 1 from public.pi_visual_records where product_id=p_product_id and user_id=owner_id and etag=p_etag) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_operation is not null then
  if p_operation->>'kind' not in ('upload','ingest') or not exists(select 1 from public.pi_visual_records where id=(p_operation->>'iteration_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='iteration' and status in ('prepared','result_recorded')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  op_id:=(p_operation->>'id')::uuid;
 end if;
 if p_dry_run then return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',false,'dry_run',true,'records',changes,'etag',p_etag,'dependency_stamp',p_stamp)); end if;
 for candidate in select value from jsonb_array_elements(changes) loop
  insert into public.pi_visual_records(id,product_id,user_id,kind,version,etag,status,payload,created_at,updated_at)
   values((candidate->>'id')::uuid,p_product_id,owner_id,candidate->>'kind',(candidate->>'version')::bigint,candidate->>'etag',candidate->>'status',candidate->'payload',(candidate->>'created_at')::timestamptz,(candidate->>'updated_at')::timestamptz)
   on conflict(id) do update set version=excluded.version,etag=excluded.etag,status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at;
  insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values((candidate->>'id')::uuid,p_product_id,owner_id,(candidate->>'version')::bigint,candidate,p_access->>'actor_id');
 end loop;
 if p_operation is not null then
  insert into public.pi_visual_operations(id,product_id,user_id,kind,iteration_id,access,source,status)
   values(op_id,p_product_id,owner_id,p_operation->>'kind',(p_operation->>'iteration_id')::uuid,p_access,p_operation->'source','pending');
 end if;
 if changed then
  insert into public.product_intelligence(product_id,user_id,revision) values(p_product_id,owner_id,1)
   on conflict(product_id) do update set revision=public.product_intelligence.revision+1,updated_at=clock_timestamp() returning revision into rev;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev,public.pi_context_snapshot(p_product_id),public.pi_snapshot_hash(public.pi_context_snapshot(p_product_id)),p_access->>'actor_id');
 end if;
 for candidate in select value from jsonb_array_elements(changes) loop
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,
    case when candidate->>'kind'='binding' then case when candidate->>'status'='selected' then 'visual_asset.bound' else 'visual_asset.unbound' end
     when candidate->>'kind'='review' then 'visual_review.recorded'
     else 'visual_'||(candidate->>'kind')||'.'||case when (candidate->>'version')::int=1 then 'created' when candidate->>'status' in ('approved','rejected','archived') then candidate->>'status' else 'updated' end end,
    p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,
    jsonb_build_object('record_id',candidate->>'id','version',candidate->'version','status',candidate->>'status'));
 end loop;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw)));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $$;

revoke all on function public.pi_validate_visual_record_batch(jsonb,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pi_validate_visual_record_batch(jsonb,uuid,jsonb,jsonb) to service_role;
