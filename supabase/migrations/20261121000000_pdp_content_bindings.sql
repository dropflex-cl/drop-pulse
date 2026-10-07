-- Metadata opcional sobre el contenido actual, sin reinterpretar las PDP antiguas como verificadas.
alter table public.page_components add column pdp_metadata jsonb check(pdp_metadata is null or jsonb_typeof(pdp_metadata)='object');
-- Conservar el writer 1.1 y su firma pública; la envoltura nueva corre en la misma transacción.
alter function public.pi_commit_landing(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) rename to pi_commit_landing_legacy;
revoke all on function public.pi_commit_landing_legacy(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) from service_role;
create function public.pi_commit_landing(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; part jsonb; meta jsonb; plan public.pi_persuasion_plans; experience public.pi_landing_experiences;
 section jsonb; committed_result jsonb; receipt public.pi_idempotency_records;
 protected record; previous jsonb; incoming jsonb; current_row public.page_components;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content' and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
  -- Copy regenerado por el chat no borra las decisiones manuales de experiencias existentes.
  if p_access->>'actor_kind'<>'merchant' then
   for protected in select s.value from public.pi_landing_experiences e
    cross join lateral jsonb_array_elements(e.payload->'sections') s
    where e.product_id=p_product_id and e.user_id=owner_id and e.status<>'archived'
     and s.value->>'component'=part->>'component'
     and ((s.value->'manual_overrides') ? 'content' or (s.value->'manual_overrides') ? 'assets') loop
    select * into current_row from public.page_components where product_id=p_product_id and user_id=owner_id and superseded_at is null and component=part->>'component';
    previous:=coalesce(current_row.content,current_row.proposal); incoming:=part->'content';
    if jsonb_typeof(previous)='array' then
     select value into previous from jsonb_array_elements(previous) v where v->>'key'=protected.value->>'content_variant_key';
    elsif protected.value->>'content_variant_key'='default' then previous:=jsonb_build_object('content',previous,'images',current_row.images);
    else previous:=null; end if;
    if jsonb_typeof(incoming)='array' then
     select value into incoming from jsonb_array_elements(incoming) v where v->>'key'=protected.value->>'content_variant_key';
    elsif protected.value->>'content_variant_key'='default' then incoming:=jsonb_build_object('content',incoming,'images','[]'::jsonb);
    else incoming:=null; end if;
    if incoming is null or previous is null
     or ((protected.value->'manual_overrides') ? 'content' and previous->'content' is distinct from incoming->'content')
     or ((protected.value->'manual_overrides') ? 'assets' and coalesce(previous->'images',current_row.images,'[]'::jsonb) is distinct from coalesce(incoming->'images','[]'::jsonb)) then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
   end loop;
  end if;
  meta:=part->'metadata';
  if meta is null then continue; end if;
  if not (select pdp_persuasion_enabled from public.products where id=p_product_id) then raise exception 'PI_VALIDATION_ERROR'; end if;
  select * into plan from public.pi_persuasion_plans where id=(meta->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or plan.angle_id::text is distinct from meta->>'angle_id' or plan.landing_angle_id is distinct from meta->>'landing_angle_id' then raise exception 'PI_INVALID_REFERENCE'; end if;
  select value into section from jsonb_array_elements(plan.payload->'sections') s where s->>'section_key'=meta->>'section_key';
  if section is null or section->>'selected_component' is distinct from part->>'component' or section->>'primary_job' is distinct from meta->>'persuasion_job'
    or not ((section->'belief_keys') @> (meta->'belief_keys')) or not ((section->'claim_keys') @> (meta->'claim_keys'))
    or not ((section->'fact_ids') @> (meta->'fact_ids')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if meta ? 'experience_id' then
   select * into experience from public.pi_landing_experiences where id=(meta->>'experience_id')::uuid and product_id=p_product_id and user_id=owner_id;
   if not found or experience.persuasion_plan_id<>plan.id or experience.landing_hook_id is distinct from meta->>'landing_hook_id' then raise exception 'PI_INVALID_REFERENCE'; end if;
  end if;
 end loop;
 committed_result:=public.pi_commit_landing_legacy(p_access,p_product_id,p_expected_revision,p_etag,p_stamp,p_key,p_hash,p_entries,p_dry_run);
 if p_dry_run then return committed_result; end if;
 for part in select value from jsonb_array_elements(p_entries) where value ? 'metadata' loop
  update public.page_components set pdp_metadata=part->'metadata' where product_id=p_product_id and user_id=owner_id and superseded_at is null and component=part->>'component';
 end loop;
 committed_result:=jsonb_set(committed_result,'{data,landing_etag}',to_jsonb(public.pi_snapshot_hash(public.pi_landing_state(p_product_id,owner_id)->'rows')));
 update public.pi_idempotency_records set result=committed_result where product_id=p_product_id and user_id=owner_id and tool='save_landing_content' and idempotency_key=p_key;
 return committed_result;
end $$;
revoke all on function public.pi_commit_landing(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_commit_landing(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) to service_role;
