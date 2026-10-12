-- Carruseles publicitarios: una pieza en ad_media, archivos reutilizables y decisiones explícitas.
begin;
-- Conserva los contratos anteriores y añade el nuevo recibo.
do $$ declare previous_check text; begin
 select pg_get_expr(conbin,conrelid) into previous_check from pg_constraint where conrelid='public.pi_idempotency_records'::regclass and conname='pi_idempotency_records_tool_check';
 alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
 execute format('alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check ((%s) or tool=%L)',previous_check,'save_ad_carousel');
end $$;
alter table public.ad_media drop constraint ad_media_kind_check;
alter table public.ad_media add constraint ad_media_kind_check check(kind in ('image','video','carousel'));
alter table public.ad_media add column carousel_content jsonb;
alter table public.ad_media add constraint ad_media_carousel_content_check check((kind='carousel')=(carousel_content is not null));
alter table public.ad_media add column carousel_etag text generated always as (public.pi_snapshot_hash(carousel_content)) stored;
alter table public.ad_campaigns add column media_snapshot jsonb;

create function public.pi_load_ad_carousels(p_access jsonb,p_product_id uuid,p_carousel_id uuid default null,
 p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; receipt public.pi_idempotency_records;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if not exists(select 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null) then raise exception 'PI_NOT_FOUND'; end if;
 if p_key is not null and not p_dry_run then
  perform public.pi_authorize_context(p_access,'product_intelligence:write');
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_ad_carousel' and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return jsonb_build_object('replay',receipt.result);
  end if;
 end if;
 if p_carousel_id is not null and not exists(select 1 from public.ad_media where id=p_carousel_id and product_id=p_product_id and user_id=owner_id and kind='carousel') then raise exception 'PI_NOT_FOUND'; end if;
 return jsonb_build_object('revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
  'carousels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'content',carousel_content,'etag',public.pi_snapshot_hash(carousel_content)) order by created_at,id)
   from public.ad_media where product_id=p_product_id and user_id=owner_id and kind='carousel' and (p_carousel_id is null or id=p_carousel_id)),'[]'::jsonb));
end $$;

