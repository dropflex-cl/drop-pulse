alter table public.ad_media add column content_provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(content_provenance)='object');

create function public.pi_creative_execution_binding() returns trigger language plpgsql security definer set search_path='' as $$
declare input jsonb; angle jsonb;
begin
 if new.payload->>'source'='mcp_chat' then
   select r.input into input from public.creative_runs r where r.id=new.run_id and r.product_id=new.product_id and r.user_id=new.user_id;
   select a into angle from jsonb_array_elements(input->'strategy_snapshot'->'angles') with ordinality t(a,slot) where a->>'id'=new.payload->>'angle_id' and slot=new.angle_slot;
   if angle is null or new.payload->>'landing_angle_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or new.payload->>'landing_hook_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or new.payload->>'landing_angle_id' is null or new.payload->>'landing_hook_id' is null then raise exception 'PI_INVALID_REFERENCE'; end if;
   new.payload:=new.payload||jsonb_build_object('sales_angle',angle->'frame','provenance',new.payload->'provenance'||jsonb_build_object(
     'kind','static','execution_key',new.payload->>'execution_key','landing_angle_id',new.payload->>'landing_angle_id','landing_hook_id',new.payload->>'landing_hook_id','generation_stamp',input->>'generation_stamp'));
 end if;
 return new;
end $$;
create trigger pi_creative_execution_binding before insert on public.creative_concepts for each row execute function public.pi_creative_execution_binding();

create function public.pi_assert_static_publishable(p_access jsonb,p_product_id uuid,p_media_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; media public.ad_media; requested uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 foreach requested in array p_media_ids loop
   select * into media from public.ad_media where id=requested and product_id=p_product_id and user_id=owner_id;
   if media.id is null then raise exception 'PI_INVALID_REFERENCE'; end if;
   if media.content_provenance->>'kind'='static' then
     if media.content_provenance->>'generation_stamp' is distinct from public.pi_ugc_context_stamp(p_product_id) or
       not exists(select 1 from public.creative_assets a where a.id=(media.content_provenance->>'asset_id')::uuid and a.ad_media_id=media.id and a.product_id=p_product_id and a.user_id=owner_id and a.render_status='succeeded' and a.status='approved') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   end if;
 end loop;
end $$;
revoke all on function public.pi_creative_execution_binding() from public,anon,authenticated,service_role;
revoke all on function public.pi_assert_static_publishable(jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.pi_assert_static_publishable(jsonb,uuid,uuid[]) to service_role;
