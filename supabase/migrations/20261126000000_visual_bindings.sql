-- Destinos existentes, derivados por formato y protección de los históricos visuales.
create unique index pi_visual_identity_one on public.pi_visual_records(product_id,user_id) where kind='identity';
create unique index pi_visual_selected_target on public.pi_visual_records(product_id,user_id,(payload->>'target_key')) where kind='binding' and status='selected';
create table public.pi_visual_renditions (
 file_id uuid not null,product_id uuid not null,user_id uuid not null,profile text not null check(profile in ('creative','ads','ugc')),
 bucket text not null check(bucket in ('creative-media','ad-media')),storage_path text not null,mime_type text not null,width integer not null,height integer not null,size_bytes bigint not null,
 primary key(file_id,profile),unique(bucket,storage_path),foreign key(file_id,product_id,user_id) references public.pi_visual_files(id,product_id,user_id) on delete cascade,
 foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade,
 check(storage_path like user_id::text||'/'||product_id::text||'/visual-%')
);
alter table public.pi_visual_renditions enable row level security;
revoke all on public.pi_visual_renditions from public,anon,authenticated;
grant all on public.pi_visual_renditions to service_role;
alter table public.page_images add column visual_binding_id uuid references public.pi_visual_records(id) on delete cascade;
alter table public.creative_assets add column visual_binding_id uuid references public.pi_visual_records(id) on delete cascade;
alter table public.ad_media add column visual_binding_id uuid references public.pi_visual_records(id) on delete cascade;
alter table public.video_shots add column visual_binding_id uuid references public.pi_visual_records(id) on delete cascade;
alter table public.creative_assets alter column provider drop not null;
create unique index pi_visual_page_bridge on public.page_images(visual_binding_id) where visual_binding_id is not null;
create unique index pi_visual_creative_bridge on public.creative_assets(visual_binding_id) where visual_binding_id is not null;
create unique index pi_visual_ad_bridge on public.ad_media(visual_binding_id) where visual_binding_id is not null;

