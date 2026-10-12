-- Destinos nativos por componente, variante, slot y posición. Sin tablas ni aprobaciones nuevas.
-- Une una posición de un slot sin perder selecciones manuales ni otros espacios.
create or replace function public.pi_component_image_pick(p_images jsonb,p_slot text,p_position int,p_image_id uuid,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare normalized jsonb; result jsonb;
begin
 select coalesce(jsonb_agg(p||jsonb_build_object('position',coalesce((p->>'position')::int,n)) order by ord),'[]') into normalized
 from (select p,ord,row_number() over(partition by p->>'slot' order by ord)::int n from jsonb_array_elements(coalesce(p_images,'[]')) with ordinality a(p,ord)) a;
 select coalesce(jsonb_agg(p order by ord),'[]') into result from jsonb_array_elements(normalized) with ordinality a(p,ord)
 where case when p_active then not (p->>'slot'=p_slot and (p->>'position')::int=p_position) else not (p->>'source'='page_image' and p->>'id'=p_image_id::text) end;
 if p_active then result:=result||jsonb_build_array(jsonb_build_object('slot',p_slot,'source','page_image','id',p_image_id,'position',p_position)); end if;
 select coalesce(jsonb_agg(p order by first_ord,(p->>'position')::int,ord),'[]') into result
 from (select p,ord,min(ord) over(partition by p->>'slot') first_ord from jsonb_array_elements(result) with ordinality a(p,ord)) a;
 return result;
end $$;
revoke all on function public.pi_component_image_pick(jsonb,text,int,uuid,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pi_visual_validate_target(p_product_id uuid, p_owner uuid, t jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row public.page_components; effective jsonb; max_position int;
begin
 if t->>'type'='gallery_shot' then
  if t->>'slot' not in ('cover','gallery') and not exists(select 1 from public.page_image_shots where product_id=p_product_id and user_id=p_owner and slot=t->>'slot' and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if t->>'slot'='gallery' and (t->>'position')::int not between 1 and 12 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif t->>'type'='landing_section' then
  if not exists(select 1 from public.pi_landing_experiences e,jsonb_array_elements(e.payload->'sections') s where e.id=(t->>'experience_id')::uuid and e.product_id=p_product_id and e.user_id=p_owner and e.status<>'archived'
    and s->>'section_key'=t->>'section_key' and s->>'component'=t->>'component' and s->>'content_variant_key'=t->>'content_variant_key') then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='landing_component' then
  max_position:=case (t->>'component')||':'||(t->>'slot')
   when 'image-with-benefits:main' then 1 when 'mechanism:main' then 1
   when 'use-cases:cases' then 5 when 'before-after:before' then 1 when 'before-after:after' then 1
   when 'stats-with-image:collage' then 4 when 'usage-steps:steps' then 5
   when 'product-includes:items' then 6 when 'insta-story:stories' then 10 when 'expert-endorsement:portrait' then 1 else 0 end;
  if max_position=0 or coalesce((t->>'position')::int,0) not between 1 and max_position then raise exception 'PI_INVALID_REFERENCE'; end if;
  select * into row from public.page_components where product_id=p_product_id and user_id=p_owner and component=t->>'component' and superseded_at is null;
  if row.id is null or row.status='rejected' then raise exception 'PI_INVALID_REFERENCE'; end if;
  effective:=coalesce(row.content,row.proposal);
  if jsonb_typeof(effective)='array' then
   if not exists(select 1 from jsonb_array_elements(effective) v where v->>'key'=t->>'content_variant_key') then raise exception 'PI_INVALID_REFERENCE'; end if;
  elsif t->>'content_variant_key' is distinct from 'default' then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='creative_concept' then
  if not exists(select 1 from public.creative_concepts where id=(t->>'concept_id')::uuid and product_id=p_product_id and user_id=p_owner and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='ugc_shot' then
  if not exists(select 1 from public.video_shots v join public.video_scripts s on s.id=v.script_id where v.id=(t->>'video_shot_id')::uuid and v.script_id=(t->>'script_id')::uuid and v.product_id=p_product_id and v.user_id=p_owner
    and v.superseded_at is null and s.superseded_at is null and ((t->>'slot'='keyframe' and v.kind='keyframe') or (t->>'slot'='b_roll' and v.kind='b_roll'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
 else raise exception 'PI_INVALID_REFERENCE'; end if;
end $function$;

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
 if t->>'type'='landing_component' then
  select * into row from public.page_components where product_id=new.product_id and user_id=new.user_id and component=t->>'component' and superseded_at is null for update;
  if row.id is null then
   if active then raise exception 'PI_INVALID_REFERENCE'; end if;
   update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp() where visual_binding_id=new.id;
   perform set_config('pi.visual_projection','false',true); return new;
  end if;
  if active then
   insert into public.page_images(id,product_id,user_id,slot,source,storage_path,width,height,size_bytes,status,position,decided_at,visual_binding_id,input,render_status)
    values(new.id,new.product_id,new.user_id,'visual-'||new.id::text,'upload',f.storage_path,f.width,f.height,f.size_bytes,'approved',1,clock_timestamp(),new.id,jsonb_build_object('visual_asset_id',asset.id,'component_target',t),'succeeded')
    on conflict(id) do update set status='approved',position=1,decided_at=excluded.decided_at,updated_at=clock_timestamp();
  else update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp() where visual_binding_id=new.id;
  end if;
  next_payload:=coalesce(row.content,row.proposal);
  if jsonb_typeof(next_payload)='array' then
   sections:='[]';
   for variant in select value from jsonb_array_elements(next_payload) loop
    if variant->>'key'=t->>'content_variant_key' then
     picks:=public.pi_component_image_pick(coalesce(variant->'images',row.images),t->>'slot',(t->>'position')::int,new.id,active);
     variant:=variant||jsonb_build_object('images',picks);
    end if;
    sections:=sections||jsonb_build_array(variant);
   end loop;
   update public.page_components set content=sections,proposal=sections,updated_at=clock_timestamp() where id=row.id;
  else
   picks:=public.pi_component_image_pick(row.images,t->>'slot',(t->>'position')::int,new.id,active);
   update public.page_components set images=picks,updated_at=clock_timestamp() where id=row.id;
  end if;
  -- La experiencia comparte las mismas imágenes vigentes, conservando orden y visibilidad.
  if picks is not null then
  for exp in select * from public.pi_landing_experiences where product_id=new.product_id and user_id=new.user_id and status<>'archived' for update loop
   sections:='[]';
   for section in select value from jsonb_array_elements(exp.payload->'sections') loop
    if section->>'component'=t->>'component' and section->>'content_variant_key'=t->>'content_variant_key' then
     section:=section||jsonb_build_object('images',picks);
    end if;
    sections:=sections||jsonb_build_array(section);
   end loop;
   next_payload:=exp.payload||jsonb_build_object('sections',sections);
   if next_payload is distinct from exp.payload then
    update public.pi_landing_experiences set payload=next_payload,revision=exp.revision+1,etag=public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,next_payload)),updated_at=clock_timestamp() where id=exp.id;
    insert into public.pi_pdp_revisions(product_id,user_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
     values(exp.product_id,exp.user_id,exp.id,exp.revision+1,public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,next_payload)),next_payload,'[]',new.user_id::text,'merchant');
   end if;
  end loop;
  end if;
 elsif t->>'type' in ('gallery_shot','landing_section') then
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
   if not active and (exp.id is null or not exists(select 1 from jsonb_array_elements(exp.payload->'sections') s where s->>'section_key'=t->>'section_key' and (s->>'enabled')::boolean)) then
    perform set_config('pi.visual_projection','false',true); return new;
   end if;
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


-- Medios específicos para distinguir texto completo de presentación completa.
create or replace function public.pi_visual_source_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with ctx as materialized (select public.pi_context_snapshot(p_product_id) as snapshot)
 select jsonb_build_object('context',ctx.snapshot,'pdp',public.pi_pdp_state_with_snapshot(p_product_id,p_owner_id,ctx.snapshot),
  'references',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.product_reference_images r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb),
  'page_images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slot',i.slot,'is_selected',i.is_selected,'discarded_at',i.discarded_at,'render_status',i.render_status,'storage_path',i.storage_path) order by i.position,i.id) from public.page_images i where i.product_id=p_product_id and i.user_id=p_owner_id and i.slot='gifs'),'[]'::jsonb),
  'gallery',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.page_image_runs r where r.product_id=p_product_id and r.user_id=p_owner_id and r.status='succeeded'),'[]'::jsonb),
  'gallery_shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.position,s.id) from public.page_image_shots s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null),'[]'::jsonb),
  'creative_concepts',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.creative_concepts c where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null),'[]'::jsonb),
  'scripts',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_scripts s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null),'[]'::jsonb),
  'video_shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.video_shots s where s.product_id=p_product_id and s.user_id=p_owner_id),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'etag',r.etag,'status',r.status,'payload',r.payload,'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id) from public.pi_visual_records r where r.product_id=p_product_id and r.user_id=p_owner_id),'[]'::jsonb)) from ctx
$$;
