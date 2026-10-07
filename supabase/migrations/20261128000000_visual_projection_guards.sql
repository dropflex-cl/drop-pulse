-- Califica variables y columnas de las proyecciones.
-- Endurece validación y mantiene proyecciones transaccionales.
create or replace function public.pi_validate_visual_record(p_access jsonb,p_product_id uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare owner_id uuid:=(p_access->>'user_id')::uuid; visual_payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(visual_payload) is distinct from 'object' or octet_length(visual_payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_access->>'actor_kind'<>'merchant' and ((p_record->>'status' in ('approved','selected','rejected','in_review') and kind<>'iteration') or kind='review' or (p_record->>'status'='archived' and (kind<>'binding' or exists(select 1 from public.pi_visual_records where id=(p_record->>'id')::uuid and status='selected')))) then raise exception 'PI_FORBIDDEN'; end if;
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
  if p_access->>'actor_kind'<>'merchant' and p_record->>'status'<>'generated' then raise exception 'PI_FORBIDDEN'; end if;
  if not exists(select 1 from public.pi_visual_files where id=(visual_payload->>'file_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if visual_payload->>'representation'='real_evidence' and visual_payload->>'source_system'<>'manual' then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='binding' then
  perform public.pi_visual_validate_target(p_product_id,owner_id,visual_payload->'target');
  select * into row from public.pi_visual_records where id=(visual_payload->>'asset_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset';
  if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_record->>'status'='selected' and (row.status<>'approved' or row.payload->>'archived_at' is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='review' then
  if not exists(select 1 from public.pi_visual_records where id=(visual_payload->>'subject_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 for ref in select visual_payload->'identity_ref' union all select visual_payload->'plan_ref' loop
  if ref is not null and ref<>'null'::jsonb and not exists(select 1 from public.pi_visual_versions where record_id=(ref->>'id')::uuid and product_id=p_product_id and user_id=owner_id and version=(ref->>'version')::bigint and record->>'etag'=ref->>'etag') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(coalesce(visual_payload->'reference_asset_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.pi_visual_records where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
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
 return new;
end $$;
