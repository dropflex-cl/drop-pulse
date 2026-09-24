-- Etapa Imágenes (docs/spec-imagenes.md): las imágenes de la página del producto (PDP), por espacio
-- (Portada, Galería, un Beneficio por cada beneficio aprobado en Textos). Un director de galería
-- (Claude) propone una toma por espacio con dirección de arte; Higgsfield Marketing Studio Flare la
-- renderiza desde la foto base; un QA con Claude revisa producto, textos y props. Junto a las
-- generadas, el comerciante puede elegir sus fotos (Información base) o subir otras.

-- ---------------------------------------------------------------- Director
-- Una corrida del director de galería. `input` guarda qué se usó (mercado, beneficios aprobados);
-- `payload`, lo común a la galería (cómo se ve el producto, kit, paleta, props).
create table public.page_image_runs (
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
create index page_image_runs_product on public.page_image_runs (product_id, created_at desc);
create unique index page_image_runs_one_active on public.page_image_runs (product_id) where status in ('queued', 'running');

-- Una toma del director para un espacio. `slot` es 'cover', 'gallery' (5 tomas distintas) o
-- 'benefit-<content_item_id>' (el beneficio aprobado en Textos que acompaña).
create table public.page_image_shots (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  run_id        uuid not null references public.page_image_runs on delete cascade,
  slot          text not null,
  position      smallint not null,
  payload       jsonb not null,                  -- lib/page-images/schemas.ts › StoredShot
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index page_image_shots_active on public.page_image_shots (product_id, position) where superseded_at is null;

-- Una opción para un espacio: generada (source 'ai', con su toma), subida ('upload') o una foto de
-- Información base ('reference'). `status` approved = elegida para la página; en la galería,
-- `position` es su orden (1 = primera después de la portada).
create table public.page_images (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products on delete cascade,
  user_id            uuid not null references auth.users on delete cascade,
  slot               text not null,
  source             text not null check (source in ('ai', 'upload', 'reference')),
  shot_id            uuid references public.page_image_shots on delete cascade,
  reference_image_id uuid references public.product_reference_images on delete cascade,
  attempt            smallint not null default 1,
  retry_of           uuid references public.page_images on delete set null,  -- el intento que el QA rechazó
  endpoint           text,
  input              jsonb not null default '{}',  -- lo que se envió a Higgsfield (sin URLs firmadas)
  baked_texts        jsonb not null default '[]',  -- los textos pedidos, para el QA
  render_status      text not null default 'succeeded' check (render_status in ('queued', 'running', 'succeeded', 'failed')),
  hf_request_id      text unique,
  error_code         text,
  error_message      text,
  qa                 jsonb,                        -- lib/page-images/schemas.ts › QaResult
  storage_path       text,                         -- bucket page-media (generadas y subidas)
  width              integer,
  height             integer,
  size_bytes         bigint,
  status             public.content_status not null default 'generated',
  position           smallint,
  decided_at         timestamptz,
  submitted_at       timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index page_images_product on public.page_images (product_id, slot, created_at);
create index page_images_pending on public.page_images (user_id, render_status) where render_status in ('queued', 'running');
-- Una foto de Información base aparece una sola vez por espacio.
create unique index page_images_one_reference on public.page_images (product_id, slot, reference_image_id) where reference_image_id is not null;

alter table public.page_image_runs  enable row level security;
alter table public.page_image_shots enable row level security;
alter table public.page_images      enable row level security;
create policy "dueño lee" on public.page_image_runs  for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.page_image_shots for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.page_images      for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-media', 'page-media', false, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "dueño lee sus imágenes de la página" on storage.objects for select
  using (bucket_id = 'page-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
