-- Revalida también renders disparados desde la UI, inmediatamente antes de usar un proveedor.
create or replace function public.pi_stamp_content_run() returns trigger language plpgsql security definer set search_path='' as $$
declare base_id uuid;
begin
 if new.input->>'source'='mcp_chat' then
   select id into base_id from public.product_reference_images where product_id=new.product_id and user_id=new.user_id and not excluded
     order by is_base desc,is_cover desc,position,id limit 1;
   new.input:=new.input||jsonb_build_object('generation_stamp',public.pi_ugc_context_stamp(new.product_id),'base_reference_id',base_id);
 end if;
 return new;
end $$;

create or replace function public.pi_guard_content_render() returns trigger language plpgsql security definer set search_path='' as $$
declare input jsonb; parent_product uuid; parent_owner uuid; superseded timestamptz; deleting timestamptz;
begin
 perform 1 from public.products where id=new.product_id and user_id=new.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
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
create function public.pi_content_render_context(p_kind text,p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_product uuid; target_owner uuid; input jsonb; superseded timestamptz;
begin
 if p_kind='creative' then select a.product_id,a.user_id into target_product,target_owner from public.creative_assets a where a.id=p_asset_id;
 elsif p_kind='gallery' then select a.product_id,a.user_id into target_product,target_owner from public.page_images a where a.id=p_asset_id;
 else raise exception 'PI_VALIDATION_ERROR'; end if;
 perform 1 from public.products p where p.id=target_product and p.user_id=target_owner and p.pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if p_kind='creative' then
   select r.input,c.superseded_at into input,superseded from public.creative_assets a join public.creative_concepts c on c.id=a.concept_id join public.creative_runs r on r.id=c.run_id
     where a.id=p_asset_id and c.user_id=target_owner and c.product_id=target_product;
 else
   select r.input,s.superseded_at into input,superseded from public.page_images a join public.page_image_shots s on s.id=a.shot_id join public.page_image_runs r on r.id=s.run_id
     where a.id=p_asset_id and s.user_id=target_owner and s.product_id=target_product;
 end if;
 if input->>'source' is distinct from 'mcp_chat' then return '{}'::jsonb; end if;
 if superseded is not null or input->>'generation_stamp' is distinct from public.pi_ugc_context_stamp(target_product) or
   input->'content'->>'strategy_id' is distinct from (select i.active_strategy_id::text from public.product_intelligence i where i.product_id=target_product)
   then raise exception 'PI_REVISION_CONFLICT'; end if;
 if input->>'base_reference_id' is null then raise exception 'PI_INVALID_REFERENCE'; end if;
 return jsonb_build_object('base_reference_id',input->>'base_reference_id');
end $$;
revoke all on function public.pi_content_render_context(text,uuid) from public,anon,authenticated;
grant execute on function public.pi_content_render_context(text,uuid) to service_role;
