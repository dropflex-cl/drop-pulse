-- Producción externa: versiones y archivos privados; sin proveedores generativos.
create table public.pi_visual_records (
 id uuid primary key, product_id uuid not null, user_id uuid not null,
 kind text not null check(kind in ('identity','plan','iteration','asset','binding','review')),
 version bigint not null check(version between 1 and 9007199254740991), etag text not null check(etag ~ '^[a-f0-9]{64}$'),
 status text not null, payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=120000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,product_id,user_id), foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade
);
create index pi_visual_records_product on public.pi_visual_records(product_id,kind,created_at,id);
create table public.pi_visual_versions (
 record_id uuid not null, product_id uuid not null, user_id uuid not null, version bigint not null,
 record jsonb not null, actor_id text not null, created_at timestamptz not null default now(), primary key(record_id,version),
 foreign key(record_id,product_id,user_id) references public.pi_visual_records(id,product_id,user_id) on delete cascade
);
create table public.pi_visual_files (
 id uuid primary key, product_id uuid not null, user_id uuid not null, bucket text not null check(bucket in ('page-media','creative-media')),
 storage_path text not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 mime_type text not null check(mime_type in ('image/webp','image/jpeg')), width integer not null check(width>0),height integer not null check(height>0),size_bytes bigint not null check(size_bytes>0),
 created_at timestamptz not null default now(), unique(id,product_id,user_id),unique(product_id,user_id,sha256),unique(bucket,storage_path),
 foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade,
 check(storage_path like user_id::text||'/'||product_id::text||'/visual-%')
);
create table public.pi_visual_operations (
 id uuid primary key, product_id uuid not null, user_id uuid not null, kind text not null check(kind in ('upload','ingest')),
 iteration_id uuid not null, access jsonb not null, source jsonb not null, status text not null check(status in ('pending','processing','succeeded','failed')),
 result jsonb, error_message text, lease_token uuid, lease_at timestamptz, expires_at timestamptz not null default now()+interval '15 minutes',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,product_id,user_id), foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade,
 foreign key(iteration_id,product_id,user_id) references public.pi_visual_records(id,product_id,user_id) on delete cascade
);
create index pi_visual_pending on public.pi_visual_operations(status,updated_at);
create table public.pi_visual_receipts (
 product_id uuid not null,user_id uuid not null,tool text not null,idempotency_key text not null,payload_hash text not null,result jsonb not null,
 expires_at timestamptz not null default now()+interval '30 days', primary key(user_id,product_id,tool,idempotency_key),
 foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade,
 check(idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$' and payload_hash ~ '^[a-f0-9]{64}$')
);
create table public.pi_visual_read_snapshots (
 id uuid primary key default gen_random_uuid(),product_id uuid not null,user_id uuid not null,actor_id text not null,
 snapshot jsonb not null,expires_at timestamptz not null default now()+interval '15 minutes',
 foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade
);
create trigger pi_visual_history_immutable before update or delete on public.pi_visual_versions for each row execute function public.pi_immutable_context_history();
do $$ declare t text; begin
 foreach t in array array['pi_visual_records','pi_visual_versions','pi_visual_files','pi_visual_operations','pi_visual_receipts','pi_visual_read_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.pi_visual_source_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('context',public.pi_context_snapshot(p_product_id),'pdp',public.pi_pdp_state(p_product_id,p_owner_id),
  'references',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.product_reference_images r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb),
  'gallery',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.page_image_runs r where r.product_id=p_product_id and r.user_id=p_owner_id and r.status='succeeded'),'[]'::jsonb),
  'creative_concepts',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.creative_concepts c where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null),'[]'::jsonb),
  'scripts',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_scripts s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null),'[]'::jsonb),
  'video_shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_shots s where s.product_id=p_product_id and s.user_id=p_owner_id),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'etag',r.etag,'status',r.status,'payload',r.payload,'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id) from public.pi_visual_records r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb))