create function public.pi_save_ad_carousel(p_access jsonb,p_product_id uuid,p_carousel_id uuid,p_etag text,
 p_key text,p_hash text,p_content jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare owner_id uuid; current_content jsonb; next_content jsonb; cards jsonb:='[]'; card jsonb; previous jsonb;
 rev bigint; receipt public.pi_idempotency_records; result jsonb; snap jsonb; request_id uuid:=gen_random_uuid(); cid uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_ad_carousel' and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 cid:=coalesce(p_carousel_id,gen_random_uuid());
 if p_carousel_id is not null then
  select carousel_content into current_content from public.ad_media where id=cid and product_id=p_product_id and user_id=owner_id and kind='carousel' for update;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  if p_etag is distinct from public.pi_snapshot_hash(current_content) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 elsif p_etag<>'' then raise exception 'PI_ARTIFACT_CONFLICT';
 elsif (select count(*) from public.ad_media where product_id=p_product_id and user_id=owner_id and kind='carousel')>=30 then raise exception 'PI_VALIDATION_ERROR';
 end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or
  jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>65536 or
  coalesce(p_content->>'ratio','') not in ('1:1','4:5') or jsonb_typeof(p_content->'cards') is distinct from 'array' or
  jsonb_array_length(p_content->'cards') not between 2 and 10 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_content->>'strategy_id' is not null and not exists(select 1 from public.pi_strategy_versions where id=(p_content->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_content->>'angle_id' is not null and not exists(select 1 from public.pi_angles where id=(p_content->>'angle_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if (select count(distinct value->>'key') from jsonb_array_elements(p_content->'cards'))<>jsonb_array_length(p_content->'cards') then raise exception 'PI_VALIDATION_ERROR'; end if;
 for card in select value from jsonb_array_elements(p_content->'cards') loop
  select value into previous from jsonb_array_elements(coalesce(current_content->'cards','[]'::jsonb)) where value->>'key'=card->>'key';
  if not(card ? 'asset_id') and not(card ? 'media_id') then
   card:=card||jsonb_build_object('asset_id',previous->'asset_id','media_id',previous->'media_id');
  elsif card->>'asset_id' is not null then card:=card||jsonb_build_object('media_id',null);
  elsif card->>'media_id' is not null then card:=card||jsonb_build_object('asset_id',null);
  end if;
  if not(card ? 'enabled') then card:=card||jsonb_build_object('enabled',coalesce((previous->>'enabled')::boolean,true)); end if;
  if card->>'asset_id' is not null and card->>'asset_id' is distinct from previous->>'asset_id' and not exists(select 1 from public.pi_visual_records where id=(card->>'asset_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset' and status not in ('rejected','archived')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if card->>'media_id' is not null and not exists(select 1 from public.ad_media where id=(card->>'media_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='image') then raise exception 'PI_INVALID_REFERENCE'; end if;
  cards:=cards||jsonb_build_array(card);
 end loop;
 next_content:=p_content||jsonb_build_object('cards',cards,'enabled',coalesce((p_content->>'enabled')::boolean,(current_content->>'enabled')::boolean,true));
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if not p_dry_run then
  -- No es un archivo: preview y lanzamiento resuelven las imágenes de las tarjetas desde sus IDs.
  insert into public.ad_media(id,user_id,product_id,kind,name,storage_path,mime_type,ratio,size_bytes,status,carousel_content,content_provenance)
   values(cid,owner_id,p_product_id,'carousel',next_content->>'name','','application/json',next_content->>'ratio',0,'ready',next_content,
    jsonb_build_object('kind','carousel','strategy_id',next_content->>'strategy_id','angle_id',next_content->>'angle_id','landing_angle_id',next_content->>'landing_angle_id','landing_hook_id',next_content->>'landing_hook_id'))
   on conflict(id) do update set name=excluded.name,ratio=excluded.ratio,carousel_content=excluded.carousel_content,content_provenance=excluded.content_provenance,updated_at=clock_timestamp();
  insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict(product_id) do nothing;
  update public.product_intelligence set revision=rev+1,updated_at=clock_timestamp() where product_id=p_product_id;
  snap:=public.pi_context_snapshot(p_product_id);
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev+1,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_ad_carousel',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_object('carousel_id',cid,'before',current_content,'after',next_content));
  rev:=rev+1;
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not p_dry_run,'dry_run',p_dry_run,'carousel_id',cid,'etag',public.pi_snapshot_hash(next_content),'next_action','Carrusel guardado. Asigna las imágenes que faltan; crear y publicar en Meta son acciones aparte.'));
 if not p_dry_run then
  delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_ad_carousel' and idempotency_key=p_key and expires_at<=clock_timestamp();
  insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_ad_carousel',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 end if;
 return result;
end $$;
revoke all on function public.pi_load_ad_carousels(jsonb,uuid,uuid,text,text,boolean),public.pi_save_ad_carousel(jsonb,uuid,uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_ad_carousels(jsonb,uuid,uuid,text,text,boolean),public.pi_save_ad_carousel(jsonb,uuid,uuid,text,text,text,jsonb,boolean) to service_role;

-- Amplía el validador existente sin cambiar los destinos anteriores.
alter function public.pi_visual_validate_target(uuid,uuid,jsonb) rename to pi_visual_validate_target_before_carousels;
create function public.pi_visual_validate_target(p_product_id uuid,p_owner uuid,t jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if t->>'type'='ad_carousel_card' then
  if not exists(select 1 from public.ad_media m,jsonb_array_elements(m.carousel_content->'cards') c where m.id=(t->>'carousel_id')::uuid and m.product_id=p_product_id and m.user_id=p_owner and m.kind='carousel' and c->>'key'=t->>'card_key' and m.carousel_content->>'ratio'=t->>'ratio') then raise exception 'PI_INVALID_REFERENCE'; end if;
 else perform public.pi_visual_validate_target_before_carousels(p_product_id,p_owner,t);
 end if;
end $$;
revoke all on function public.pi_visual_validate_target_before_carousels(uuid,uuid,jsonb),public.pi_visual_validate_target(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Una asignación de imagen actualiza la misma tarjeta que editan UI y MCP.
create function public.pi_project_carousel_binding() returns trigger
language plpgsql security definer set search_path='' as $$
declare target jsonb; active boolean; next_cards jsonb; selected_asset public.pi_visual_records; file public.pi_visual_files;
begin
 if new.kind<>'binding' or new.payload->'target'->>'type'<>'ad_carousel_card' then return new; end if;
 target:=new.payload->'target'; active:=new.status='selected';
 if tg_op='UPDATE' and new.status=old.status and new.payload->>'asset_id'=old.payload->>'asset_id' then return new; end if;
 if not active and (tg_op='INSERT' or old.status<>'selected') then return new; end if;
 if active then perform public.pi_visual_validate_target(new.product_id,new.user_id,target); end if;
 perform 1 from public.ad_media where id=(target->>'carousel_id')::uuid and product_id=new.product_id and user_id=new.user_id for update;
 if active then
  select * into selected_asset from public.pi_visual_records where id=(new.payload->>'asset_id')::uuid and product_id=new.product_id and user_id=new.user_id and kind='asset' and status not in ('rejected','archived');
  select * into file from public.pi_visual_files where id=(selected_asset.payload->>'file_id')::uuid and product_id=new.product_id and user_id=new.user_id;
  if file.id is null or not exists(select 1 from public.pi_visual_renditions where file_id=file.id and profile='ads') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 select jsonb_agg(case when c->>'key'=target->>'card_key' and (active or c->>'asset_id'=new.payload->>'asset_id') then c||jsonb_build_object('asset_id',case when active then new.payload->'asset_id' else 'null'::jsonb end,'media_id',null) else c end order by n)
  into next_cards from public.ad_media m,jsonb_array_elements(m.carousel_content->'cards') with ordinality a(c,n)
  where m.id=(target->>'carousel_id')::uuid and m.product_id=new.product_id and m.user_id=new.user_id;
 if next_cards is null then return new; end if;
 update public.ad_media set carousel_content=jsonb_set(carousel_content,'{cards}',next_cards),updated_at=clock_timestamp() where id=(target->>'carousel_id')::uuid and product_id=new.product_id and user_id=new.user_id;
 return new;
end $$;
create trigger pi_project_carousel_binding after insert or update on public.pi_visual_records for each row execute function public.pi_project_carousel_binding();
revoke all on function public.pi_project_carousel_binding() from public,anon,authenticated,service_role;
alter function public.pi_visual_source_state(uuid,uuid) rename to pi_visual_source_state_before_carousels;
create function public.pi_visual_source_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.pi_visual_source_state_before_carousels(p_product_id,p_owner_id) || jsonb_build_object('ad_carousels',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'content',m.carousel_content) order by m.created_at,m.id) from public.ad_media m where m.product_id=p_product_id and m.user_id=p_owner_id and m.kind='carousel'),'[]'::jsonb))
$$;
revoke all on function public.pi_visual_source_state(uuid,uuid), public.pi_visual_source_state_before_carousels(uuid,uuid) from public,anon,authenticated;

commit;
