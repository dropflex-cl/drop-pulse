-- Nullable values are part of the structured visual contract.
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
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw)));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $$;

create or replace function public.pi_project_visual_binding() returns trigger language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare t jsonb; asset public.pi_visual_records; f public.pi_visual_files; r public.pi_visual_renditions; ad public.pi_visual_renditions;
 exp public.pi_landing_experiences; next_payload jsonb; sections jsonb; section jsonb; picks jsonb; variant jsonb; row public.page_components;
 media_id uuid; concept public.creative_concepts; shot public.video_shots; active boolean; slot text; pos int;
begin
 if new.kind<>'binding' then return new; end if;
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 active:=new.status='selected';
 if not active and (tg_op='INSERT' or old.status<>'selected') then return new; end if;
 perform set_config('pi.visual_projection','true',true);
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
   next_payload:=exp.payload||jsonb_build_object('sections',sections);
   update public.pi_landing_experiences set payload=next_payload,revision=exp.revision+1,etag=public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,next_payload)),updated_at=clock_timestamp() where id=exp.id;
   insert into public.pi_pdp_revisions(product_id,user_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
    values(exp.product_id,exp.user_id,exp.id,exp.revision+1,public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,next_payload)),next_payload,'[]',new.user_id::text,'merchant');
   select * into row from public.page_components where product_id=new.product_id and user_id=new.user_id and component=t->>'component' and superseded_at is null for update;
   if row.id is null then raise exception 'PI_INVALID_REFERENCE'; end if;
   next_payload:=coalesce(row.content,row.proposal);
   if jsonb_typeof(next_payload)='array' then
    sections:='[]';
    for variant in select value from jsonb_array_elements(next_payload) loop
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
 perform set_config('pi.visual_projection','false',true);
 return new;
end $$;


-- A visual use is selected exclusively by merchant review of its binding.
create function public.pi_guard_visual_projection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('pi.visual_projection',true),'false')='true' then return new; end if;
 if tg_op='DELETE' then
  if old.visual_binding_id is not null and exists(select 1 from public.products where id=old.product_id and pi_deleting_at is null) then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if new.visual_binding_id is not null then raise exception 'PI_FORBIDDEN'; end if;
 elsif old.visual_binding_id is not null and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'PI_DEPENDENCY_IN_USE';
 elsif new.visual_binding_id is distinct from old.visual_binding_id then raise exception 'PI_FORBIDDEN'; end if;
 return new;
end $$;
create trigger guard_visual_projection before insert or update or delete on public.page_images for each row execute function public.pi_guard_visual_projection();
create trigger guard_visual_projection before insert or update or delete on public.creative_assets for each row execute function public.pi_guard_visual_projection();
-- Video workers update execution metadata on ordinary rows. External keyframes stay immutable.
create trigger guard_visual_projection before insert or update or delete on public.video_shots for each row execute function public.pi_guard_visual_projection();
revoke all on function public.pi_guard_visual_projection() from public,anon,authenticated;