$$;
create function public.pi_load_visual(p_access jsonb,p_product_id uuid,p_tool text default null,p_key text default null,p_hash text default null,p_dry_run boolean default false,p_snapshot_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; raw jsonb; result jsonb; receipt public.pi_visual_receipts; sid uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_tool is not null then perform public.pi_authorize_context(p_access,'product_intelligence:write'); end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if p_tool is not null and not p_dry_run then
  select * into receipt from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return jsonb_build_object('replay',receipt.result);
  end if;
 end if;
 if p_snapshot_id is not null then
  select snapshot into result from public.pi_visual_read_snapshots where id=p_snapshot_id and product_id=p_product_id and user_id=owner_id and actor_id=p_access->>'actor_id' and expires_at>clock_timestamp();
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  return result;
 end if;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 if jsonb_array_length(raw->'records')>1000 then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 result:=jsonb_build_object('product_id',p_product_id,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
  'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw),'records',raw->'records','source',raw,
  'history',coalesce((select jsonb_agg(v.record order by v.created_at,v.version) from public.pi_visual_versions v where v.product_id=p_product_id and v.user_id=owner_id),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.pi_visual_files f where f.product_id=p_product_id and f.user_id=owner_id),'[]'::jsonb),
  'knowledge',public.pi_load_knowledge(p_access,p_product_id));
 insert into public.pi_visual_read_snapshots(product_id,user_id,actor_id,snapshot) values(p_product_id,owner_id,p_access->>'actor_id',result) returning id into sid;
 result:=result||jsonb_build_object('snapshot_id',sid);
 update public.pi_visual_read_snapshots set snapshot=result where id=sid;
 return result;
end $$;

