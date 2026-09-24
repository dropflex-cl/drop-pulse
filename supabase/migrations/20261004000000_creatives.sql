-- Etapa Creativos (docs/spec-creativos.md): anuncios de imagen terminados, generados con Higgsfield
-- desde los 2 desarrollos de ángulo aprobados. Claude (generador de estáticos) propone los conceptos;
-- Marketing Studio 2.5 Flare hornea la pieza completa (producto, titular, callouts) a partir de la foto
-- base; un QA con Claude revisa el texto y el producto. La IA propone, el comerciante decide.

-- ---------------------------------------------------------------- Clave de Higgsfield (spec §6.3)
-- Cada comerciante usa SU clave (KEY_ID:KEY_SECRET), guardada en Vault como 'higgsfield_token_<user>'.
create or replace function public.set_integration_token(p_kind text, p_user_id uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_id   uuid;
begin
  if p_kind not in ('shopify', 'shopify_refresh', 'meta', 'higgsfield') then raise exception 'kind inválido: %', p_kind; end if;
  v_name := p_kind || '_token_' || p_user_id::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_token, v_name, 'DropFlex: token de ' || p_kind);
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $$;

create or replace function public.delete_user_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where name in (
    'shopify_token_' || old.id::text, 'shopify_refresh_token_' || old.id::text, 'meta_token_' || old.id::text,
    'higgsfield_token_' || old.id::text
  );
  return old;
end $$;

-- Lo visible de la conexión (la clave nunca sale de Vault).
create table public.higgsfield_connections (
  user_id     uuid primary key references auth.users on delete cascade,
  key_hint    text not null,                     -- los últimos 4 caracteres, para reconocerla
  status      text not null default 'connected' check (status in ('connected', 'invalid')),
  last_error  text,                              -- en español, para la pantalla
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Conceptos
-- Una corrida del generador de estáticos. `input` guarda qué se usó (desarrollos, precio, mercado).
create table public.creative_runs (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  status         public.pipeline_run_status not null default 'queued',
  error_code     text,
  error_message  text,
  input          jsonb not null default '{}',
  payload        jsonb,
  prompt_version smallint,
  model          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index creative_runs_product on public.creative_runs (product_id, created_at desc);
create unique index creative_runs_one_active on public.creative_runs (product_id) where status in ('queued', 'running');

-- Un concepto de estático: familia, preset y los textos que se hornean. Se pueden editar antes de generar.
create table public.creative_concepts (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  run_id        uuid not null references public.creative_runs on delete cascade,
  position      smallint not null,
  angle_role    text not null check (angle_role in ('primary', 'secondary')),
  family        text not null,                   -- lib/creatives/catalog.ts › FAMILIES
  payload       jsonb not null,                  -- lib/creatives/schemas.ts › Concept
  edited_at     timestamptz,
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index creative_concepts_active on public.creative_concepts (product_id, position) where superseded_at is null;

-- Una pieza renderizada. `render_status` sigue la generación en Higgsfield; `status` es la decisión
-- del comerciante (StatusBadge). Al aprobarla se copia a ad-media y aparece en Anuncios.
create table public.creative_assets (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  concept_id     uuid not null references public.creative_concepts on delete cascade,
  ratio          text not null check (ratio in ('1:1', '9:16')),
  attempt        smallint not null default 1,
  endpoint       text not null,
  preset_id      uuid,
  input          jsonb not null,                 -- lo que se envió (sin URLs firmadas)
  baked_texts    jsonb not null default '[]',    -- los textos pedidos, para el QA
  render_status  text not null default 'queued' check (render_status in ('queued', 'running', 'succeeded', 'failed')),
  hf_request_id  text unique,
  error_code     text,
  error_message  text,
  qa             jsonb,                          -- lib/creatives/schemas.ts › QaResult
  storage_path   text,
  width          integer,
  height         integer,
  size_bytes     bigint,
  cost_usd       numeric(10, 6),
  status         public.content_status not null default 'generated',
  decided_at     timestamptz,
  ad_media_id    uuid references public.ad_media on delete set null,
  submitted_at   timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index creative_assets_concept on public.creative_assets (concept_id, created_at desc);
create index creative_assets_pending on public.creative_assets (user_id, render_status) where render_status in ('queued', 'running');

-- Proveedor de cada generación registrada (Claude o Higgsfield).
alter table public.ai_generations add column provider text not null default 'anthropic';

alter table public.higgsfield_connections enable row level security;
alter table public.creative_runs          enable row level security;
alter table public.creative_concepts      enable row level security;
alter table public.creative_assets        enable row level security;
create policy "dueño lee" on public.higgsfield_connections for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.creative_runs          for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.creative_concepts      for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.creative_assets        for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-media', 'creative-media', false, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "dueño lee sus piezas generadas" on storage.objects for select
  using (bucket_id = 'creative-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
