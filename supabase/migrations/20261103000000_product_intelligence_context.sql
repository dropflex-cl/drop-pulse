-- Primera vertical persistente: contexto explícito y calculadora existente, sin backfill de IA.
alter table public.products add constraint products_id_user_unique unique (id,user_id);
alter table public.products add column pi_deleting_at timestamptz;

create table public.product_intelligence (
  product_id uuid primary key,
  user_id uuid not null,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  schema_version text not null default '1.0' check (schema_version = '1.0'),
  updated_at timestamptz not null default now(),
  unique (product_id,user_id),
  foreign key (product_id,user_id) references public.products(id,user_id) on delete cascade
);
create table public.pi_product_inputs (
  product_id uuid primary key,
  user_id uuid not null,
  display_name text not null check (length(display_name) between 1 and 256),
  category text check (length(category) between 1 and 160),
  description text not null check (length(description) between 1 and 8192),
  supplier_text text check (length(supplier_text) between 1 and 8192),
  last_revision bigint not null check (last_revision between 1 and 9007199254740991),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);
create table public.pi_revisions (
  product_id uuid not null,
  user_id uuid not null,
  revision bigint not null check (revision between 0 and 9007199254740991),
  schema_version text not null default '1.0' check (schema_version = '1.0'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (product_id,revision),
  foreign key (product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);
create table public.pi_idempotency_records (
  product_id uuid not null,
  user_id uuid not null,
  tool text not null check (tool = 'save_product_context'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  required_scopes text[] not null,
  result jsonb not null,
  resulting_revision bigint not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (user_id,product_id,tool,idempotency_key),
  foreign key (product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);
create index pi_receipts_expiry on public.pi_idempotency_records(expires_at);
create table public.pi_audit_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  actor_id text not null,
  client_id uuid,
  base_revision bigint not null,
  resulting_revision bigint not null,
  diff jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

do $$ declare t text; begin
  foreach t in array array['product_intelligence','pi_product_inputs','pi_revisions','pi_idempotency_records','pi_audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select on public.product_intelligence,public.pi_product_inputs to authenticated;
create policy "owner reads intelligence head" on public.product_intelligence for select to authenticated using (user_id = (select auth.uid()));
create policy "owner reads explicit inputs" on public.pi_product_inputs for select to authenticated using (user_id = (select auth.uid()));

-- Identidad y scopes son construidos por el servidor. El grant y su sesión se bloquean hasta commit.
create function public.pi_authorize_context(p_access jsonb,p_scope text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (p_access->>'user_id')::uuid; g jsonb;
begin
  if not exists(select 1 from auth.users where id = owner_id and deleted_at is null
    and coalesce(banned_until <= now(),true) and not coalesce(is_anonymous,false)) then
    raise exception 'PI_FORBIDDEN';
  end if;
  if not coalesce(p_access->'scopes' ? p_scope,false) then raise exception 'PI_FORBIDDEN'; end if;
  if p_access->>'actor_kind' = 'delegated' then
    if p_access->>'actor_id' is distinct from p_access->>'client_id' then raise exception 'PI_FORBIDDEN'; end if;
    perform 1 from public.pi_access_grants where user_id = owner_id and client_id = (p_access->>'client_id')::uuid for share;
    perform 1 from auth.sessions where id = (p_access->>'session_id')::uuid for share;
    perform 1 from auth.oauth_consents where user_id = owner_id and client_id = (p_access->>'client_id')::uuid for share;
    g := public.pi_check_oauth_grant(owner_id,(p_access->>'client_id')::uuid,(p_access->>'session_id')::uuid,
      (p_access->>'token_session_id')::uuid,(p_access->>'grant_version')::integer,p_access->>'resource_url');
    if g is null or not (g->'scopes' ? p_scope)
      or not coalesce((p_access->>'token_expires_at')::numeric > extract(epoch from clock_timestamp()),false)
      or (g->>'expires_at')::timestamptz <= clock_timestamp() then raise exception 'PI_FORBIDDEN'; end if;
  elsif p_access->>'actor_kind' = 'merchant' then
    if p_access->>'actor_id' is distinct from owner_id::text then raise exception 'PI_FORBIDDEN'; end if;
  else raise exception 'PI_FORBIDDEN'; end if;
  return owner_id;
end $$;

-- Snapshot operacional acotado. No incluye fichas, avatares, rankings ni URLs firmadas.
create function public.pi_context_snapshot(p_product_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'catalog',jsonb_build_object('id',p.id,'title',p.title,'shopify_product_id',p.shopify_product_id,'currency',p.currency,'is_upsell',p.is_upsell),
   'context',(select jsonb_build_object('display_name',i.display_name,'category',i.category,'description',i.description,
     'supplier_text',i.supplier_text,'last_revision',i.last_revision,'base_reference_image_id',
     (select r.id from public.product_reference_images r where r.product_id = p.id and r.user_id = p.user_id and not r.excluded
       order by r.is_base desc,r.is_cover desc,r.position,r.id limit 1)) from public.pi_product_inputs i where i.product_id = p.id),
   'pricing',(select to_jsonb(r)-'created_at'-'updated_at'-'user_id'-'product_id' from public.product_pricing r where r.product_id = p.id and r.user_id = p.user_id),
   'settings',(select to_jsonb(s)-'user_id'-'updated_at'-'ai_cost_cap' from public.merchant_settings s where s.user_id = p.user_id),
   'numbers',(select o.numbers from public.onboarding o where o.user_id = p.user_id),
   'pack_labels',(select jsonb_build_object('status',l.status,'payload',l.payload,'prices',l.prices) from public.pack_labels l
     where l.product_id = p.id and l.user_id = p.user_id and l.status <> 'rejected' order by l.created_at desc,l.id desc limit 1),
   'images',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'is_base',r.is_base,'is_cover',r.is_cover,'excluded',r.excluded,'position',r.position) order by r.position,r.id)
     from public.product_reference_images r where r.product_id = p.id and r.user_id = p.user_id),'[]'::jsonb)
 ) from public.products p where p.id = p_product_id;
$$;
create function public.pi_snapshot_hash(p_snapshot jsonb) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex'); $$;

create function public.pi_load_context(p_access jsonb,p_product_id uuid,p_revision bigint default null,
  p_key text default null,p_hash text default null,p_dry_run boolean default false,p_performance boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; current_rev bigint; snap jsonb; current_snap jsonb; receipt public.pi_idempotency_records;
begin
  owner_id := public.pi_authorize_context(p_access,case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end);
  if p_performance then perform public.pi_authorize_context(p_access,'performance:read'); end if;
  perform 1 from public.products where id = p_product_id and user_id = owner_id and pi_deleting_at is null for share;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  select revision into current_rev from public.product_intelligence where product_id = p_product_id;
  current_rev := coalesce(current_rev,0);
  current_snap := public.pi_context_snapshot(p_product_id);
  if p_key is not null and not p_dry_run then
    select * into receipt from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
      and tool = 'save_product_context' and idempotency_key = p_key and expires_at > now();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      if not (p_access->'scopes' ?& receipt.required_scopes) then raise exception 'PI_FORBIDDEN'; end if;
      return jsonb_build_object('replay',receipt.result);
    end if;
  end if;
  if p_revision is null or p_revision = current_rev then snap := current_snap;
  else select snapshot into snap from public.pi_revisions where product_id = p_product_id and revision = p_revision;
    if not found then raise exception 'PI_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('revision',coalesce(p_revision,current_rev),'current_revision',current_rev,
    'snapshot',snap,'stamp',public.pi_snapshot_hash(current_snap));
end $$;

-- Admite únicamente contexto validado y el plan recalculado en servidor. Nunca red/IA bajo lock.
create function public.pi_commit_context(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_stamp text,
  p_key text,p_hash text,p_context jsonb,p_pricing jsonb,p_base_image jsonb,p_result jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; head_rev bigint; before_snap jsonb; after_snap jsonb; receipt public.pi_idempotency_records;
  proposed_rev bigint; changed boolean; plan public.product_pricing; image_id uuid;
begin
  owner_id := public.pi_authorize_context(p_access,'product_intelligence:write');
  perform 1 from public.products where id = p_product_id and user_id = owner_id and pi_deleting_at is null for update;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  select revision into head_rev from public.product_intelligence where product_id = p_product_id;
  head_rev := coalesce(head_rev,0);
  if not p_dry_run then
    select * into receipt from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
      and tool = 'save_product_context' and idempotency_key = p_key and expires_at > now();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      return receipt.result;
    end if;
  end if;
  if p_expected_revision is distinct from head_rev then raise exception 'PI_REVISION_CONFLICT'; end if;
  before_snap := public.pi_context_snapshot(p_product_id);
  if p_stamp is distinct from public.pi_snapshot_hash(before_snap) then raise exception 'PI_REVISION_CONFLICT'; end if;
  if p_context is not null and (jsonb_typeof(p_context) <> 'object' or
    p_context - array['display_name','category','description','supplier_text','base_reference_image_id','last_revision'] <> '{}'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_base_image is not null and (jsonb_typeof(p_base_image) <> 'object' or not (p_base_image ? 'id') or p_base_image - 'id' <> '{}'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_base_image is not null and p_base_image->'id' <> 'null'::jsonb then
    image_id := (p_base_image->>'id')::uuid;
    perform 1 from public.product_reference_images where id = image_id and product_id = p_product_id and user_id = owner_id for update;
    if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  end if;
  if p_result->>'ok' is distinct from 'true' or p_result->>'product_id' is distinct from p_product_id::text
    or (p_result->'data'->>'base_revision')::bigint is distinct from head_rev
    or (p_result->'data'->>'dry_run')::boolean is distinct from p_dry_run
    or length(p_result::text) > 60000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  proposed_rev := (p_result->>'revision')::bigint;
  changed := not (p_result->'data'->>'no_op')::boolean;
  if proposed_rev is distinct from (head_rev + case when changed and not p_dry_run then 1 else 0 end)
    or (p_result->'data'->>'applied')::boolean is distinct from (changed and not p_dry_run) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_dry_run then return p_result; end if;

  insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict(product_id) do nothing;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(p_product_id,owner_id,head_rev,before_snap,public.pi_snapshot_hash(before_snap),p_access->>'actor_id') on conflict do nothing;
  -- Los triggers de writers UI capturan una revisión al commit; esta RPC la captura explícitamente.
  perform set_config('pi.explicit_context_commit','true',true);
  if changed then
    if p_context is not null then
      insert into public.pi_product_inputs(product_id,user_id,display_name,category,description,supplier_text,last_revision,created_by,updated_by)
      values(p_product_id,owner_id,p_context->>'display_name',p_context->>'category',p_context->>'description',p_context->>'supplier_text',
        proposed_rev,p_access->>'actor_id',p_access->>'actor_id')
      on conflict(product_id) do update set display_name = excluded.display_name,category = excluded.category,
        description = excluded.description,supplier_text = excluded.supplier_text,last_revision = excluded.last_revision,
        updated_by = excluded.updated_by,updated_at = now();
    end if;
    if p_pricing is not null then
      if p_pricing->>'currency' is distinct from before_snap->'catalog'->>'currency' then raise exception 'PI_VALIDATION_ERROR'; end if;
      plan := jsonb_populate_record(null::public.product_pricing,p_pricing);
      insert into public.product_pricing(product_id,user_id,currency,unit_cost,avg_shipping_cost,purchase_cost_limit,confirmation_rate,
        delivery_rate,sale_price,compare_at_price,extra_unit_discount,minimum_price,recommended_price,profit,max_cpa,beroas,packs)
      values(p_product_id,owner_id,plan.currency,plan.unit_cost,plan.avg_shipping_cost,plan.purchase_cost_limit,plan.confirmation_rate,
        plan.delivery_rate,plan.sale_price,plan.compare_at_price,plan.extra_unit_discount,plan.minimum_price,plan.recommended_price,plan.profit,plan.max_cpa,plan.beroas,plan.packs)
      on conflict(product_id) do update set currency = excluded.currency,unit_cost = excluded.unit_cost,
        avg_shipping_cost = excluded.avg_shipping_cost,purchase_cost_limit = excluded.purchase_cost_limit,
        confirmation_rate = excluded.confirmation_rate,delivery_rate = excluded.delivery_rate,sale_price = excluded.sale_price,
        compare_at_price = excluded.compare_at_price,extra_unit_discount = excluded.extra_unit_discount,
        minimum_price = excluded.minimum_price,recommended_price = excluded.recommended_price,profit = excluded.profit,
        max_cpa = excluded.max_cpa,beroas = excluded.beroas,packs = excluded.packs,updated_at = now();
    end if;
    if p_base_image is not null then
      if p_base_image->'id' = 'null'::jsonb then
        update public.product_reference_images set is_base = false where product_id = p_product_id and user_id = owner_id and is_base;
      else perform public.set_base_reference_image(owner_id,p_product_id,image_id); end if;
    end if;
    after_snap := public.pi_context_snapshot(p_product_id);
    if after_snap = before_snap then raise exception 'PI_VALIDATION_ERROR'; end if;
    update public.product_intelligence set revision = proposed_rev,updated_at = now() where product_id = p_product_id;
    insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
      values(p_product_id,owner_id,proposed_rev,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
    insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
      values(p_product_id,owner_id,(p_result->>'request_id')::uuid,'save_product_context',p_access->>'actor_id',
        (p_access->>'client_id')::uuid,head_rev,proposed_rev,p_result->'data'->'diff');
  end if;
  delete from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
    and (expires_at <= now() or (tool = 'save_product_context' and idempotency_key = p_key));
  insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
    values(p_product_id,owner_id,'save_product_context',p_key,p_hash,array['product_intelligence:write'],p_result,proposed_rev,(p_result->>'request_id')::uuid);
  return p_result;
end $$;

-- Todos los writers operacionales serializan con el producto, incluso los conservados en UI.
create function public.pi_lock_context_product() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  if tg_table_name = 'products' then target_id := coalesce(new.id,old.id); else target_id := coalesce(new.product_id,old.product_id); end if;
  perform 1 from public.products where id = target_id for update;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create function public.pi_capture_operational_context() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid; owner_id uuid; rev bigint; snap jsonb; previous jsonb;
begin
  if current_setting('pi.explicit_context_commit',true) = 'true' then return null; end if;
  if tg_table_name = 'products' then target_id := coalesce(new.id,old.id); else target_id := coalesce(new.product_id,old.product_id); end if;
  select user_id,revision into owner_id,rev from public.product_intelligence where product_id = target_id;
  if not found then return null; end if;
  snap := public.pi_context_snapshot(target_id);
  if snap is null then return null; end if;
  select snapshot into previous from public.pi_revisions where product_id = target_id and revision = rev;
  if snap = previous then return null; end if;
  if snap->'context' <> 'null'::jsonb and snap->'context' is distinct from previous->'context' then
    update public.pi_product_inputs set last_revision = rev+1,updated_by = owner_id::text,updated_at = now() where product_id = target_id;
    snap := public.pi_context_snapshot(target_id);
  end if;
  update public.product_intelligence set revision = rev+1,updated_at = now() where product_id = target_id;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(target_id,owner_id,rev+1,snap,public.pi_snapshot_hash(snap),owner_id::text);
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
    values(target_id,owner_id,gen_random_uuid(),'operational_context_changed',owner_id::text,rev,rev+1,'[]');
  return null;
end $$;

-- Snapshots/audit son append-only; la cascada obligatoria del producto sí puede borrarlos.
create function public.pi_immutable_context_history() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if exists(select 1 from public.products where id = old.product_id) then raise exception 'PI_VALIDATION_ERROR'; end if;
  return old;
end $$;
create trigger pi_immutable_revision before update or delete on public.pi_revisions for each row execute function public.pi_immutable_context_history();
create trigger pi_immutable_audit before update or delete on public.pi_audit_events for each row execute function public.pi_immutable_context_history();
do $$ declare t text; begin
  foreach t in array array['product_pricing','product_reference_images','pack_labels'] loop
    execute format('create trigger pi_lock_context before insert or update or delete on public.%I for each row execute function public.pi_lock_context_product()',t);
    execute format('create constraint trigger pi_capture_context after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.pi_capture_operational_context()',t);
  end loop;
end $$;
create constraint trigger pi_capture_catalog after update on public.products deferrable initially deferred for each row execute function public.pi_capture_operational_context();

-- Settings/números afectan a todos los contextos del dueño: orden estable y captura final.
create function public.pi_lock_owner_contexts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.products where user_id = coalesce(new.user_id,old.user_id) order by id for update;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create function public.pi_capture_owner_contexts() returns trigger language plpgsql security definer set search_path = '' as $$
declare row record; snap jsonb; previous jsonb;
begin
  for row in select * from public.product_intelligence where user_id = coalesce(new.user_id,old.user_id) order by product_id loop
    snap := public.pi_context_snapshot(row.product_id);
    select snapshot into previous from public.pi_revisions where product_id = row.product_id and revision = row.revision;
    if snap is not null and snap is distinct from previous then
      update public.product_intelligence set revision = row.revision+1,updated_at = now() where product_id = row.product_id;
      insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
        values(row.product_id,row.user_id,row.revision+1,snap,public.pi_snapshot_hash(snap),row.user_id::text);
      insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
        values(row.product_id,row.user_id,gen_random_uuid(),'owner_context_changed',row.user_id::text,row.revision,row.revision+1,'[]');
    end if;
  end loop;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['merchant_settings','onboarding'] loop
    execute format('create trigger pi_lock_owner_contexts before insert or update or delete on public.%I for each row execute function public.pi_lock_owner_contexts()',t);
    execute format('create constraint trigger pi_capture_owner_contexts after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.pi_capture_owner_contexts()',t);
  end loop;
end $$;

create function public.pi_begin_product_deletion(p_user_id uuid,p_product_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$ begin
  update public.products set pi_deleting_at = coalesce(pi_deleting_at,now()) where id = p_product_id and user_id = p_user_id;
  return found;
end $$;

-- Ningún RPC ni helper es invocable por tokens de navegador/MCP ni por PUBLIC.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('pi_authorize_context','pi_context_snapshot','pi_snapshot_hash','pi_load_context','pi_commit_context',
      'pi_lock_context_product','pi_capture_operational_context','pi_lock_owner_contexts','pi_capture_owner_contexts','pi_begin_product_deletion','pi_immutable_context_history') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
grant execute on function public.pi_load_context(jsonb,uuid,bigint,text,text,boolean,boolean) to service_role;
grant execute on function public.pi_commit_context(jsonb,uuid,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;
grant execute on function public.pi_begin_product_deletion(uuid,uuid) to service_role;
