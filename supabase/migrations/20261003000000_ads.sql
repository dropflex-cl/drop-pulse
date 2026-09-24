-- Anuncios en Meta y motor de decisión (docs/spec-anuncios.md §8). Dos estructuras (ABO y CBO);
-- las plantillas del sistema viven en código (lib/ads/presets.ts) y solo precargan: la configuración
-- de lanzamiento y la del motor son de CADA campaña. Métricas cada hora, con historial.

create type public.ad_structure as enum ('abo', 'cbo');
create type public.ad_campaign_status as enum ('draft', 'launching', 'paused', 'active', 'failed', 'archived');
create type public.ad_verdict as enum ('wait', 'keep', 'pause', 'scale', 'winners');

-- Tope de gasto diario de la cuenta publicitaria (en su moneda). Sin valor por defecto: se pide
-- antes del primer lanzamiento y ningún lanzamiento lo supera.
alter table public.merchant_settings
  add column ad_daily_spend_cap numeric check (ad_daily_spend_cap > 0);

-- Plantillas propias: { structure, launch, engine } guardadas por el comerciante.
create table public.ad_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  structure   public.ad_structure not null,
  launch      jsonb not null,
  engine      jsonb not null,
  based_on    text,                              -- clave de la plantilla del sistema de la que salió
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ad_templates_user on public.ad_templates (user_id, created_at desc);

