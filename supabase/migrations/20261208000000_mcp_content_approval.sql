-- Guardar contenido mediante MCP equivale a aprobarlo. Publicar conserva su autorización propia.
-- Mantiene RLS/ownership, scopes, CAS, procedencia, validaciones y decisiones explícitas de la UI.
begin;

create or replace function public.pi_shopify_visual_approval_allowed(p_access jsonb,p_product_id uuid,p_record jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 -- Compatibilidad con los validadores existentes: aprobación de contenido, sin permiso de publicación.
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 return p_record->>'kind' in ('identity','plan','iteration','asset','binding','review')
  and exists(select 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null);
end $$;

create or replace function public.pi_commit_visual(p_access jsonb,p_product_id uuid,p_tool text,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_dry_run boolean default false,p_operation jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
 if p_tool not in ('save_visual_identity','save_visual_generation_plan','prepare_visual_iteration','record_visual_iteration_result','prepare_visual_asset_upload','ingest_external_visual_asset','bind_visual_asset','unbind_visual_asset','save_visual_reconciliation','save_visual_binding_suggestions','review_visual_record') then raise exception 'PI_VALIDATION_ERROR'; end if;
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
 select id into asset_id from public.pi_visual_records where product_id=op.product_id and user_id=owner_id and kind='asset' and payload->>'semantic_hash'=p_asset->'payload'->>'semantic_hash' and status in ('generated','approved') and payload->>'archived_at' is null limit 1;
 if asset_id is null then
 if (select count(*) from public.pi_visual_records where product_id=op.product_id and kind='asset')>=200 or (select count(*) from public.pi_visual_records where product_id=op.product_id)>=1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 asset_id:=(p_asset->>'id')::uuid;
 record:=jsonb_set(p_asset,'{payload,file_id}',to_jsonb(file_id));
 if record->'payload'->>'iteration_id' is distinct from it.id::text or record->>'status' not in ('generated','approved') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if record->'payload'->'identity_ref' is distinct from it.payload->'identity_ref' or record->'payload'->'dependencies' is distinct from it.payload->'dependencies' then raise exception 'PI_INVALID_REFERENCE'; end if;
 record:=jsonb_set(jsonb_set(record,'{status}','"approved"'::jsonb),'{payload,approval_source}','"mcp"'::jsonb);
 record:=jsonb_set(record,'{etag}',to_jsonb(public.pi_snapshot_hash(jsonb_build_object('kind','asset','status','approved','payload',record->'payload','version',1))));
 perform public.pi_validate_visual_record(op.access,op.product_id,record);
 insert into public.pi_visual_records(id,product_id,user_id,kind,version,etag,status,payload) values(asset_id,op.product_id,owner_id,'asset',1,record->>'etag','approved',record->'payload');
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

create or replace function public.pi_commit_landing_legacy(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 automatic boolean; run_id uuid; request_id uuid:=gen_random_uuid(); part jsonb; existing public.page_components; component_id uuid; items jsonb:='[]'::jsonb;
 ids text[]:=array['listing','review-stars','benefit-usps','inventory','shipping-timeline','benefit-double-box','gif-strip','review-slider','ugc-slider','scrolling-benefits','pain-block','image-with-benefits','mechanism','use-cases','before-after','stats-with-image','results-timeline','usage-steps','product-includes','insta-story','customer-stories','review-wall','expert-endorsement','comparison-table','guarantee','faq-and-text','offer-summary'];
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=true; -- El guardado MCP aprueba; no habilita publish_product.
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
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 27
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
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   if not p_dry_run then
     select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,enabled,images,status,decided_at)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',coalesce(existing.enabled,true),coalesce(existing.images,'[]'::jsonb),case when automatic then 'approved'::public.content_status else 'generated'::public.content_status end,case when automatic then clock_timestamp() else null end);
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status',case when automatic then 'approved' else 'generated' end));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action',case when automatic then 'Contenido aprobado automáticamente. Publicar es una acción aparte.' else 'Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_commit_pack_labels(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_action text,p_labels jsonb,p_fact_ids jsonb default '[]'::jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 row public.pack_labels; new_id uuid; request_id uuid:=gen_random_uuid(); pack_prices jsonb; target_status public.content_status;
 automatic boolean; changed boolean; facts uuid[]; entry jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_action is distinct from 'propose' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=true; -- El guardado MCP aprueba; no habilita publish_product.
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_pack_labels'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_pack_labels_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from state->>'etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if snap->'pricing'='null'::jsonb or snap->'pricing'->>'currency' is distinct from snap->'catalog'->>'currency' or p_action is null or p_action not in ('propose','approve','reopen','edit','edit_approve')
   or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_labels) is distinct from 'array' or jsonb_array_length(p_labels) not between 1 and 3 or octet_length(p_labels::text)>16384
   or jsonb_typeof(p_fact_ids) is distinct from 'array' or jsonb_array_length(p_fact_ids)>20 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if (select count(distinct e->>'units') from jsonb_array_elements(p_labels) e)<>jsonb_array_length(p_labels)
   or jsonb_array_length(p_labels)<>jsonb_array_length(snap->'pricing'->'packs')
   or exists(select 1 from jsonb_array_elements(p_labels) e where not exists(select 1 from jsonb_array_elements(snap->'pricing'->'packs') k where k->'units'=e->'units')
     or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 80
     or length(coalesce(e->>'support',''))>100 or length(coalesce(e->>'badge',''))>30 or length(trim(e->>'reason')) not between 1 and 1000
     or jsonb_typeof(e->'reason') is distinct from 'string' or e->>'basis' is null or e->>'basis' not in ('duration','sharing','spare','gift','savings','other'))
   or (select count(*) from jsonb_array_elements(p_labels) e where e->>'badge' is not null)>1 then raise exception 'PI_VALIDATION_ERROR'; end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into facts from jsonb_array_elements_text(p_fact_ids);
 if p_action<>'reopen' and exists(select 1 from unnest(facts) id where not exists(select 1 from public.pi_facts f where f.id=id and f.product_id=p_product_id and f.user_id=owner_id
   and f.verification_status='verified' and f.usage_status='approved')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=id and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('units',k->'units','price',k->'price') order by (k->>'units')::int),'[]'::jsonb) into pack_prices from jsonb_array_elements(snap->'pricing'->'packs') k;
 select * into row from public.pack_labels where id=(state->'current'->>'id')::uuid;
 if p_action<>'propose' and row.id is null then raise exception 'PI_NOT_FOUND'; end if;
 target_status:=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then 'approved'::public.content_status when p_action='propose' then 'generated'::public.content_status else 'in_review'::public.content_status end;
 if p_action in ('approve','reopen') and p_labels is distinct from row.payload then raise exception 'PI_VALIDATION_ERROR'; end if;
 changed:=case when p_action='propose' then (automatic and row.status is distinct from target_status) or row.source is distinct from 'mcp_chat' or public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id) or row.payload is distinct from p_labels or row.prices is distinct from pack_prices or coalesce(row.provenance->'duration_fact_ids','[]'::jsonb) is distinct from p_fact_ids or row.provenance->>'currency' is distinct from snap->'pricing'->>'currency'
   else (p_action<>'reopen' and row.source='mcp_chat' and row.provenance->>'currency' is distinct from snap->'pricing'->>'currency') or (p_action<>'reopen' and public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id)) or row.status is distinct from target_status or row.payload is distinct from p_labels or (p_action<>'reopen' and row.prices is distinct from pack_prices) end;
 if not changed then target_status:=row.status; end if;
 new_id:=row.id;
 if changed and not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   perform set_config('pi.pack_labels_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   if p_action='propose' then
     update public.pack_labels set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     new_id:=gen_random_uuid();
     insert into public.pack_labels(id,product_id,user_id,payload,prices,status,prompt_version,model,source,provenance,decided_at)
       values(new_id,p_product_id,owner_id,p_labels,pack_prices,target_status,0,'chat','mcp_chat',jsonb_build_object('contract_version','1.0',
         'duration_fact_ids',p_fact_ids,'currency',snap->'pricing'->>'currency','analysis_revision',rev,'actor_id',p_access->>'actor_id','snapshot',snap,'reviewed_fact_revisions',case when automatic then coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb) else '{}'::jsonb end),case when automatic then clock_timestamp() else null end);
   else
     update public.pack_labels set payload=p_labels,prices=case when p_action='reopen' then row.prices else pack_prices end,status=target_status,
       provenance=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then row.provenance||jsonb_build_object('currency',snap->'pricing'->>'currency','reviewed_fact_revisions',
         coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb)) else row.provenance end,
       decided_at=case when target_status='approved' then now() else null end,
       edited_at=case when p_action in ('edit','edit_approve') then now() else row.edited_at end,updated_at=now()
       where id=row.id and product_id=p_product_id and user_id=owner_id and superseded_at is null;
   end if;
   after_snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
     values(p_product_id,owner_id,rev+1,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
     values(p_product_id,owner_id,request_id,'pack_labels_'||p_action,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_array(jsonb_build_object('proposal_id',new_id,'status',target_status)));
   rev:=rev+1; state:=public.pi_pack_labels_state(p_product_id,owner_id);
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',changed and not p_dry_run,'dry_run',p_dry_run,'proposal_id',case when p_dry_run then null else new_id end,
   'status',target_status,'pack_labels_etag',state->>'etag','next_action',case when automatic then 'Etiquetas aprobadas automáticamente. Publicar es una acción aparte.' else 'Revisa y acepta las etiquetas en Información base. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_pack_labels' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_pack_labels',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_commit_persuasion(p_access jsonb,p_product_id uuid,p_tool text,p_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_payload jsonb,p_issues jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; old_payload jsonb; old_etag text; old_rev bigint;
 new_id uuid; new_rev bigint; new_etag text; rev bigint; strategy_id uuid; angle_id uuid; plan public.pi_persuasion_plans; result jsonb;
 request_id uuid:=gen_random_uuid(); ref jsonb; section jsonb; row public.page_components; target jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null and pdp_persuasion_enabled for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_tool not in ('save_angle_persuasion_plan','save_landing_experience') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 state:=public.pi_pdp_state(p_product_id,owner_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(state) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
   or p_payload->>'schema_version' is distinct from '1.0' or octet_length(p_payload::text)>60000 or jsonb_typeof(p_issues) is distinct from 'array' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_id is not null then
  if p_tool='save_angle_persuasion_plan' then select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_persuasion_plans where id=p_id and product_id=p_product_id and user_id=owner_id;
  else select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_landing_experiences where id=p_id and product_id=p_product_id and user_id=owner_id; end if;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
 end if;
 if p_etag is distinct from coalesce(old_etag,state->>'empty_etag') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_id is null and ((p_tool='save_angle_persuasion_plan' and jsonb_array_length(state->'plans')>=20)
  or (p_tool='save_landing_experience' and jsonb_array_length(state->'experiences')>=20)) then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 strategy_id:=(p_payload->>'strategy_id')::uuid; angle_id:=(p_payload->>'angle_id')::uuid;
 if old_payload is not null and (old_payload->>'strategy_id',old_payload->>'angle_id',old_payload->>'landing_angle_id') is distinct from
   (p_payload->>'strategy_id',p_payload->>'angle_id',p_payload->>'landing_angle_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if not exists(select 1 from public.pi_strategy_versions v where v.id=strategy_id and v.product_id=p_product_id and v.user_id=owner_id
   and exists(select 1 from jsonb_array_elements(v.snapshot->'angles') a where a->>'id'=angle_id::text))
   or not exists(select 1 from public.pi_angles a where a.id=angle_id and a.product_id=p_product_id and a.user_id=owner_id and a.lifecycle='active') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_payload->>'status' in ('draft','review') then
  p_payload:=jsonb_set(p_payload,'{status}',to_jsonb(case when p_tool='save_angle_persuasion_plan' then 'approved'::text else 'active'::text end));
 end if;
 if p_payload->>'status' in ('review','approved','active') and exists(select 1 from jsonb_array_elements(p_issues) i where i->>'severity'='error') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_payload->>'status' in ('approved','active') and p_access->>'actor_kind'<>'merchant' and not (strategy_id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)) then raise exception 'PI_FORBIDDEN'; end if;
 if jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 27
  or (select count(distinct s->>'section_key') from jsonb_array_elements(p_payload->'sections') s)<>jsonb_array_length(p_payload->'sections') then raise exception 'PI_VALIDATION_ERROR'; end if;
 for ref in select jsonb_path_query(p_payload,'$.**.fact_ids[*]') loop
  if not exists(select 1 from public.pi_facts where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.**.evidence_ids[*]') loop
  if not exists(select 1 from public.pi_fact_evidence where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.sections[*].source_asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].images[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'assets') a where a->>'source'=ref->>'source' and a->>'id'=ref->>'id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.claims[*].review_ids[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'landing'->'reviews') r where r->>'id'=ref#>>'{}') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 if p_tool='save_angle_persuasion_plan' then
  if exists(select 1 from public.pi_landing_experiences where persuasion_plan_id=p_id and status='active') then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='primary')>least(7,(p_payload->'attention_budget'->>'max_primary_sections')::int)
    or (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='support')>least(26,(p_payload->'attention_budget'->>'max_support_sections')::int)
    or jsonb_array_length(p_payload->'beliefs') not between 4 and 7 or p_payload->>'status' not in ('draft','review','approved','archived') then raise exception 'PI_VALIDATION_ERROR'; end if;
 else
  select * into plan from public.pi_persuasion_plans where id=(p_payload->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or (plan.strategy_id,plan.angle_id,plan.landing_angle_id,plan.revision) is distinct from
    (strategy_id,angle_id,p_payload->>'landing_angle_id',(p_payload->>'plan_revision')::bigint) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_payload->>'status'='active' and plan.payload->>'status'<>'approved' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_payload->>'status'='active' and exists(select 1 from public.pi_landing_experiences e where e.product_id=p_product_id and e.id is distinct from p_id and e.status='active'
    and ((e.landing_angle_id=p_payload->>'landing_angle_id' and coalesce(e.landing_hook_id,'')=coalesce(p_payload->>'landing_hook_id','')) or (e.is_default and (p_payload->>'is_default')::boolean))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  for section in select value from jsonb_array_elements(p_payload->'sections') where value->>'enabled'='true' loop
   if not exists(select 1 from jsonb_array_elements(plan.payload->'sections') s where s->>'section_key'=section->>'section_key' and s->>'primary_job'=section->>'persuasion_job') then raise exception 'PI_INVALID_REFERENCE'; end if;
   select * into row from public.page_components where product_id=p_product_id and user_id=owner_id and component=section->>'component' and superseded_at is null;
   target:=coalesce(row.content,row.proposal);
   if jsonb_typeof(target)='array' then select value into target from jsonb_array_elements(target) v where v->>'key'=section->>'content_variant_key';
   elsif section->>'content_variant_key'<>'default' then target:=null; end if;
   if p_payload->>'status'='active' and (target is null or not row.enabled or row.status not in ('approved','published')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
 end if;
 new_id:=coalesce(p_id,gen_random_uuid()); new_rev:=coalesce(old_rev,0)+1;
 new_etag:=public.pi_snapshot_hash(jsonb_build_array(new_id,new_rev,p_payload));
 if p_dry_run then return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',false,'dry_run',true,'id',p_id,'revision',coalesce(old_rev,0),'etag',coalesce(old_etag,state->>'empty_etag'),'issues',p_issues)); end if;
 if p_tool='save_angle_persuasion_plan' then
  if p_id is null and (select count(*) from public.pi_persuasion_plans where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  insert into public.pi_persuasion_plans(id,product_id,user_id,strategy_id,angle_id,landing_angle_id,revision,etag,payload)
   values(new_id,p_product_id,owner_id,strategy_id,angle_id,p_payload->>'landing_angle_id',new_rev,new_etag,p_payload)
   on conflict(id) do update set revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
 else
  if p_id is null and (select count(*) from public.pi_landing_experiences where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  insert into public.pi_landing_experiences(id,product_id,user_id,persuasion_plan_id,strategy_id,angle_id,landing_angle_id,landing_hook_id,experience_key,status,is_default,revision,etag,payload)
   values(new_id,p_product_id,owner_id,plan.id,strategy_id,angle_id,p_payload->>'landing_angle_id',p_payload->>'landing_hook_id',p_payload->>'experience_key',p_payload->>'status',(p_payload->>'is_default')::boolean,new_rev,new_etag,p_payload)
   on conflict(id) do update set persuasion_plan_id=excluded.persuasion_plan_id,landing_hook_id=excluded.landing_hook_id,experience_key=excluded.experience_key,status=excluded.status,
    is_default=excluded.is_default,revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
 end if;
 insert into public.pi_pdp_revisions(product_id,user_id,plan_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
  values(p_product_id,owner_id,case when p_tool='save_angle_persuasion_plan' then new_id end,case when p_tool='save_landing_experience' then new_id end,new_rev,new_etag,p_payload,p_issues,p_access->>'actor_id',p_access->>'actor_kind');
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
  'applied',true,'dry_run',false,'id',new_id,'revision',new_rev,'etag',new_etag,'issues',p_issues));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('id',new_id,'artifact_revision',new_rev,'status',p_payload->>'status'));
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
  values(p_product_id,owner_id,p_tool,p_key,p_hash,array['product_intelligence:read','product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_commit_content(p_access jsonb,p_product_id uuid,p_kind text,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_content jsonb,p_input jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; tool_name text;
 result jsonb; request_id uuid:=gen_random_uuid(); run_id uuid; artifact_id uuid; ids jsonb:='[]'; item jsonb; payload jsonb; n integer:=0; angle_slot integer; selected_id uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 tool_name:=case p_kind when 'tip' then 'save_usage_tip' else 'save_'||p_kind||'_content' end;
 if p_kind is null or p_kind not in ('creative','gallery','event','tip') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_content_state(p_product_id,owner_id,p_kind); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from state->>'content_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>65536 or jsonb_typeof(p_input) is distinct from 'object'
   or snap->'pricing'='null'::jsonb or snap->'catalog'->>'currency' is distinct from snap->'pricing'->>'currency' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if jsonb_typeof(p_content->'fact_ids') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(p_content->'fact_ids') r(id) where
   not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p_product_id and f.user_id=owner_id and f.usage_status='approved' and f.verification_status='verified')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=r.id::uuid and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind in ('creative','gallery') then
   selected_id:=(snap->'knowledge'->>'active_strategy_id')::uuid;
   if selected_id is null or p_content->>'strategy_id' is distinct from selected_id::text or
     p_input->'strategy_snapshot' is distinct from snap->'knowledge'->'strategy'->'snapshot' or jsonb_typeof(p_content->'angle_ids') is distinct from 'array'
     or jsonb_array_length(p_content->'angle_ids') not between 1 and 3
     or exists(select 1 from jsonb_array_elements_text(p_content->'angle_ids') a(id) where not exists(select 1 from jsonb_array_elements(p_input->'strategy_snapshot'->'angles') b where b->>'id'=a.id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 if p_kind='event' and not exists(select 1 from public.events where id=(p_content->>'event_id')::uuid and status='published') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind='tip' and (length(trim(p_content->>'text')) not between 1 and 140 or jsonb_array_length(p_content->'fact_ids')<1) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='creative' and (jsonb_typeof(p_content->'concepts') is distinct from 'array' or jsonb_array_length(p_content->'concepts') not between 1 and 18) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='gallery' and (jsonb_typeof(p_content->'plan'->'shots') is distinct from 'array' or jsonb_array_length(p_content->'plan'->'shots')<>9) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='creative' and exists(select 1 from public.creative_assets where product_id=p_product_id and user_id=owner_id and render_status in ('queued','running'))
   or p_kind='gallery' and exists(select 1 from public.page_images where product_id=p_product_id and user_id=owner_id and render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   p_input:=p_input||jsonb_build_object('content',p_content,'analysis_revision',rev,'actor_id',p_access->>'actor_id','context_stamp',p_stamp);
   if p_kind='creative' then
     update public.creative_concepts set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     insert into public.creative_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content,0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'concepts') loop
       n:=n+1;
       select ordinality::int into angle_slot from jsonb_array_elements_text(p_content->'angle_ids') with ordinality where value=item->>'angle_id';
       if angle_slot is null then raise exception 'PI_INVALID_REFERENCE'; end if;
       payload:=item||jsonb_build_object('angle',angle_slot,'preset_id',null,'preset',null,'product_look',p_content->'product_look','kit',p_content->'kit',
         'source','mcp_chat','sales_angle','offer','angle_name',(select a->>'name' from jsonb_array_elements(p_input->'strategy_snapshot'->'angles') a where a->>'id'=item->>'angle_id'),
         'provenance',jsonb_build_object('strategy_id',selected_id,'angle_id',item->>'angle_id','fact_ids',p_content->'fact_ids','analysis_revision',rev,'dramatization',item->>'family'='whatsapp_chat'));
       insert into public.creative_concepts(product_id,user_id,run_id,position,angle_slot,family,payload) values(p_product_id,owner_id,run_id,n,angle_slot,item->>'family',payload) returning id into artifact_id;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='gallery' then
     update public.page_image_shots set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     insert into public.page_image_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content->'plan',0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'plan'->'shots') loop
       n:=n+1;
       payload:=item||jsonb_build_object('product_look',p_content->'plan'->'product_look','kit',p_content->'plan'->'kit','props_forbidden',p_content->'plan'->'props_forbidden',
         'world',p_content->'plan'->'visual_world','pairs',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'text' else null end,
         'angle',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'angle' else null end,'source','mcp_chat');
       insert into public.page_image_shots(product_id,user_id,run_id,slot,position,payload) values(p_product_id,owner_id,run_id,
         case when item->>'slot'='benefit' then 'benefit-'||(item->>'benefit') else item->>'slot' end,n,payload) returning id into artifact_id;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='event' then
     insert into public.event_copy(product_id,user_id,event_id,status,proposal,content,model,prompt_version,provenance,decided_at)
       values(p_product_id,owner_id,(p_content->>'event_id')::uuid,'approved',p_content->'content',p_content->'content','chat',0,p_input,now())
       on conflict(product_id,event_id) do update set status='approved',proposal=excluded.proposal,content=excluded.content,model='chat',prompt_version=0,provenance=excluded.provenance,decided_at=now(),updated_at=now() returning id into artifact_id;
     ids:=jsonb_build_array(artifact_id);
   else
     update public.products set usage_tip=jsonb_build_object('text',p_content->>'text','basis',p_content->>'basis','created_at',now(),'model','chat','prompt_version',0,'source','mcp_chat','provenance',p_input),updated_at=now() where id=p_product_id and user_id=owner_id;
   end if;
   after_snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev+1,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
     values(p_product_id,owner_id,request_id,tool_name,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_object('before',state->'current','after',p_content));
   rev:=rev+1; state:=public.pi_content_state(p_product_id,owner_id,p_kind);
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not p_dry_run,'dry_run',p_dry_run,'content_etag',state->>'content_etag','artifact_ids',ids,'next_action','Contenido aprobado automáticamente. Generar y publicar son acciones aparte.'));
 if not p_dry_run then
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,tool_name,p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 end if;
 return result;
end $$;

create or replace function public.pi_tip_proposal() returns trigger language plpgsql set search_path='' as $$
begin
 if new.usage_tip->>'source'='mcp_chat' and new.usage_tip->>'status' is null then
   new.usage_tip:=new.usage_tip||jsonb_build_object('status','approved','reviewed_fact_revisions',
    coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.product_id=new.id and f.user_id=new.user_id
     and f.id in (select value::uuid from jsonb_array_elements_text(coalesce(new.usage_tip->'provenance'->'content'->'fact_ids','[]'::jsonb)))), '{}'::jsonb));
 end if;
 return new;
end $$;

create or replace function public.pi_commit_ugc(p_access jsonb,p_product_id uuid,p_command jsonb,p_prepared jsonb,p_stamp text,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare owner_id uuid; tool text:=p_command->>'tool'; scope text; rev bigint; state jsonb; snap jsonb; receipt public.pi_idempotency_records;
 cmd jsonb:=p_command->'input'; dry boolean:=coalesce((p_command->'input'->>'dry_run')::boolean,false); script public.video_scripts; result jsonb;
 script_id uuid; op_id uuid; item jsonb; now_at timestamptz:=clock_timestamp(); request_id uuid:=gen_random_uuid(); daily_count int; cap int;
begin
 scope:=case when tool='generate_ugc' then 'ugc:generate' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 if tool='generate_ugc' then perform public.pi_authorize_context(p_access,'product_intelligence:read'); end if;
 if tool not in ('save_ugc_content','generate_ugc','review_ugc') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if tool='review_ugc' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if tool<>'review_ugc' and not dry then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and pi_idempotency_records.tool=tool and idempotency_key=cmd->>'idempotency_key' and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_ugc_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if (cmd->>'expected_revision')::bigint is distinct from rev or p_stamp is distinct from public.pi_ugc_context_stamp(p_product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if tool='save_ugc_content' then
   if cmd->>'expected_ugc_etag' is distinct from state->>'ugc_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   if not exists(select 1 from public.pi_strategy_versions v where v.id=(cmd->>'strategy_id')::uuid and v.product_id=p_product_id and v.user_id=owner_id and v.id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)
      and exists(select 1 from jsonb_array_elements(v.snapshot->'angles') with ordinality a(value,slot) where a.value->>'id'=cmd->>'angle_id' and a.slot=(cmd->>'angle_slot')::int)) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if cmd->>'execution_key' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or cmd->>'landing_angle_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or cmd->>'landing_hook_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or (cmd->>'angle_slot')::int not between 1 and 3 or cmd->'content'->>'format' not in ('ugc','mascot')
     or jsonb_typeof(p_prepared->'payload') is distinct from 'object' or octet_length(p_prepared::text)>131072 then raise exception 'PI_VALIDATION_ERROR'; end if;
   select * into script from public.video_scripts where product_id=p_product_id and user_id=owner_id and execution_key=cmd->>'execution_key' and format=cmd->'content'->>'format' and superseded_at is null for update;
   if exists(select 1 from public.video_shots s where s.script_id=script.id and s.render_status in ('queued','running') and s.superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if (select count(*) from public.video_scripts where product_id=p_product_id and source='mcp_chat' and superseded_at is null)>=24 and script.id is null then raise exception 'PI_RATE_LIMITED'; end if;
   if not dry then
     update public.video_scripts set superseded_at=now_at,updated_at=now_at where id=script.id;
     update public.pi_ugc_operations set status='cancelled',updated_at=now_at where pi_ugc_operations.script_id=script.id and status in ('queued','running');
     script_id:=gen_random_uuid();
     insert into public.video_scripts(id,product_id,user_id,angle_slot,format,status,payload,input,source,execution_key,provenance,prompt_version,model,finished_at,approved_at)
       values(script_id,p_product_id,owner_id,(cmd->>'angle_slot')::smallint,cmd->'content'->>'format','succeeded',p_prepared->'payload',p_prepared->'input',
         'mcp_chat',cmd->>'execution_key',jsonb_build_object('strategy_id',cmd->>'strategy_id','angle_id',cmd->>'angle_id','analysis_revision',rev,
         'landing_angle_id',cmd->>'landing_angle_id','landing_hook_id',cmd->>'landing_hook_id','hook',cmd->'hook','context_stamp',p_stamp,'actor_id',p_access->>'actor_id'),0,'chat',now_at,now_at);
     insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
     update public.product_intelligence set revision=rev+1,updated_at=now_at where product_id=p_product_id;
     rev:=rev+1;
     insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
     state:=public.pi_ugc_state(p_product_id,owner_id);
   end if;
   result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not dry,'dry_run',dry,'script_id',script_id,'ugc_etag',state->>'ugc_etag',
     'artifact_etag',(select artifact_etag from public.video_scripts where id=script_id),'status','approved','next_action','Guion aprobado automáticamente. Genera las tomas cuando lo necesites.'));
 else
   select * into script from public.video_scripts where id=(cmd->>'script_id')::uuid and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
   if script.id is null then raise exception 'PI_NOT_FOUND'; end if;
   if cmd->>'expected_artifact_etag' is distinct from script.artifact_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   if script.source='mcp_chat' and script.provenance->>'context_stamp' is distinct from p_stamp then raise exception 'PI_REVISION_CONFLICT'; end if;
   if tool='review_ugc' then
     if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
     if cmd->>'action' not in ('approve','unapprove','edit') then raise exception 'PI_VALIDATION_ERROR'; end if;
     if cmd->>'action'='edit' then
       -- Se invalida el montaje completo: también puede cambiar la sincronización de B-roll/textos.
       update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and kind<>'keyframe' and superseded_at is null;
       update public.video_scripts set payload=p_prepared->'payload',approved_at=null,edited_at=now_at,final_status=case when final_storage_path is null then null else 'in_review'::public.content_status end,updated_at=now_at where id=script.id;
     else
       update public.video_scripts set approved_at=case when cmd->>'action'='approve' then now_at else null end,
         final_status=case when cmd->>'action'='unapprove' and final_storage_path is not null then 'in_review'::public.content_status else final_status end,updated_at=now_at where id=script.id;
     end if;
     return jsonb_build_object('script_id',script.id);
   end if;
   if script.approved_at is null or script.status<>'succeeded' or cmd->>'stage' not in ('keyframes','clips') then raise exception 'PI_VALIDATION_ERROR'; end if;
   if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if cmd->>'stage'='clips' and exists(select 1 from jsonb_array_elements(script.payload->'keyframes') k where not exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=k->>'key' and s.kind='keyframe' and s.render_status='succeeded' and s.status='approved' and s.superseded_at is null)) then raise exception 'PI_VALIDATION_ERROR'; end if;
   cap:=case when cmd->>'stage'='keyframes' then 60 else 40 end;
   -- Por dueño, evita que dos productos superen el cupo simultáneamente.
   perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ugc-budget',0));
   select count(*) into daily_count from public.video_shots where user_id=owner_id and created_at>now_at-interval '24 hours' and (kind='keyframe')=(cmd->>'stage'='keyframes');
   if daily_count+jsonb_array_length(p_prepared->'shots')>cap then raise exception 'PI_RATE_LIMITED'; end if;
   if jsonb_array_length(p_prepared->'shots') not between 1 and 20 then raise exception 'PI_VALIDATION_ERROR'; end if;
   for item in select value from jsonb_array_elements(p_prepared->'shots') loop
     if item->>'key' not in (select jsonb_array_elements_text(cmd->'shot_keys')) or not exists(select 1 from jsonb_array_elements(case when cmd->>'stage'='keyframes' then script.payload->'keyframes' else (script.payload->'a_roll')||(script.payload->'b_roll') end) k where k->>'key'=item->>'key') then raise exception 'PI_INVALID_REFERENCE'; end if;
     if exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=item->>'key' and s.superseded_at is null and (not coalesce((cmd->>'replace_existing')::boolean,false) and s.render_status<>'failed' and s.status<>'rejected' or s.error_code in ('dispatch_unknown','dispatching') or (s.render_status='failed' and s.hf_request_id is not null and coalesce(s.error_code,'') not in ('failed','nsfw','canceled')))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   end loop;
   if dry then return p_prepared->'preview'; end if;
   if coalesce((cmd->>'replace_existing')::boolean,false) then
     if cmd->>'stage'='keyframes' then
       update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and superseded_at is null and
         (kind<>'keyframe' or ('K1' in (select jsonb_array_elements_text(cmd->'shot_keys')) and key<>'K1'));
     end if;
     update public.video_scripts set final_status=case when final_storage_path is null then null else 'in_review'::public.content_status end,updated_at=now_at where id=script.id;
     select * into script from public.video_scripts where id=script.id;
   end if;
   op_id:=gen_random_uuid();
   insert into public.pi_ugc_operations(id,product_id,user_id,script_id,stage,access,input_hash,context_stamp,script_etag,analysis_revision,request_revision,estimated_usd)
     values(op_id,p_product_id,owner_id,script.id,cmd->>'stage',p_access,p_hash,p_stamp,script.artifact_etag,coalesce((script.provenance->>'analysis_revision')::bigint,rev),rev,(p_prepared->>'estimated_usd')::numeric);
   for item in select value from jsonb_array_elements(p_prepared->'shots') loop
     update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and key=item->>'key' and superseded_at is null;
     insert into public.video_shots(script_id,product_id,user_id,key,kind,attempt,endpoint,input,operation_id) values(script.id,p_product_id,owner_id,item->>'key',item->>'kind',1,item->>'endpoint',item->'input',op_id);
   end loop;
   result:=jsonb_build_object('operation_id',op_id,'revision',rev,'request_id',request_id);
 end if;
 if dry then return result; end if;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,(cmd->>'expected_revision')::bigint,rev,jsonb_build_array(jsonb_build_object('script_id',coalesce(script_id,script.id),'operation_id',op_id)));
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and pi_idempotency_records.tool=tool and idempotency_key=cmd->>'idempotency_key';
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,tool,cmd->>'idempotency_key',p_hash,array[scope],result,rev,request_id);
 return result;