create function public.pi_visual_validate_target(p_product_id uuid,p_owner uuid,t jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if t->>'type'='gallery_shot' then
  if t->>'slot' not in ('cover','gallery') and not exists(select 1 from public.page_image_shots where product_id=p_product_id and user_id=p_owner and slot=t->>'slot' and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if t->>'slot'='gallery' and (t->>'position')::int not between 1 and 12 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif t->>'type'='landing_section' then
  if not exists(select 1 from public.pi_landing_experiences e,jsonb_array_elements(e.payload->'sections') s where e.id=(t->>'experience_id')::uuid and e.product_id=p_product_id and e.user_id=p_owner and e.status<>'archived'
    and s->>'section_key'=t->>'section_key' and s->>'component'=t->>'component' and s->>'content_variant_key'=t->>'content_variant_key' and s->>'enabled'='true') then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='creative_concept' then
  if not exists(select 1 from public.creative_concepts where id=(t->>'concept_id')::uuid and product_id=p_product_id and user_id=p_owner and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='ugc_shot' then
  if not exists(select 1 from public.video_shots v join public.video_scripts s on s.id=v.script_id where v.id=(t->>'video_shot_id')::uuid and v.script_id=(t->>'script_id')::uuid and v.product_id=p_product_id and v.user_id=p_owner
    and v.superseded_at is null and s.superseded_at is null and s.approved_at is not null and ((t->>'slot'='keyframe' and v.kind='keyframe') or (t->>'slot'='b_roll' and v.kind='b_roll'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
 else raise exception 'PI_INVALID_REFERENCE'; end if;
end $$;

create or replace function public.pi_validate_visual_record(p_access jsonb,p_product_id uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=(p_access->>'user_id')::uuid; payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_access->>'actor_kind'<>'merchant' and ((p_record->>'status' in ('approved','selected','rejected','in_review') and kind<>'iteration') or kind='review' or (p_record->>'status'='archived' and (kind<>'binding' or exists(select 1 from public.pi_visual_records where id=(p_record->>'id')::uuid and status='selected')))) then raise exception 'PI_FORBIDDEN'; end if;
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
  perform public.pi_visual_validate_target(p_product_id,owner_id,payload->'target');
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
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_strip_nulls(jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw))));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $$;
create or replace function public.pi_complete_visual_ingestion(p_operation_id uuid,p_token uuid,p_file jsonb,p_asset jsonb,p_error text default null) returns jsonb
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
 result:=jsonb_build_object('asset_id',asset_id,'file_id',file_id,'revision',rev);
 update public.pi_visual_operations set status='succeeded',result=result,source='{}',updated_at=clock_timestamp() where id=op.id;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(op.product_id,owner_id,op.id,'visual_asset.ingested',op.access->>'actor_id',(op.access->>'client_id')::uuid,rev-1,rev,result);
 return result;
end $$;

-- Selection writes the existing publication models in the same product transaction.
create function public.pi_project_visual_binding() returns trigger language plpgsql security definer set search_path='' as $$
declare t jsonb; asset public.pi_visual_records; f public.pi_visual_files; r public.pi_visual_renditions; ad public.pi_visual_renditions;
 exp public.pi_landing_experiences; payload jsonb; sections jsonb; section jsonb; picks jsonb; variant jsonb; row public.page_components;
 media_id uuid; concept public.creative_concepts; shot public.video_shots; active boolean; slot text; pos int;
begin
 if new.kind<>'binding' then return new; end if;
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 active:=new.status='selected';
 if not active and (tg_op='INSERT' or old.status<>'selected') then return new; end if;
 t:=new.payload->'target';
 select * into asset from public.pi_visual_records where id=(new.payload->>'asset_id')::uuid and product_id=new.product_id and user_id=new.user_id and kind='asset';
 select * into f from public.pi_visual_files where id=(asset.payload->>'file_id')::uuid and product_id=new.product_id and user_id=new.user_id;
 if f.id is null then raise exception 'PI_INVALID_REFERENCE'; end if;
 if t->>'type' in ('gallery_shot','landing_section') then
  slot:=case when t->>'type'='gallery_shot' then t->>'slot' else 'visual-'||new.id::text end;
  pos:=case when t->>'slot'='gallery' then (t->>'position')::int else 1 end;
  if active then
   if t->>'type'='gallery_shot' then
    update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp()
     where product_id=new.product_id and user_id=new.user_id and slot=t->>'slot' and status='approved' and (slot<>'gallery' or position=pos) and visual_binding_id is null;
   end if;
   insert into public.page_images(id,product_id,user_id,slot,source,storage_path,width,height,size_bytes,status,position,decided_at,visual_binding_id,input)
    values(new.id,new.product_id,new.user_id,slot,'upload',f.storage_path,f.width,f.height,f.size_bytes,'approved',pos,clock_timestamp(),new.id,jsonb_build_object('visual_asset_id',asset.id))
    on conflict(id) do update set status='approved',position=excluded.position,decided_at=excluded.decided_at,updated_at=clock_timestamp();
  else update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp() where visual_binding_id=new.id;
  end if;
  if t->>'type'='landing_section' then
   select * into exp from public.pi_landing_experiences where id=(t->>'experience_id')::uuid and product_id=new.product_id and user_id=new.user_id for update;
   sections:='[]'::jsonb;
   for section in select value from jsonb_array_elements(exp.payload->'sections') loop
    if section->>'section_key'=t->>'section_key' then
     picks:=coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(section->'images','[]'::jsonb)) p where p->>'slot'<>t->>'slot'),'[]'::jsonb);
     if active then picks:=picks||jsonb_build_array(jsonb_build_object('slot',t->>'slot','source','page_image','id',new.id)); end if;
     section:=section||jsonb_build_object('images',picks,'manual_overrides',coalesce((select jsonb_agg(distinct v) from jsonb_array_elements(coalesce(section->'manual_overrides','[]'::jsonb)||'["assets"]'::jsonb) v),'[]'::jsonb));
    end if;
    sections:=sections||jsonb_build_array(section);
   end loop;
   payload:=exp.payload||jsonb_build_object('sections',sections);
   update public.pi_landing_experiences set payload=payload,revision=exp.revision+1,etag=public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,payload)),updated_at=clock_timestamp() where id=exp.id;
   insert into public.pi_pdp_revisions(product_id,user_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
    values(exp.product_id,exp.user_id,exp.id,exp.revision+1,public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,payload)),payload,'[]',new.user_id::text,'merchant');
   select * into row from public.page_components where product_id=new.product_id and user_id=new.user_id and component=t->>'component' and superseded_at is null for update;
   if row.id is null then raise exception 'PI_INVALID_REFERENCE'; end if;
   payload:=coalesce(row.content,row.proposal);
   if jsonb_typeof(payload)='array' then
    sections:='[]';
    for variant in select value from jsonb_array_elements(payload) loop
     if variant->>'key'=t->>'content_variant_key' then variant:=variant||jsonb_build_object('images',picks); end if;
     sections:=sections||jsonb_build_array(variant);
    end loop;
    update public.page_components set content=sections,updated_at=clock_timestamp() where id=row.id;
   else update public.page_components set images=picks,updated_at=clock_timestamp() where id=row.id;
   end if;
  end if;
 elsif t->>'type'='creative_concept' then
  select * into r from public.pi_visual_renditions where file_id=f.id and profile='creative';
  select * into ad from public.pi_visual_renditions where file_id=f.id and profile='ads';
  if active and (r.file_id is null or ad.file_id is null) then raise exception 'PI_VALIDATION_ERROR'; end if;
  select * into concept from public.creative_concepts where id=(t->>'concept_id')::uuid and product_id=new.product_id and user_id=new.user_id;
  if active then
   select id into media_id from public.ad_media where visual_binding_id=new.id;
   media_id:=coalesce(media_id,gen_random_uuid());
   insert into public.ad_media(id,product_id,user_id,kind,name,storage_path,mime_type,width,height,ratio,size_bytes,angle_slot,status,visual_binding_id,content_provenance)
    values(media_id,new.product_id,new.user_id,'image',coalesce(concept.payload->>'name','Imagen del chat'),ad.storage_path,ad.mime_type,ad.width,ad.height,t->>'ratio',ad.size_bytes,concept.angle_slot,'ready',new.id,
      jsonb_build_object('kind','visual_static','visual_asset_id',asset.id,'visual_binding_id',new.id,'landing_angle_id',concept.payload->>'landing_angle_id','landing_hook_id',concept.payload->>'landing_hook_id'))
    on conflict(id) do update set status='ready',updated_at=clock_timestamp();
   insert into public.creative_assets(id,product_id,user_id,concept_id,ratio,endpoint,input,render_status,storage_path,width,height,size_bytes,status,decided_at,ad_media_id,visual_binding_id,provider)
    values(new.id,new.product_id,new.user_id,concept.id,t->>'ratio','external',jsonb_build_object('visual_asset_id',asset.id),'succeeded',r.storage_path,r.width,r.height,r.size_bytes,'approved',clock_timestamp(),media_id,new.id,null)
    on conflict(id) do update set status='approved',ad_media_id=media_id,decided_at=clock_timestamp(),updated_at=clock_timestamp();
  else update public.creative_assets set status='generated',decided_at=null,updated_at=clock_timestamp() where visual_binding_id=new.id;
  end if;
 elsif t->>'type'='ugc_shot' then
  select * into shot from public.video_shots where id=(t->>'video_shot_id')::uuid and product_id=new.product_id and user_id=new.user_id;
  if t->>'slot'='b_roll' then
   -- A still is a storyboard reference, never an approved video clip.
   update public.video_shots set input=case when active then input||jsonb_build_object('visual_storyboard_asset_id',asset.id,'visual_binding_id',new.id) else input-'visual_storyboard_asset_id'-'visual_binding_id' end,updated_at=clock_timestamp() where id=shot.id;
  else
   select * into r from public.pi_visual_renditions where file_id=f.id and profile='ugc';
   if active and r.file_id is null then raise exception 'PI_VALIDATION_ERROR'; end if;
   if active then
    update public.video_shots set status='generated' where script_id=shot.script_id and key=shot.key and kind='keyframe' and status='approved' and id<>new.id;
    insert into public.video_shots(id,script_id,product_id,user_id,key,kind,endpoint,input,render_status,storage_path,width,height,size_bytes,status,visual_binding_id)
     values(new.id,shot.script_id,new.product_id,new.user_id,shot.key,'keyframe','external',jsonb_build_object('visual_asset_id',asset.id),'succeeded',r.storage_path,r.width,r.height,r.size_bytes,'approved',new.id)
     on conflict(id) do update set status='approved',updated_at=clock_timestamp();
   else update public.video_shots set status='generated',updated_at=clock_timestamp() where visual_binding_id=new.id;
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger pi_visual_binding_projection after insert or update on public.pi_visual_records for each row execute function public.pi_project_visual_binding();
revoke all on function public.pi_project_visual_binding(),public.pi_visual_validate_target(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

select cron.schedule('visual-ingestion-recovery','* * * * *',$job$
 select net.http_get(url:=rtrim(s.base,'/')||'/api/cron/visual-ingestion',headers:=jsonb_build_object('Authorization','Bearer '||s.secret),timeout_milliseconds:=10000)
 from (select (select decrypted_secret from vault.decrypted_secrets where name='app_base_url') as base,(select decrypted_secret from vault.decrypted_secrets where name='cron_secret') as secret) s
 where nullif(btrim(s.base),'') is not null and length(s.secret)>=16;
$job$);