-- Los creativos que sube el comerciante (bucket ad-media) y su copia en la cuenta de Meta.
create table public.ad_media (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  product_id      uuid not null references public.products on delete cascade,
  kind            text not null check (kind in ('image', 'video')),
  name            text not null,
  storage_path    text not null,
  mime_type       text not null,
  width           integer,
  height          integer,
  ratio           text check (ratio in ('1:1', '4:5', '9:16')),
  duration_s      numeric,
  size_bytes      bigint not null,
  position        smallint not null default 0,
  ad_account_id   text,                          -- la cuenta donde está subido (hash e id valen solo ahí)
  meta_image_hash text,
  meta_video_id   text,
  thumbnail_hash  text,
  status          text not null default 'ready' check (status in ('uploading', 'processing', 'ready', 'error')),
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ad_media_product on public.ad_media (product_id, position);

-- Una campaña. `launch` y `engine` son SUYOS (validados con zod, lib/ads/schemas.ts): cambiar una
-- campaña no toca las demás ni la plantilla de la que salió.
create table public.ad_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  product_id         uuid not null references public.products on delete cascade,
  ad_account_id      text,
  meta_campaign_id   text unique,
  name               text not null,
  structure          public.ad_structure not null,
  template_key       text,                       -- plantilla del sistema aplicada
  template_id        uuid references public.ad_templates on delete set null, -- solo referencia: la campaña tiene su copia
  status             public.ad_campaign_status not null default 'draft',
  launch             jsonb not null,             -- creativos, público, presupuesto, horario, textos
  engine             jsonb not null,             -- { mode, cpa_limit, rules[] }
  daily_budget       numeric,                    -- CBO: el presupuesto de la campaña
  currency           char(3) not null,
  timezone           text not null default 'America/Santiago',
  source_campaign_id uuid references public.ad_campaigns on delete set null, -- la ABO de la que salió una CBO de ganadores
  meta_objects       jsonb not null default '[]', -- lo creado en Meta al lanzar, en orden (para revertir)
  progress           jsonb,                      -- avance del lanzamiento, para la pantalla
  error              text,                       -- en español, para la pantalla
  launched_at        timestamptz,
  starts_at          timestamptz,                -- inicio programado de los conjuntos (null: al publicar)
  published_at       timestamptz,
  last_delivery_at   timestamptz,
  last_changed_at    timestamptz,                -- último cambio de presupuesto o estado (CBO: regla after_change)
  last_synced_at     timestamptz,
  sync_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ad_campaigns_product on public.ad_campaigns (product_id, created_at desc);
create index ad_campaigns_sync on public.ad_campaigns (status, last_synced_at) where status in ('active', 'paused');
-- Un borrador o lanzamiento en curso por producto (y por campaña de origen, para la CBO de ganadores).
create unique index ad_campaigns_one_open on public.ad_campaigns (product_id, coalesce(source_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('draft', 'launching');

create table public.ad_sets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  campaign_id     uuid not null references public.ad_campaigns on delete cascade,
  meta_adset_id   text unique,
  name            text not null,
  position        smallint not null,
  audience        jsonb not null,
  daily_budget    numeric,                       -- ABO: el presupuesto del conjunto
  status          text not null default 'PAUSED', -- effective_status de Meta
  last_changed_at timestamptz,                   -- último cambio de presupuesto o estado (regla after_change)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ad_sets_campaign on public.ad_sets (campaign_id, position);

create table public.ads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  campaign_id      uuid not null references public.ad_campaigns on delete cascade,
  adset_id         uuid not null references public.ad_sets on delete cascade,
  meta_ad_id       text unique,
  meta_creative_id text,
  name             text not null,
  media_id         uuid references public.ad_media,
  copy             jsonb not null,               -- { primary_texts, headlines, description, link, cta }
  status           text not null default 'PAUSED',
  last_changed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index ads_campaign on public.ads (campaign_id);
create index ads_adset on public.ads (adset_id);

-- Métricas. El día se reescribe mientras Meta asienta las conversiones (hasta 72 h); la foto
-- horaria solo se agrega: es el historial de los gráficos.
create table public.ad_insights_daily (
  user_id             uuid not null references auth.users on delete cascade,
  campaign_id         uuid not null references public.ad_campaigns on delete cascade,
  level               text not null check (level in ('campaign', 'adset', 'ad')),
  unit_id             uuid not null,             -- ad_campaigns.id, ad_sets.id o ads.id
  date                date not null,             -- en la zona horaria de la cuenta
  spend               numeric not null default 0,
  impressions         bigint not null default 0,
  reach               bigint not null default 0,
  clicks              bigint not null default 0, -- clics en el enlace
  purchases           integer not null default 0,
  purchase_value      numeric not null default 0,
  initiated_checkouts integer not null default 0,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  cpa                 numeric,
  roas                numeric,
  updated_at          timestamptz not null default now(),
  primary key (unit_id, date)
);
create index ad_insights_daily_campaign on public.ad_insights_daily (campaign_id, date);

create table public.ad_insights_snapshots (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.ad_campaigns on delete cascade,
  level       text not null check (level in ('campaign', 'adset', 'ad')),
  unit_id     uuid not null,
  captured_at timestamptz not null default now(),
  date        date not null,
  today       jsonb not null,                    -- lo acumulado del día a esta hora
  lifetime    jsonb not null                     -- lo acumulado desde el inicio
);
create index ad_insights_snapshots_unit on public.ad_insights_snapshots (unit_id, captured_at desc);
create index ad_insights_snapshots_campaign on public.ad_insights_snapshots (campaign_id, captured_at desc);

-- El motor: cada decisión (solo se agregan filas; una igual a la anterior actualiza last_seen_at) y
-- cada cambio aplicado en Meta, con deshacer.
create table public.ad_decisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  campaign_id      uuid not null references public.ad_campaigns on delete cascade,
  level            text not null check (level in ('campaign', 'adset', 'ad')),
  unit_id          uuid not null,
  verdict          public.ad_verdict not null,
  rule_id          text,
  reason           text not null,
  metrics          jsonb not null default '{}',
  progress         numeric,                      -- esperar: cuánto falta (0 a 1)
  suggested_budget numeric,
  disposition      text not null default 'pending' check (disposition in ('pending', 'applied', 'auto_applied', 'ignored', 'expired', 'undone', 'info')),
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       text check (decided_by in ('merchant', 'engine'))
);
create index ad_decisions_campaign on public.ad_decisions (campaign_id, last_seen_at desc);
create index ad_decisions_unit on public.ad_decisions (unit_id, last_seen_at desc);
create index ad_decisions_pending on public.ad_decisions (user_id) where disposition = 'pending';

create table public.ad_changes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.ad_campaigns on delete cascade,
  level       text not null check (level in ('campaign', 'adset', 'ad')),
  unit_id     uuid not null,
  action      text not null check (action in ('pause', 'resume', 'set_budget', 'publish', 'create', 'external')),
  before      jsonb,
  after       jsonb,
  decision_id uuid references public.ad_decisions on delete set null,
  rule_id     text,
  actor       text not null check (actor in ('merchant', 'engine', 'meta')),
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index ad_changes_campaign on public.ad_changes (campaign_id, created_at desc);

alter table public.ad_templates          enable row level security;
alter table public.ad_media              enable row level security;
alter table public.ad_campaigns          enable row level security;
alter table public.ad_sets               enable row level security;
alter table public.ads                   enable row level security;
alter table public.ad_insights_daily     enable row level security;
alter table public.ad_insights_snapshots enable row level security;
alter table public.ad_decisions          enable row level security;
alter table public.ad_changes            enable row level security;
create policy "dueño lee" on public.ad_templates          for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_media              for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_campaigns          for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_sets               for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ads                   for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_insights_daily     for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_insights_snapshots for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_decisions          for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.ad_changes            for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Storage
-- Creativos: <user_id>/<product_id>/<uuid>.<ext>. Privado; Meta recibe una URL firmada de 1 h
-- (videos) o los bytes (imágenes). El límite real por archivo es el menor entre este y el del proyecto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-media', 'ad-media', false, 1073741824, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy "dueño lee sus creativos" on storage.objects for select
  using (bucket_id = 'ad-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- Job horario
-- A los minutos 5 de cada hora, pg_net llama /api/cron/ads-sync. La URL y el secreto se leen de
-- Vault (se cargan a mano, no quedan escritos aquí):
--   select vault.create_secret('https://<dominio>', 'app_base_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Sin esos secretos el job no hace nada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ads-sync-hourly',
  '5 * * * *',
  $job$
  select net.http_get(
    url := s.base || '/api/cron/ads-sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
    timeout_milliseconds := 10000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') as base,
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as secret
  ) s
  where s.base is not null and s.secret is not null;
  $job$
);
