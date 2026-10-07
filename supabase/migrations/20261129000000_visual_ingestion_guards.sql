-- Finalización idempotente e integridad de los derivados.
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
create function public.pi_guard_visual_rendition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.products where id=new.product_id and user_id=new.user_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 return new;
end $$;
create trigger pi_visual_rendition_guard before insert or update on public.pi_visual_renditions for each row execute function public.pi_guard_visual_rendition();
revoke all on function public.pi_guard_visual_rendition() from public,anon,authenticated,service_role;
