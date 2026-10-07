create or replace function public.pi_complete_visual_ingestion(p_operation_id uuid,p_token uuid,p_file jsonb,p_asset jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.pi_visual_operations; owner_id uuid; file_id uuid; asset_id uuid; record jsonb; ingestion_result jsonb; it public.pi_visual_records; rev bigint;
begin
 -- Same lock order as deletion and writers: product before operation.
 select * into op from public.pi_visual_operations where id=p_operation_id;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform 1 from public.products where id=op.product_id and user_id=op.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into op from public.pi_visual_operations where id=p_operation_id for update;
 if op.status='succeeded' then return op.result; end if;
 if op.lease_token is distinct from p_token or op.status<>'processing' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_error is not null then
  update public.pi_visual_operations set status='failed',source='{}',error_message=left(p_error,2000),updated_at=clock_timestamp() where id=op.id;
  return jsonb_build_object('error',left(p_error,2000));
 end if;
 owner_id:=public.pi_authorize_context(op.access,'product_intelligence:write');
 select * into it from public.pi_visual_records where id=op.iteration_id and product_id=op.product_id and user_id=owner_id and kind='iteration';
 if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
 select id into file_id from public.pi_visual_files where product_id=op.product_id and user_id=owner_id and sha256=p_file->>'sha256';
 if file_id is null then
  file_id:=(p_file->>'id')::uuid;
  insert into public.pi_visual_files(id,product_id,user_id,bucket,storage_path,sha256,original_sha256,mime_type,width,height,size_bytes)
   values(file_id,op.product_id,owner_id,p_file->>'bucket',p_file->>'storage_path',p_file->>'sha256',p_file->>'original_sha256',p_file->>'mime_type',(p_file->>'width')::int,(p_file->>'height')::int,(p_file->>'size_bytes')::bigint);
 end if;
 select id into asset_id from public.pi_visual_records where product_id=op.product_id and user_id=owner_id and kind='asset' and payload->>'semantic_hash'=p_asset->'payload'->>'semantic_hash' limit 1;
 if asset_id is null then
 if (select count(*) from public.pi_visual_records where product_id=op.product_id and kind='asset')>=200 or (select count(*) from public.pi_visual_records where product_id=op.product_id)>=1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 asset_id:=(p_asset->>'id')::uuid;
 record:=jsonb_set(p_asset,'{payload,file_id}',to_jsonb(file_id));
 if record->'payload'->>'iteration_id' is distinct from it.id::text or record->>'status'<>'generated' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if record->'payload'->'identity_ref' is distinct from it.payload->'identity_ref' or record->'payload'->'dependencies' is distinct from it.payload->'dependencies' then raise exception 'PI_INVALID_REFERENCE'; end if;
 perform public.pi_validate_visual_record(op.access,op.product_id,record);
 insert into public.pi_visual_records(id,product_id,user_id,kind,version,etag,status,payload) values(asset_id,op.product_id,owner_id,'asset',1,record->>'etag','generated',record->'payload');
 insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values(asset_id,op.product_id,owner_id,1,record,op.access->>'actor_id');
 end if;
 record:=jsonb_build_object('id',it.id,'kind','iteration','version',it.version+1,'status','result_recorded','payload',it.payload||jsonb_build_object('result_asset_ids',coalesce(it.payload->'result_asset_ids','[]'::jsonb)||to_jsonb(asset_id)),
   'created_at',it.created_at,'updated_at',clock_timestamp());
 record:=record||jsonb_build_object('etag',public.pi_snapshot_hash(record));
 update public.pi_visual_records set version=it.version+1,status='result_recorded',payload=record->'payload',etag=record->>'etag',updated_at=clock_timestamp() where id=it.id;
 insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values(it.id,op.product_id,owner_id,it.version+1,record,op.access->>'actor_id');
 update public.product_intelligence set revision=revision+1,updated_at=clock_timestamp() where product_id=op.product_id returning revision into rev;
 insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(op.product_id,owner_id,rev,public.pi_context_snapshot(op.product_id),public.pi_snapshot_hash(public.pi_context_snapshot(op.product_id)),op.access->>'actor_id');
 ingestion_result:=jsonb_build_object('asset_id',asset_id,'file_id',file_id,'revision',rev);
 update public.pi_visual_operations set status='succeeded',result=ingestion_result,source='{}',updated_at=clock_timestamp() where id=op.id;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(op.product_id,owner_id,op.id,'visual_asset.ingested',op.access->>'actor_id',(op.access->>'client_id')::uuid,rev-1,rev,ingestion_result);
 return ingestion_result;
end $$;

create or replace function public.pi_commit_visual(p_access jsonb,p_product_id uuid,p_tool text,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_dry_run boolean default false,p_operation jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
 if p_tool not in ('save_visual_identity','save_visual_generation_plan','prepare_visual_iteration','record_visual_iteration_result','prepare_visual_asset_upload','ingest_external_visual_asset','bind_visual_asset','unbind_visual_asset','save_visual_reconciliation','save_visual_binding_suggestions','review_visual_record') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_tool='review_visual_record' and p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
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
  perform public.pi_validate_visual_record(p_access,p_product_id,candidate);
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

-- Workers can only terminalize revoked requests; this function never creates an asset.
create function public.pi_cancel_revoked_visual_operation(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare op public.pi_visual_operations; revoked boolean:=false;
begin
 select * into op from public.pi_visual_operations where id=p_id and kind='ingest';
 if not found then return false; end if;
 perform 1 from public.products where id=op.product_id and user_id=op.user_id and pi_deleting_at is null for share;
 if not found then return false; end if;
 select * into op from public.pi_visual_operations where id=p_id for update;
 if op.status not in ('pending','processing') or (op.status='processing' and op.lease_at>clock_timestamp()-interval '2 minutes') then return false; end if;
 begin perform public.pi_authorize_context(op.access,'product_intelligence:write');
 exception when others then revoked:=true; end;
 if not revoked then return false; end if;
 update public.pi_visual_operations set status='failed',source='{}',error_message='El permiso de la conversación fue revocado. Prepara otra subida desde una conexión vigente.',updated_at=clock_timestamp() where id=op.id;
 return true;
end $$;
revoke all on function public.pi_cancel_revoked_visual_operation(uuid) from public,anon,authenticated;
grant execute on function public.pi_cancel_revoked_visual_operation(uuid) to service_role;
