-- Eventos (docs/spec-eventos.md): una capa de branding estacional (CyberMonday, Halloween, Black
-- Friday, Navidad…) que se pone encima de la página del producto sin tocar su contenido base.
--
-- - events: el calendario de DropFlex, igual para todos. Las fechas se editan aquí sin deploy (la
--   CCS puede mover un Cyber). `theme` solo lleva lo que cambia respecto del tema por defecto de su
--   `kind` (lib/events/catalog.ts › EVENT_THEMES).
-- - event_activations: lo que activa cada comerciante. `product_id` null = toda la tienda; una fila
--   de producto le gana a la de la tienda para ese producto (también para apagarlo).
-- - event_copy: textos del evento por producto (IA, el comerciante aprueba). El copy de la página
--   (page_components) nunca se toca: al terminar el evento la tienda vuelve sola a él.
-- Escritura solo con service_role; el dueño lee lo suyo y todos leen el calendario publicado.

create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  kind               text not null check (kind in ('cyber', 'black_friday', 'halloween', 'singles_day', 'christmas', 'new_year', 'summer_sale', 'back_to_school')),
  name               text not null,
  market             text not null default 'CL',       -- país (ISO), como merchant_settings.country_code
  campaign_starts_at timestamptz not null,             -- desde cuándo se ve en la tienda (antesala)
  starts_at          timestamptz not null,             -- el evento en sí (el contador cuenta hasta aquí antes)
  ends_at            timestamptz not null,             -- se apaga solo
  priority           smallint not null default 10,     -- si dos se cruzan, se ve el de mayor prioridad
  theme              jsonb not null default '{}',      -- cambios sobre EVENT_THEMES[kind]
  status             text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (campaign_starts_at <= starts_at and starts_at < ends_at)
);
create index events_window on public.events (market, ends_at) where status = 'published';
alter table public.events enable row level security;
create policy "todos leen el calendario" on public.events for select using (status = 'published');

create table public.event_activations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  event_id     uuid not null references public.events on delete cascade,
  product_id   uuid references public.products on delete cascade,   -- null = toda la tienda
  enabled      boolean not null default true,                         -- false en un producto = apagado para él
  intensity    text not null default 'medium' check (intensity in ('subtle', 'medium', 'full')),
  overrides    jsonb not null default '{}',                           -- { accent?, announcement?, badge_label? }
  starts_at    timestamptz,                                           -- null = la del evento (campaign_starts_at)
  ends_at      timestamptz,                                           -- null = la del evento
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
-- Una por evento para la tienda y una por evento y producto.
create unique index event_activations_store on public.event_activations (user_id, event_id) where product_id is null;
create unique index event_activations_product on public.event_activations (user_id, event_id, product_id) where product_id is not null;
create index event_activations_product_id on public.event_activations (product_id);
alter table public.event_activations enable row level security;
create policy "dueño lee" on public.event_activations for select using (user_id = (select auth.uid()));

create table public.event_copy (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  product_id    uuid not null references public.products on delete cascade,
  event_id      uuid not null references public.events on delete cascade,
  status        text not null default 'generating' check (status in ('generating', 'generated', 'approved', 'failed')),
  proposal      jsonb,                   -- lo que escribió la IA (lib/events/copy.ts › eventCopySchema)
  content       jsonb,                   -- la versión del comerciante; null = la propuesta
  error_message text,
  prompt_version smallint,
  model         text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, event_id)
);
create index event_copy_user on public.event_copy (user_id);
alter table public.event_copy enable row level security;
create policy "dueño lee" on public.event_copy for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Calendario Chile oct 2026 – mar 2027
-- Fuentes y ventanas: docs/spec-eventos.md › Calendario. Horario de verano de Chile (UTC−3) todo el
-- período. CyberMonday: fechas anunciadas por los retailers (la CCS aún no confirma al 2026-09-24).
insert into public.events (slug, kind, name, campaign_starts_at, starts_at, ends_at, priority) values
  ('cybermonday-2026',   'cyber',          'CyberMonday',       '2026-09-28 00:00-03', '2026-10-05 00:00-03', '2026-10-07 23:59:59-03', 30),
  ('halloween-2026',     'halloween',      'Halloween',         '2026-10-17 00:00-03', '2026-10-31 00:00-03', '2026-11-01 23:59:59-03', 10),
  ('singles-day-2026',   'singles_day',    '11.11',             '2026-11-09 00:00-03', '2026-11-11 00:00-03', '2026-11-11 23:59:59-03', 20),
  ('black-friday-2026',  'black_friday',   'Black Friday',      '2026-11-16 00:00-03', '2026-11-27 00:00-03', '2026-11-30 23:59:59-03', 40),
  ('navidad-2026',       'christmas',      'Navidad',           '2026-12-01 00:00-03', '2026-12-18 00:00-03', '2026-12-24 23:59:59-03', 20),
  ('ano-nuevo-2027',     'new_year',       'Año Nuevo',         '2026-12-26 00:00-03', '2026-12-31 00:00-03', '2027-01-01 23:59:59-03', 10),
  ('verano-2027',        'summer_sale',    'Liquidación de verano', '2027-01-02 00:00-03', '2027-01-02 00:00-03', '2027-02-28 23:59:59-03', 5),
  ('vuelta-a-clases-2027', 'back_to_school', 'Vuelta a clases', '2027-02-15 00:00-03', '2027-02-23 00:00-03', '2027-03-10 23:59:59-03', 10);

-- ---------------------------------------------------------------- Publicación de eventos
-- Lo del evento va en el metafield dropflex.event de cada producto publicado. Se publica con el
-- producto (Publicar) o solo (Eventos › Publicar en la tienda). La huella dice si hay cambios de
-- eventos sin publicar; `events_published_at`, cuándo se publicaron por última vez.
alter table public.product_publications
  add column event_fingerprint   text,
  add column events_published_at timestamptz;
