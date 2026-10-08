-- La elección explícita de hooks en el chat autoriza el flujo de Shopify para este producto/cliente.
-- No amplía grants ni verifica hechos; las decisiones automáticas mantienen actor, CAS y evidencia.
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in (
 'save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels',
 'save_ugc_content','generate_ugc','save_creative_content','save_gallery_content','save_event_content','save_usage_tip','save_product_learning','generate_gallery_images',
 'save_angle_persuasion_plan','save_landing_experience','authorize_shopify_automation','disable_shopify_automation'));

create table public.pi_shopify_automations (
 product_id uuid primary key references public.products on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 authorization_id uuid not null unique default gen_random_uuid(),
 strategy_id uuid not null references public.pi_strategy_versions on delete cascade,
 actor_id text not null, actor_kind text not null check(actor_kind in ('merchant','delegated')),
 confirmed_hooks jsonb not null check(jsonb_typeof(confirmed_hooks)='array' and jsonb_array_length(confirmed_hooks) between 1 and 3),
 dependency_hash text not null check(dependency_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.pi_shopify_automations enable row level security;
create policy "owner reads Shopify automation" on public.pi_shopify_automations for select to authenticated using(user_id=(select auth.uid()));

create table public.pi_shopify_publication_jobs (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products on delete cascade,
 user_id uuid not null references auth.users on delete cascade, authorization_id uuid not null,
 actor_id text not null, idempotency_key text not null, payload_hash text not null,
 fingerprint text not null, shop_domain text not null, access jsonb not null,
 status text not null check(status in ('queued','running','published','error')) default 'queued',
 lease_token uuid, lease_until timestamptz, error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(product_id,actor_id,idempotency_key)
);
-- La identidad interna del worker solo la lee service_role, no el propietario mediante REST.
alter table public.pi_shopify_publication_jobs enable row level security;
create unique index pi_shopify_one_live_publication on public.pi_shopify_publication_jobs(product_id) where status in ('queued','running');

create function public.pi_shopify_dependency_hash(p_product_id uuid) returns text language sql stable security definer set search_path='' as $$
 select public.pi_snapshot_hash(public.pi_context_snapshot(p_product_id)-'pack_labels');
$$;
create function public.pi_shopify_automation_active(p_access jsonb,p_product_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid; policy public.pi_shopify_automations;
begin
 if not coalesce(p_access->'scopes' ? 'product_intelligence:read',false) then return false; end if;
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if not coalesce(p_access->'scopes' ? 'product_intelligence:write',false) then return false; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 select * into policy from public.pi_shopify_automations where product_id=p_product_id and user_id=owner_id;
 return coalesce(policy.enabled and policy.actor_id=p_access->>'actor_id' and policy.actor_kind=p_access->>'actor_kind'
  and policy.strategy_id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id and user_id=owner_id)
  and policy.dependency_hash=public.pi_shopify_dependency_hash(p_product_id)
  and exists(select 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null),false);
end $$;
create function public.pi_shopify_automation_state(p_access jsonb,p_product_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy public.pi_shopify_automations; active boolean; rev bigint;
begin
 active:=public.pi_shopify_automation_active(p_access,p_product_id);
 select * into policy from public.pi_shopify_automations where product_id=p_product_id and user_id=(p_access->>'user_id')::uuid;
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 return jsonb_build_object('enabled',coalesce(policy.enabled,false),'active',active,'authorization_id',policy.authorization_id,
  'strategy_id',policy.strategy_id,'confirmed_hooks',policy.confirmed_hooks,'dependency_hash',policy.dependency_hash,'revision',rev,
  'next_action',case when active then 'Continúa automáticamente: prepara y aprueba contenido e imágenes de Shopify y llama publish_product cuando publish_ready sea true.'
   else 'Elige los hooks y autoriza aprobar y publicar en Shopify desde el chat.' end);
end $$;

create function public.pi_shopify_automation(p_access jsonb,p_product_id uuid,p_action text,p_expected_revision bigint default null,
 p_key text default null,p_hash text default null,p_payload jsonb default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; strategy public.pi_strategy_versions; hooks jsonb; receipt public.pi_idempotency_records;
 result jsonb; policy public.pi_shopify_automations; job public.pi_shopify_publication_jobs; request_id uuid:=gen_random_uuid();
begin
 if p_action not in ('read','authorize','disable','publish','publish_replay','authorize_replay') then raise exception 'PI_VALIDATION_ERROR'; end if;
 owner_id:=public.pi_authorize_context(p_access,case when p_action='read' then 'product_intelligence:read' else 'product_intelligence:write' end);
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_action='read' then return public.pi_shopify_automation_state(p_access,p_product_id); end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_action in ('publish','publish_replay') then
  if not public.pi_shopify_automation_active(p_access,p_product_id) then raise exception 'PI_FORBIDDEN'; end if;
  select * into job from public.pi_shopify_publication_jobs where product_id=p_product_id and actor_id=p_access->>'actor_id' and idempotency_key=p_key;
  if found then
   if job.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return jsonb_build_object('applied',true,'dry_run',false,'operation_id',job.id,'status',job.status);
  end if;
  if p_action='publish_replay' then return null; end if;
 elsif not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id
   and tool=case when p_action in ('authorize','authorize_replay') then 'authorize_shopify_automation' else 'disable_shopify_automation' end and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return public.pi_shopify_automation_state(p_access,p_product_id);
  end if;
 end if;
 if p_action='authorize_replay' then return null; end if;
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_action='authorize' then
  if p_payload->>'auto_approve_and_publish' is distinct from 'true' then raise exception 'PI_FORBIDDEN'; end if;
  select * into strategy from public.pi_strategy_versions where id=(p_payload->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or strategy.id is distinct from (select active_strategy_id from public.product_intelligence where product_id=p_product_id)
   then raise exception 'PI_INVALID_REFERENCE'; end if;
  select jsonb_agg(jsonb_build_object('angle_id',a->'id','hook',a->'hook')) into hooks from jsonb_array_elements(strategy.snapshot->'angles') a;
  if jsonb_array_length(hooks) not between 1 and 3 or hooks is distinct from p_payload->'confirmed_hooks' then raise exception 'PI_INVALID_REFERENCE'; end if;
  if not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   update public.products set pdp_persuasion_enabled=true where id=p_product_id and user_id=owner_id;
   insert into public.pi_shopify_automations(product_id,user_id,strategy_id,actor_id,actor_kind,confirmed_hooks,dependency_hash)
    values(p_product_id,owner_id,strategy.id,p_access->>'actor_id',p_access->>'actor_kind',hooks,public.pi_shopify_dependency_hash(p_product_id))
    on conflict(product_id) do update set authorization_id=gen_random_uuid(),strategy_id=excluded.strategy_id,actor_id=excluded.actor_id,
     actor_kind=excluded.actor_kind,confirmed_hooks=excluded.confirmed_hooks,dependency_hash=excluded.dependency_hash,enabled=true,updated_at=clock_timestamp();
  end if;
 elsif p_action='disable' then
  if not p_dry_run then update public.pi_shopify_automations set enabled=false,updated_at=clock_timestamp() where product_id=p_product_id and user_id=owner_id; end if;
 else
  select * into policy from public.pi_shopify_automations where product_id=p_product_id;
  if p_payload->>'authorization_id' is distinct from policy.authorization_id::text or p_payload->>'fingerprint' is null or p_payload->>'fingerprint' !~ '^[a-f0-9]{32}$'
   or p_payload->>'shop_domain' is null then raise exception 'PI_INVALID_REFERENCE'; end if;
  update public.pi_shopify_publication_jobs set status='error',error_message='La publicación anterior se interrumpió. Reintenta con el estado actual.',updated_at=clock_timestamp()
   where product_id=p_product_id and ((status='running' and lease_until<=clock_timestamp()) or (status='queued' and created_at<clock_timestamp()-interval '10 minutes')) and not p_dry_run;
  if exists(select 1 from public.product_publications where product_id=p_product_id and status='publishing' and updated_at>clock_timestamp()-interval '10 minutes')
   or exists(select 1 from public.pi_shopify_publication_jobs where product_id=p_product_id and status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
  if p_dry_run then return jsonb_build_object('applied',false,'dry_run',true,'operation_id',null,'status','ready'); end if;
  insert into public.pi_shopify_publication_jobs(product_id,user_id,authorization_id,actor_id,idempotency_key,payload_hash,fingerprint,shop_domain,access)
   values(p_product_id,owner_id,policy.authorization_id,p_access->>'actor_id',p_key,p_hash,p_payload->>'fingerprint',p_payload->>'shop_domain',p_access) returning * into job;
  insert into public.product_publications(product_id,user_id,shop_domain,status,started_at)
   values(p_product_id,owner_id,job.shop_domain,'publishing',clock_timestamp())
   on conflict(product_id) do update set status='publishing',error_message=null,started_at=clock_timestamp(),updated_at=clock_timestamp();
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'shopify_publication.queued',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('operation_id',job.id,'authorization_id',policy.authorization_id,'fingerprint',job.fingerprint));
  return jsonb_build_object('applied',true,'dry_run',false,'operation_id',job.id,'status','queued');
 end if;
 if not p_dry_run then
  update public.product_intelligence set revision=rev+1,updated_at=clock_timestamp() where product_id=p_product_id;
  rev:=rev+1;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
   values(p_product_id,owner_id,rev,public.pi_context_snapshot(p_product_id),public.pi_snapshot_hash(public.pi_context_snapshot(p_product_id)),p_access->>'actor_id');
 end if;
 result:=public.pi_shopify_automation_state(p_access,p_product_id);
 if p_dry_run then return result; end if;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,'shopify_automation.'||p_action,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev-1,rev,result);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=case when p_action in ('authorize','authorize_replay') then 'authorize_shopify_automation' else 'disable_shopify_automation' end and idempotency_key=p_key;
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
  values(p_product_id,owner_id,case when p_action in ('authorize','authorize_replay') then 'authorize_shopify_automation' else 'disable_shopify_automation' end,p_key,p_hash,array['product_intelligence:read','product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

-- El worker conserva y revalida la identidad real delegada. Nunca finge una sesión merchant.
create function public.pi_guard_shopify_publication(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.pi_shopify_publication_jobs;
begin
 select * into job from public.pi_shopify_publication_jobs where id=p_id and status='running' and lease_token=p_token and lease_until>clock_timestamp();
 if not found then return false; end if;
 return public.pi_shopify_automation_active(job.access,job.product_id) and job.authorization_id=(select authorization_id from public.pi_shopify_automations where product_id=job.product_id);
end $$;
create function public.pi_claim_shopify_publication(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.pi_shopify_publication_jobs;
begin
 select * into job from public.pi_shopify_publication_jobs where id=p_id for update;
 if not found or job.status not in ('queued','running') or (job.status='running' and job.lease_until>clock_timestamp()) then return null; end if;
 begin
  if not public.pi_shopify_automation_active(job.access,job.product_id) or job.authorization_id is distinct from (select authorization_id from public.pi_shopify_automations where product_id=job.product_id) then raise exception 'PI_FORBIDDEN'; end if;
 exception when others then
  update public.pi_shopify_publication_jobs set status='error',error_message='La autorización automática cambió o venció.',updated_at=clock_timestamp() where id=p_id;
  update public.product_publications set status='error',error_message='La autorización automática cambió o venció.',updated_at=clock_timestamp() where product_id=job.product_id;
  return null;
 end;
 update public.pi_shopify_publication_jobs set status='running',lease_token=p_token,lease_until=clock_timestamp()+interval '6 minutes',updated_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('product_id',job.product_id,'user_id',job.user_id,'fingerprint',job.fingerprint,'shop_domain',job.shop_domain);
end $$;
create function public.pi_finish_shopify_publication(p_id uuid,p_token uuid,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare job public.pi_shopify_publication_jobs;
begin
 select * into job from public.pi_shopify_publication_jobs where id=p_id and lease_token=p_token and status='running' for update;
 if not found then return; end if;
 update public.pi_shopify_publication_jobs set status=case when p_error is null then 'published' else 'error' end,error_message=p_error,updated_at=clock_timestamp() where id=p_id;
 if p_error is not null then update public.product_publications set status='error',error_message=p_error,updated_at=clock_timestamp() where product_id=job.product_id; end if;
end $$;

-- Limita la autorización automática visual a Shopify, también en la transacción final.
create function public.pi_shopify_visual_approval_allowed(p_access jsonb,p_product_id uuid,p_record jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare kind text:=p_record->>'kind'; visual_payload jsonb:=p_record->'payload'; subject public.pi_visual_records; strategy_id uuid;
begin
 if not public.pi_shopify_automation_active(p_access,p_product_id) then return false; end if;
 strategy_id:=(select active_strategy_id from public.product_intelligence where product_id=p_product_id);
 if kind='review' then
  select * into subject from public.pi_visual_records where id=(visual_payload->>'subject_id')::uuid and product_id=p_product_id;
  if not found then return false; end if;
  return public.pi_shopify_visual_approval_allowed(p_access,p_product_id,to_jsonb(subject));
 elsif kind='identity' then return true;
 elsif kind='binding' then
  if visual_payload->'target'->>'type' not in ('gallery_shot','landing_section') then return false; end if;
  select * into subject from public.pi_visual_records r where r.id=(visual_payload->>'asset_id')::uuid and r.product_id=p_product_id and r.kind='asset';
  if not found then return false; end if;
  return public.pi_shopify_visual_approval_allowed(p_access,p_product_id,to_jsonb(subject));
 elsif kind='asset' then
  select record->'payload' into visual_payload from public.pi_visual_versions where record_id=(visual_payload->'plan_ref'->>'id')::uuid and product_id=p_product_id
   and version=(visual_payload->'plan_ref'->>'version')::bigint;
  kind:='plan';
 end if;
 if kind='plan' then return coalesce(visual_payload->>'strategy_id'=strategy_id::text and not exists(select 1 from jsonb_array_elements(visual_payload->'shots') s where s->>'channel' is null or s->>'channel' not in ('pdp','gallery')),false); end if;
 return false;
end $$;

create or replace function public.pi_validate_visual_record(p_access jsonb,p_product_id uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare owner_id uuid:=(p_access->>'user_id')::uuid; visual_payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(visual_payload) is distinct from 'object' or octet_length(visual_payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_access->>'actor_kind'<>'merchant' and not public.pi_shopify_visual_approval_allowed(p_access,p_product_id,p_record) and ((p_record->>'status' in ('approved','selected','rejected','in_review') and kind<>'iteration') or kind='review' or (p_record->>'status'='archived' and (kind<>'binding' or exists(select 1 from public.pi_visual_records where id=(p_record->>'id')::uuid and status='selected')))) then raise exception 'PI_FORBIDDEN'; end if;
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
  if p_access->>'actor_kind'<>'merchant' and p_record->>'status'<>'generated' and not public.pi_shopify_visual_approval_allowed(p_access,p_product_id,p_record) then raise exception 'PI_FORBIDDEN'; end if;
  if not exists(select 1 from public.pi_visual_files where id=(visual_payload->>'file_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if visual_payload->>'representation'='real_evidence' and visual_payload->>'source_system'<>'manual' then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='binding' then
  -- Quitar un uso obsoleto es válido aunque su destino ya esté deshabilitado.
  if p_record->>'status'='archived' or (p_record->>'status'='proposed' and exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.status='selected')) then
   if not exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.user_id=owner_id and r.kind='binding'
    and r.payload->'target'=visual_payload->'target' and r.payload->>'asset_id'=visual_payload->>'asset_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
  else perform public.pi_visual_validate_target(p_product_id,owner_id,visual_payload->'target'); end if;
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

create or replace function public.pi_commit_visual(p_access jsonb,p_product_id uuid,p_tool text,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_dry_run boolean default false,p_operation jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
 if p_tool not in ('save_visual_identity','save_visual_generation_plan','prepare_visual_iteration','record_visual_iteration_result','prepare_visual_asset_upload','ingest_external_visual_asset','bind_visual_asset','unbind_visual_asset','save_visual_reconciliation','save_visual_binding_suggestions','review_visual_record') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_tool='review_visual_record' and p_access->>'actor_kind'<>'merchant' and not public.pi_shopify_automation_active(p_access,p_product_id) then raise exception 'PI_FORBIDDEN'; end if;
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
 for candidate in select value from jsonb_array_elements(changes) loop
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,
    case when candidate->>'kind'='binding' then case when candidate->>'status'='selected' then 'visual_asset.bound' else 'visual_asset.unbound' end
     when candidate->>'kind'='review' then 'visual_review.recorded'
     else 'visual_'||(candidate->>'kind')||'.'||case when (candidate->>'version')::int=1 then 'created' when candidate->>'status' in ('approved','rejected','archived') then candidate->>'status' else 'updated' end end,
    p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,
    jsonb_build_object('record_id',candidate->>'id','version',candidate->'version','status',candidate->>'status'));
 end loop;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw)));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $$;

create or replace function public.pi_commit_persuasion(p_access jsonb,p_product_id uuid,p_tool text,p_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_payload jsonb,p_issues jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; old_payload jsonb; old_etag text; old_rev bigint;
 new_id uuid; new_rev bigint; new_etag text; rev bigint; strategy_id uuid; angle_id uuid; plan public.pi_persuasion_plans; result jsonb;
 request_id uuid:=gen_random_uuid(); ref jsonb; section jsonb; row public.page_components; target jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null and pdp_persuasion_enabled for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_tool not in ('save_angle_persuasion_plan','save_landing_experience') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 state:=public.pi_pdp_state(p_product_id,owner_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(state) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
   or p_payload->>'schema_version' is distinct from '1.0' or octet_length(p_payload::text)>60000 or jsonb_typeof(p_issues) is distinct from 'array' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_id is not null then
  if p_tool='save_angle_persuasion_plan' then select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_persuasion_plans where id=p_id and product_id=p_product_id and user_id=owner_id;
  else select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_landing_experiences where id=p_id and product_id=p_product_id and user_id=owner_id; end if;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
 end if;
 if p_etag is distinct from coalesce(old_etag,state->>'empty_etag') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_id is null and ((p_tool='save_angle_persuasion_plan' and jsonb_array_length(state->'plans')>=20)
  or (p_tool='save_landing_experience' and jsonb_array_length(state->'experiences')>=20)) then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 strategy_id:=(p_payload->>'strategy_id')::uuid; angle_id:=(p_payload->>'angle_id')::uuid;
 if old_payload is not null and (old_payload->>'strategy_id',old_payload->>'angle_id',old_payload->>'landing_angle_id') is distinct from
   (p_payload->>'strategy_id',p_payload->>'angle_id',p_payload->>'landing_angle_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if not exists(select 1 from public.pi_strategy_versions v where v.id=strategy_id and v.product_id=p_product_id and v.user_id=owner_id
   and exists(select 1 from jsonb_array_elements(v.snapshot->'angles') a where a->>'id'=angle_id::text))
   or not exists(select 1 from public.pi_angles a where a.id=angle_id and a.product_id=p_product_id and a.user_id=owner_id and a.lifecycle='active') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_payload->>'status' in ('review','approved','active') and exists(select 1 from jsonb_array_elements(p_issues) i where i->>'severity'='error') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_payload->>'status' in ('approved','active') and p_access->>'actor_kind'<>'merchant' and not (public.pi_shopify_automation_active(p_access,p_product_id) and strategy_id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)) then raise exception 'PI_FORBIDDEN'; end if;
 if jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 9
  or (select count(distinct s->>'section_key') from jsonb_array_elements(p_payload->'sections') s)<>jsonb_array_length(p_payload->'sections') then raise exception 'PI_VALIDATION_ERROR'; end if;
 for ref in select jsonb_path_query(p_payload,'$.**.fact_ids[*]') loop
  if not exists(select 1 from public.pi_facts where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.**.evidence_ids[*]') loop
  if not exists(select 1 from public.pi_fact_evidence where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.sections[*].source_asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].images[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'assets') a where a->>'source'=ref->>'source' and a->>'id'=ref->>'id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.claims[*].review_ids[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'landing'->'reviews') r where r->>'id'=ref#>>'{}') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 if p_tool='save_angle_persuasion_plan' then
  if exists(select 1 from public.pi_landing_experiences where persuasion_plan_id=p_id and status='active') then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='primary')>least(7,(p_payload->'attention_budget'->>'max_primary_sections')::int)
    or (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='support')>least(2,(p_payload->'attention_budget'->>'max_support_sections')::int)
    or jsonb_array_length(p_payload->'beliefs') not between 4 and 7 or p_payload->>'status' not in ('draft','review','approved','archived') then raise exception 'PI_VALIDATION_ERROR'; end if;
 else
  select * into plan from public.pi_persuasion_plans where id=(p_payload->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or (plan.strategy_id,plan.angle_id,plan.landing_angle_id,plan.revision) is distinct from
    (strategy_id,angle_id,p_payload->>'landing_angle_id',(p_payload->>'plan_revision')::bigint) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_payload->>'status'='active' and plan.payload->>'status'<>'approved' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_payload->>'status'='active' and exists(select 1 from public.pi_landing_experiences e where e.product_id=p_product_id and e.id is distinct from p_id and e.status='active'
    and ((e.landing_angle_id=p_payload->>'landing_angle_id' and coalesce(e.landing_hook_id,'')=coalesce(p_payload->>'landing_hook_id','')) or (e.is_default and (p_payload->>'is_default')::boolean))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  for section in select value from jsonb_array_elements(p_payload->'sections') where value->>'enabled'='true' loop
   if not exists(select 1 from jsonb_array_elements(plan.payload->'sections') s where s->>'section_key'=section->>'section_key' and s->>'primary_job'=section->>'persuasion_job') then raise exception 'PI_INVALID_REFERENCE'; end if;
   select * into row from public.page_components where product_id=p_product_id and user_id=owner_id and component=section->>'component' and superseded_at is null;
   target:=coalesce(row.content,row.proposal);
   if jsonb_typeof(target)='array' then select value into target from jsonb_array_elements(target) v where v->>'key'=section->>'content_variant_key';
   elsif section->>'content_variant_key'<>'default' then target:=null; end if;
   if p_payload->>'status'='active' and (target is null or not row.enabled or row.status not in ('approved','published')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
 end if;
 new_id:=coalesce(p_id,gen_random_uuid()); new_rev:=coalesce(old_rev,0)+1;
 new_etag:=public.pi_snapshot_hash(jsonb_build_array(new_id,new_rev,p_payload));
 if p_dry_run then return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',false,'dry_run',true,'id',p_id,'revision',coalesce(old_rev,0),'etag',coalesce(old_etag,state->>'empty_etag'),'issues',p_issues)); end if;
 if p_tool='save_angle_persuasion_plan' then
  if p_id is null and (select count(*) from public.pi_persuasion_plans where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  insert into public.pi_persuasion_plans(id,product_id,user_id,strategy_id,angle_id,landing_angle_id,revision,etag,payload)
   values(new_id,p_product_id,owner_id,strategy_id,angle_id,p_payload->>'landing_angle_id',new_rev,new_etag,p_payload)
   on conflict(id) do update set revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
 else
  if p_id is null and (select count(*) from public.pi_landing_experiences where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  insert into public.pi_landing_experiences(id,product_id,user_id,persuasion_plan_id,strategy_id,angle_id,landing_angle_id,landing_hook_id,experience_key,status,is_default,revision,etag,payload)
   values(new_id,p_product_id,owner_id,plan.id,strategy_id,angle_id,p_payload->>'landing_angle_id',p_payload->>'landing_hook_id',p_payload->>'experience_key',p_payload->>'status',(p_payload->>'is_default')::boolean,new_rev,new_etag,p_payload)
   on conflict(id) do update set persuasion_plan_id=excluded.persuasion_plan_id,landing_hook_id=excluded.landing_hook_id,experience_key=excluded.experience_key,status=excluded.status,
    is_default=excluded.is_default,revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
 end if;
 insert into public.pi_pdp_revisions(product_id,user_id,plan_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
  values(p_product_id,owner_id,case when p_tool='save_angle_persuasion_plan' then new_id end,case when p_tool='save_landing_experience' then new_id end,new_rev,new_etag,p_payload,p_issues,p_access->>'actor_id',p_access->>'actor_kind');
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
  'applied',true,'dry_run',false,'id',new_id,'revision',new_rev,'etag',new_etag,'issues',p_issues));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('id',new_id,'artifact_revision',new_rev,'status',p_payload->>'status'));
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
  values(p_product_id,owner_id,p_tool,p_key,p_hash,array['product_intelligence:read','product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_commit_landing_legacy(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 automatic boolean; run_id uuid; request_id uuid:=gen_random_uuid(); part jsonb; existing public.page_components; component_id uuid; items jsonb:='[]'::jsonb;
 ids text[]:=array['listing','review-stars','benefit-usps','inventory','shipping-timeline','benefit-double-box','gif-strip','review-slider',
 'ugc-slider','pain-block','stats-with-image','scrolling-benefits','image-with-benefits','insta-story','review-wall','comparison-table','faq-and-text'];
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=public.pi_shopify_automation_active(p_access,p_product_id);
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 -- Bloquear reseñas y contenido durante la validación final. Mutaciones de página se serializan con el producto.
 perform 1 from public.product_reviews where product_id=p_product_id and user_id=owner_id for share;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from public.pi_snapshot_hash(state->'rows') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if jsonb_array_length(state->'active_runs')>0 then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 17
   or octet_length(p_entries::text)>262144 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not (e->>'component'=any(ids)) or jsonb_typeof(e->'content') not in ('object','array'))
   or (select count(distinct e->>'component') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   run_id:=gen_random_uuid();
   insert into public.copy_runs(id,product_id,user_id,status,input,payload,started_at,finished_at)
     values(run_id,p_product_id,owner_id,'succeeded',jsonb_build_object('source','mcp_chat','contract_version','1.1','analysis_revision',rev,
       'actor_id',p_access->>'actor_id','snapshot',snap),jsonb_build_object('entries',p_entries),now(),now());
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
   perform public.pi_validate_landing_variants(part->'content',p_product_id,owner_id);
   if part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   if not p_dry_run then
     select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,enabled,images,status,decided_at)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',automatic or part->>'component'='listing',coalesce(existing.images,'[]'::jsonb),case when automatic then 'approved'::public.content_status else 'generated'::public.content_status end,case when automatic then clock_timestamp() else null end);
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status',case when automatic then 'approved' else 'generated' end));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action',case when automatic then 'Contenido aprobado automáticamente. Completa imágenes y experiencias; publica con publish_product.' else 'Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_commit_pack_labels(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_action text,p_labels jsonb,p_fact_ids jsonb default '[]'::jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 row public.pack_labels; new_id uuid; request_id uuid:=gen_random_uuid(); pack_prices jsonb; target_status public.content_status;
 automatic boolean; changed boolean; facts uuid[]; entry jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_action is distinct from 'propose' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=public.pi_shopify_automation_active(p_access,p_product_id);
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_pack_labels'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_pack_labels_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from state->>'etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if snap->'pricing'='null'::jsonb or snap->'pricing'->>'currency' is distinct from snap->'catalog'->>'currency' or p_action is null or p_action not in ('propose','approve','reopen','edit','edit_approve')
   or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_labels) is distinct from 'array' or jsonb_array_length(p_labels) not between 1 and 3 or octet_length(p_labels::text)>16384
   or jsonb_typeof(p_fact_ids) is distinct from 'array' or jsonb_array_length(p_fact_ids)>20 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if (select count(distinct e->>'units') from jsonb_array_elements(p_labels) e)<>jsonb_array_length(p_labels)
   or jsonb_array_length(p_labels)<>jsonb_array_length(snap->'pricing'->'packs')
   or exists(select 1 from jsonb_array_elements(p_labels) e where not exists(select 1 from jsonb_array_elements(snap->'pricing'->'packs') k where k->'units'=e->'units')
     or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 80
     or length(coalesce(e->>'support',''))>100 or length(coalesce(e->>'badge',''))>30 or length(trim(e->>'reason')) not between 1 and 1000
     or jsonb_typeof(e->'reason') is distinct from 'string' or e->>'basis' is null or e->>'basis' not in ('duration','sharing','spare','gift','savings','other'))
   or (select count(*) from jsonb_array_elements(p_labels) e where e->>'badge' is not null)>1 then raise exception 'PI_VALIDATION_ERROR'; end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into facts from jsonb_array_elements_text(p_fact_ids);
 if p_action<>'reopen' and exists(select 1 from unnest(facts) id where not exists(select 1 from public.pi_facts f where f.id=id and f.product_id=p_product_id and f.user_id=owner_id
   and f.verification_status='verified' and f.usage_status='approved')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=id and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('units',k->'units','price',k->'price') order by (k->>'units')::int),'[]'::jsonb) into pack_prices from jsonb_array_elements(snap->'pricing'->'packs') k;
 select * into row from public.pack_labels where id=(state->'current'->>'id')::uuid;
 if p_action<>'propose' and row.id is null then raise exception 'PI_NOT_FOUND'; end if;
 target_status:=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then 'approved'::public.content_status when p_action='propose' then 'generated'::public.content_status else 'in_review'::public.content_status end;
 if p_action in ('approve','reopen') and p_labels is distinct from row.payload then raise exception 'PI_VALIDATION_ERROR'; end if;
 changed:=case when p_action='propose' then (automatic and row.status is distinct from target_status) or row.source is distinct from 'mcp_chat' or public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id) or row.payload is distinct from p_labels or row.prices is distinct from pack_prices or coalesce(row.provenance->'duration_fact_ids','[]'::jsonb) is distinct from p_fact_ids or row.provenance->>'currency' is distinct from snap->'pricing'->>'currency'
   else (p_action<>'reopen' and row.source='mcp_chat' and row.provenance->>'currency' is distinct from snap->'pricing'->>'currency') or (p_action<>'reopen' and public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id)) or row.status is distinct from target_status or row.payload is distinct from p_labels or (p_action<>'reopen' and row.prices is distinct from pack_prices) end;
 if not changed then target_status:=row.status; end if;
 new_id:=row.id;
 if changed and not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   perform set_config('pi.pack_labels_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   if p_action='propose' then
     update public.pack_labels set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     new_id:=gen_random_uuid();
     insert into public.pack_labels(id,product_id,user_id,payload,prices,status,prompt_version,model,source,provenance,decided_at)
       values(new_id,p_product_id,owner_id,p_labels,pack_prices,target_status,0,'chat','mcp_chat',jsonb_build_object('contract_version','1.0',
         'duration_fact_ids',p_fact_ids,'currency',snap->'pricing'->>'currency','analysis_revision',rev,'actor_id',p_access->>'actor_id','snapshot',snap,'reviewed_fact_revisions',case when automatic then coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb) else '{}'::jsonb end),case when automatic then clock_timestamp() else null end);
   else
     update public.pack_labels set payload=p_labels,prices=case when p_action='reopen' then row.prices else pack_prices end,status=target_status,
       provenance=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then row.provenance||jsonb_build_object('currency',snap->'pricing'->>'currency','reviewed_fact_revisions',
         coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb)) else row.provenance end,
       decided_at=case when target_status='approved' then now() else null end,
       edited_at=case when p_action in ('edit','edit_approve') then now() else row.edited_at end,updated_at=now()
       where id=row.id and product_id=p_product_id and user_id=owner_id and superseded_at is null;
   end if;
   after_snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
     values(p_product_id,owner_id,rev+1,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
     values(p_product_id,owner_id,request_id,'pack_labels_'||p_action,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_array(jsonb_build_object('proposal_id',new_id,'status',target_status)));
   rev:=rev+1; state:=public.pi_pack_labels_state(p_product_id,owner_id);
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',changed and not p_dry_run,'dry_run',p_dry_run,'proposal_id',case when p_dry_run then null else new_id end,
   'status',target_status,'pack_labels_etag',state->>'etag','next_action',case when automatic then 'Etiquetas aprobadas automáticamente. Continúa hasta publicar en Shopify con publish_product.' else 'Revisa y acepta las etiquetas en Información base. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_pack_labels' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_pack_labels',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

-- Todos los helpers son internos; solo service_role puede ejecutar RPCs del flujo.
do $$ declare item record; begin
 for item in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('pi_shopify_dependency_hash','pi_shopify_automation_active','pi_shopify_automation_state',
 'pi_shopify_automation','pi_guard_shopify_publication','pi_claim_shopify_publication','pi_finish_shopify_publication','pi_shopify_visual_approval_allowed',
 'pi_validate_visual_record','pi_commit_visual','pi_commit_persuasion','pi_commit_landing_legacy','pi_commit_pack_labels') loop
 execute format('revoke all on function %s from public, anon, authenticated',item.signature);
 execute format('grant execute on function %s to service_role',item.signature);
 end loop;
end $$;