end $$;

-- Aprueba únicamente contenido MCP vigente que todavía no tuvo una decisión.
update public.page_components c set status='approved',decided_at=clock_timestamp(),updated_at=clock_timestamp()
where c.superseded_at is null and c.status='generated' and c.decided_at is null
 and exists(select 1 from public.copy_runs r where r.id=c.run_id and r.input->>'source'='mcp_chat');
update public.event_copy set status='approved',content=proposal,decided_at=clock_timestamp(),updated_at=clock_timestamp()
where status='generated' and decided_at is null and provenance->>'source'='mcp_chat';
update public.video_scripts set approved_at=clock_timestamp(),updated_at=clock_timestamp()
where source='mcp_chat' and status='succeeded' and superseded_at is null and approved_at is null
 and edited_at is null and updated_at=created_at;
update public.products set usage_tip=usage_tip-'status'
where usage_tip->>'source'='mcp_chat' and usage_tip->>'status'='in_review' and not (usage_tip ? 'reviewed_fact_revisions');

-- Conserva versiones previas y decisiones explícitas. Las imágenes y usos MCP ya elegidos
-- mantienen su aprobación aunque cambien políticas o contexto; una dependencia revocada sigue bloqueando.
do $$
declare head public.pi_visual_records; next_record jsonb; new_payload jsonb; next_status text; product_row record; rev bigint; snap jsonb;
begin
 for product_row in select distinct product_id,user_id from public.pi_visual_records
  where ((kind='asset' and status in ('generated','approved')) or (kind='binding' and status='selected'))
   and payload->>'archived_at' is null and payload->>'approval_source' is distinct from 'mcp' loop
  perform 1 from public.products where id=product_row.product_id and user_id=product_row.user_id and pi_deleting_at is null for update;
  if not found then continue; end if;
  rev:=coalesce((select revision from public.product_intelligence where product_id=product_row.product_id),0);
  for head in select * from public.pi_visual_records where product_id=product_row.product_id
   and ((kind='asset' and status in ('generated','approved')) or (kind='binding' and status='selected'))
   and payload->>'archived_at' is null and payload->>'approval_source' is distinct from 'mcp' loop
   next_status:=case when head.kind='asset' then 'approved' else head.status end;
   new_payload:=head.payload||jsonb_build_object('approval_source','mcp');
   next_record:=to_jsonb(head)||jsonb_build_object('version',head.version+1,'status',next_status,'payload',new_payload,'updated_at',clock_timestamp());
   next_record:=next_record||jsonb_build_object('etag',public.pi_snapshot_hash(jsonb_build_object('kind',head.kind,'status',next_status,'payload',new_payload,'version',head.version+1)));
   update public.pi_visual_records set version=head.version+1,status=next_status,payload=new_payload,etag=next_record->>'etag',updated_at=clock_timestamp() where id=head.id;
   insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id)
    values(head.id,head.product_id,head.user_id,head.version+1,next_record,'migration:mcp_content_approval');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
    values(head.product_id,head.user_id,gen_random_uuid(),'visual_'||head.kind||'.approved','migration:mcp_content_approval',rev,rev+1,jsonb_build_object('record_id',head.id,'version',head.version+1,'status',next_status));
  end loop;
  insert into public.product_intelligence(product_id,user_id,revision) values(product_row.product_id,product_row.user_id,rev+1)
   on conflict(product_id) do update set revision=public.product_intelligence.revision+1,updated_at=clock_timestamp() returning revision into rev;
  if rev is not null then
   snap:=public.pi_context_snapshot(product_row.product_id);
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(product_row.product_id,product_row.user_id,rev,snap,public.pi_snapshot_hash(snap),'migration:mcp_content_approval');
  end if;
 end loop;
end $$;
commit;