-- Validación independiente de pertenencia y transiciones. El servicio agrega las reglas semánticas.
create function public.pi_validate_visual_record(p_access jsonb,p_product_id uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=(p_access->>'user_id')::uuid; payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_access->>'actor_kind'<>'merchant' and ((p_record->>'status' in ('approved','selected','rejected','archived','in_review') and kind<>'iteration') or kind='review') then raise exception 'PI_FORBIDDEN'; end if;
 if kind='identity' then
  if not exists(select 1 from public.product_reference_images where id=(payload->>'canonical_reference_image_id')::uuid and product_id=p_product_id and user_id=owner_id and not excluded) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if (select id from public.product_reference_images where product_id=p_product_id and user_id=owner_id and not excluded order by is_base desc,is_cover desc,position,id limit 1) is distinct from (payload->>'canonical_reference_image_id')::uuid then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif kind='plan' then
  if not exists(select 1 from public.pi_strategy_versions where id=(payload->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  for ref in select value from jsonb_array_elements(payload->'shots') loop
   if ref->>'angle_id' is not null and not exists(select 1 from public.pi_angles where id=(ref->>'angle_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if ref->'persuasion_plan_ref'->>'id' is not null and not exists(select 1 from public.pi_persuasion_plans where id=(ref->'persuasion_plan_ref'->>'id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
  if jsonb_array_length(payload->'shots') not between 1 and 30 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='asset' then
  if p_access->>'actor_kind'<>'merchant' and p_record->>'status'<>'generated' then raise exception 'PI_FORBIDDEN'; end if;
  if not exists(select 1 from public.pi_visual_files where id=(payload->>'file_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if payload->>'representation'='real_evidence' and payload->>'source_system'<>'manual' then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='binding' then
  select * into row from public.pi_visual_records where id=(payload->>'asset_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset';
  if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_record->>'status'='selected' and (row.status<>'approved' or row.payload->>'archived_at' is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='review' then
  if not exists(select 1 from public.pi_visual_records where id=(payload->>'subject_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 for ref in select payload->'identity_ref' union all select payload->'plan_ref' loop
  if ref is not null and ref<>'null'::jsonb and not exists(select 1 from public.pi_visual_versions where record_id=(ref->>'id')::uuid and product_id=p_product_id and user_id=owner_id and version=(ref->>'version')::bigint and record->>'etag'=ref->>'etag') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(coalesce(payload->'reference_asset_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.pi_visual_records where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
end $$;

create function public.pi_commit_visual(p_access jsonb,p_product_id uuid,p_tool text,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_dry_run boolean default false,p_operation jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
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
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_strip_nulls(jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw))));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $$;

create function public.pi_visual_operation(p_access jsonb,p_product_id uuid,p_operation_id uuid,p_claim boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; op public.pi_visual_operations;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into op from public.pi_visual_operations where id=p_operation_id and product_id=p_product_id and user_id=owner_id for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if p_claim then
  perform public.pi_authorize_context(p_access,'product_intelligence:write');
  perform public.pi_authorize_context(op.access,'product_intelligence:write');
  if op.kind<>'ingest' or op.status not in ('pending','processing') or op.status='processing' and op.lease_at>clock_timestamp()-interval '2 minutes' then return null; end if;
  update public.pi_visual_operations set status='processing',lease_token=gen_random_uuid(),lease_at=clock_timestamp(),updated_at=clock_timestamp() where id=op.id returning * into op;
 end if;
 return to_jsonb(op);
end $$;

create function public.pi_complete_visual_ingestion(p_operation_id uuid,p_token uuid,p_file jsonb,p_asset jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.pi_visual_operations; owner_id uuid; file_id uuid; asset_id uuid; record jsonb; result jsonb; it public.pi_visual_records; rev bigint;
begin
 -- Same lock order as deletion and writers: product before operation.
 select * into op from public.pi_visual_operations where id=p_operation_id;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform 1 from public.products where id=op.product_id and user_id=op.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into op from public.pi_visual_operations where id=p_operation_id for update;
 if op.status='succeeded' then return op.result; end if;
 if op.lease_token is distinct from p_token or op.status<>'processing' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 owner_id:=public.pi_authorize_context(op.access,'product_intelligence:write');
 if p_error is not null then
  update public.pi_visual_operations set status='failed',source='{}',error_message=left(p_error,2000),updated_at=clock_timestamp() where id=op.id;
  return jsonb_build_object('error',left(p_error,2000));
 end if;
 select * into it from public.pi_visual_records where id=op.iteration_id and product_id=op.product_id and user_id=owner_id and kind='iteration';
 if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
 select id into file_id from public.pi_visual_files where product_id=op.product_id and user_id=owner_id and sha256=p_file->>'sha256';
 if file_id is null then
  file_id:=(p_file->>'id')::uuid;
  insert into public.pi_visual_files(id,product_id,user_id,bucket,storage_path,sha256,original_sha256,mime_type,width,height,size_bytes)
   values(file_id,op.product_id,owner_id,p_file->>'bucket',p_file->>'storage_path',p_file->>'sha256',p_file->>'original_sha256',p_file->>'mime_type',(p_file->>'width')::int,(p_file->>'height')::int,(p_file->>'size_bytes')::bigint);
 end if;
 asset_id:=(p_asset->>'id')::uuid;
 record:=jsonb_set(p_asset,'{payload,file_id}',to_jsonb(file_id));
 if record->'payload'->>'iteration_id' is distinct from it.id::text or record->>'status'<>'generated' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if record->'payload'->'identity_ref' is distinct from it.payload->'identity_ref' or record->'payload'->'dependencies' is distinct from it.payload->'dependencies' then raise exception 'PI_INVALID_REFERENCE'; end if;
 perform public.pi_validate_visual_record(op.access,op.product_id,record);
 insert into public.pi_visual_records(id,product_id,user_id,kind,version,etag,status,payload) values(asset_id,op.product_id,owner_id,'asset',1,record->>'etag','generated',record->'payload');
 insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values(asset_id,op.product_id,owner_id,1,record,op.access->>'actor_id');
 record:=jsonb_build_object('id',it.id,'kind','iteration','version',it.version+1,'status','result_recorded','payload',it.payload||jsonb_build_object('result_asset_ids',coalesce(it.payload->'result_asset_ids','[]'::jsonb)||to_jsonb(asset_id)),
   'created_at',it.created_at,'updated_at',clock_timestamp());
 record:=record||jsonb_build_object('etag',public.pi_snapshot_hash(record));
 update public.pi_visual_records set version=it.version+1,status='result_recorded',payload=record->'payload',etag=record->>'etag',updated_at=clock_timestamp() where id=it.id;
 insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values(it.id,op.product_id,owner_id,it.version+1,record,op.access->>'actor_id');
 update public.product_intelligence set revision=revision+1,updated_at=clock_timestamp() where product_id=op.product_id returning revision into rev;
 insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(op.product_id,owner_id,rev,public.pi_context_snapshot(op.product_id),public.pi_snapshot_hash(public.pi_context_snapshot(op.product_id)),op.access->>'actor_id');
 result:=jsonb_build_object('asset_id',asset_id,'file_id',file_id,'revision',rev);
 update public.pi_visual_operations set status='succeeded',result=result,source='{}',updated_at=clock_timestamp() where id=op.id;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(op.product_id,owner_id,op.id,'visual_asset.ingested',op.access->>'actor_id',(op.access->>'client_id')::uuid,rev-1,rev,result);
 return result;
end $$;

revoke all on function public.pi_visual_source_state(uuid,uuid),public.pi_validate_visual_record(jsonb,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.pi_load_visual(jsonb,uuid,text,text,text,boolean,uuid),public.pi_commit_visual(jsonb,uuid,text,bigint,text,text,text,text,jsonb,boolean,jsonb),public.pi_visual_operation(jsonb,uuid,uuid,boolean),public.pi_complete_visual_ingestion(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.pi_load_visual(jsonb,uuid,text,text,text,boolean,uuid),public.pi_commit_visual(jsonb,uuid,text,bigint,text,text,text,text,jsonb,boolean,jsonb),public.pi_visual_operation(jsonb,uuid,uuid,boolean),public.pi_complete_visual_ingestion(uuid,uuid,jsonb,jsonb,text) to service_role;
