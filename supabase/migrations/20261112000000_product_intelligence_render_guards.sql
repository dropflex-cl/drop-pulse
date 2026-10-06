-- Un plan del chat solo puede renderizarse con su contexto y referencias vigentes.
create function public.pi_stamp_content_run() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.input->>'source'='mcp_chat' then
   new.input:=new.input||jsonb_build_object('generation_stamp',public.pi_ugc_context_stamp(new.product_id));
 end if;
 return new;
end $$;
create trigger pi_stamp_creative_run before insert on public.creative_runs for each row execute function public.pi_stamp_content_run();
create trigger pi_stamp_gallery_run before insert on public.page_image_runs for each row execute function public.pi_stamp_content_run();

create function public.pi_guard_content_render() returns trigger language plpgsql security definer set search_path='' as $$
declare input jsonb; parent_product uuid; parent_owner uuid; superseded timestamptz; deleting timestamptz;
begin
 if tg_table_name='creative_assets' then
   select c.product_id,c.user_id,c.superseded_at,r.input into parent_product,parent_owner,superseded,input
     from public.creative_concepts c join public.creative_runs r on r.id=c.run_id where c.id=new.concept_id;
 else
   if new.shot_id is null then return new; end if;
   select s.product_id,s.user_id,s.superseded_at,r.input into parent_product,parent_owner,superseded,input
     from public.page_image_shots s join public.page_image_runs r on r.id=s.run_id where s.id=new.shot_id;
 end if;
 if parent_product is distinct from new.product_id or parent_owner is distinct from new.user_id then raise exception 'PI_INVALID_REFERENCE'; end if;
 select pi_deleting_at into deleting from public.products where id=parent_product and user_id=parent_owner for update;
 if not found or deleting is not null then raise exception 'PI_NOT_FOUND'; end if;
 if superseded is not null then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if input->>'source'='mcp_chat' then
   if input->>'generation_stamp' is distinct from public.pi_ugc_context_stamp(parent_product) or
     input->'content'->>'strategy_id' is distinct from (select active_strategy_id::text from public.product_intelligence where product_id=parent_product) then raise exception 'PI_REVISION_CONFLICT'; end if;
 end if;
 return new;
end $$;
create trigger pi_guard_creative_render before insert on public.creative_assets for each row execute function public.pi_guard_content_render();
create trigger pi_guard_gallery_render before insert on public.page_images for each row execute function public.pi_guard_content_render();
revoke all on function public.pi_stamp_content_run(),public.pi_guard_content_render() from public,anon,authenticated,service_role;
