-- El aprendizaje cita revisiones inmutables; no convierte métricas de campaña en atribución PDP.
alter function public.pi_commit_learning(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) rename to pi_commit_learning_legacy;
revoke all on function public.pi_commit_learning_legacy(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) from service_role;
create function public.pi_commit_learning(p_access jsonb,p_product_id uuid,p_from date,p_through date,p_expected_revision bigint,p_etag text,p_key text,p_hash text,p_learning jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; receipt public.pi_idempotency_records; execution jsonb; experience jsonb; plan jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'performance:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_product_learning' and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 execution:=p_learning->'execution';
 if execution is not null then
  if execution->>'measurement_attribution' is distinct from 'product_campaigns_only' then raise exception 'PI_VALIDATION_ERROR'; end if;
  select payload into experience from public.pi_pdp_revisions where product_id=p_product_id and user_id=owner_id
   and experience_id=(execution->>'experience_id')::uuid and revision=(execution->>'experience_revision')::bigint;
  select payload into plan from public.pi_pdp_revisions where product_id=p_product_id and user_id=owner_id
   and plan_id=(execution->>'persuasion_plan_id')::uuid and revision=(execution->>'plan_revision')::bigint;
  if experience is null or plan is null or experience->>'strategy_id' is distinct from p_learning->>'strategy_id'
   or experience->>'angle_id' is distinct from execution->>'angle_id' or experience->>'persuasion_plan_id' is distinct from execution->>'persuasion_plan_id'
   or experience->>'plan_revision' is distinct from execution->>'plan_revision' or experience->>'architecture_variant' is distinct from execution->>'architecture_variant'
   or (execution ? 'section_key' and not exists(select 1 from jsonb_array_elements(experience->'sections') s where s->>'section_key'=execution->>'section_key')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 return public.pi_commit_learning_legacy(p_access,p_product_id,p_from,p_through,p_expected_revision,p_etag,p_key,p_hash,p_learning,p_dry_run);
end $$;
revoke all on function public.pi_commit_learning(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_commit_learning(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) to service_role;
