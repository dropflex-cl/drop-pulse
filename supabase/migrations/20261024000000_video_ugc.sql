-- Video UGC en Creativos (docs/spec-video-ugc.md §6). Un guion por ángulo de testeo; sus tomas
-- (imágenes clave, tomas habladas y B-roll) se generan con la clave de Higgsfield del comerciante. El
-- montaje es local (scripts/ugc-montage.py) y el video final se sube a la misma fila del guion.

create table public.video_scripts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  angle_slot smallint not null check (angle_slot between 1 and 3),
  -- Generación del guion (Claude).
  status public.pipeline_run_status not null default 'queued',
  error_code text,
  error_message text,
  -- UgcScript (lib/video/schemas.ts); lo edita el comerciante antes de aprobar.
  payload jsonb,
  -- Con qué se escribió: desarrollo del ángulo, cliente ideal, precios y mercado.
  input jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  edited_at timestamptz,
  superseded_at timestamptz,
  -- El video montado en local y subido de vuelta.
  final_storage_path text,
  final_width integer,
  final_height integer,
  final_duration_s numeric,
  final_size_bytes bigint,
  final_status public.content_status,
  final_decided_at timestamptz,
  ad_media_id uuid references public.ad_media (id) on delete set null,
  prompt_version smallint,
  model text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un guion vigente por producto y ángulo.
create unique index video_scripts_active on public.video_scripts (product_id, angle_slot) where superseded_at is null;
create index video_scripts_product on public.video_scripts (product_id, created_at desc);

create table public.video_shots (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.video_scripts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- K1… (imagen clave), A1… (toma hablada), B1… (B-roll): la clave del guion.
  key text not null,
  kind text not null check (kind in ('keyframe', 'a_roll', 'b_roll')),
  attempt smallint not null default 1,
  endpoint text not null,
  input jsonb not null,
  render_status text not null default 'queued' check (render_status in ('queued', 'running', 'succeeded', 'failed')),
  hf_request_id text unique,
  submitted_at timestamptz,
  finished_at timestamptz,
  storage_path text,
  width integer,
  height integer,
  duration_s numeric,
  size_bytes bigint,
  cost_usd numeric(10, 6),
  qa jsonb,
  -- La aprobación de las imágenes clave (los clips no se aprueban uno a uno: se aprueba el video).
  status public.content_status not null default 'generated',
  error_code text,
  error_message text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index video_shots_script on public.video_shots (script_id, key, created_at desc);
create index video_shots_pending on public.video_shots (user_id, render_status) where render_status in ('queued', 'running');

alter table public.video_scripts enable row level security;
alter table public.video_shots enable row level security;
create policy "dueño lee" on public.video_scripts for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.video_shots for select using (user_id = (select auth.uid()));

-- creative-media guarda también los clips y el video final (MP4).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'],
    file_size_limit = 104857600
where id = 'creative-media';
