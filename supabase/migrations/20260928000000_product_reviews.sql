-- Reseñas importadas de AliExpress (etapa opcional “Reseñas”, design-system/arquitectura.md › 9).
-- El comerciante pega el enlace del mismo producto en AliExpress; el servidor lee sus reseñas en
-- segundo plano (review_imports lleva el avance), copia las fotos a Storage y cada reseña entra
-- `in_review`: nada se usa ni se publica sin su decisión. Lógica de lectura portada de dropflex v1.
-- Lecturas: el dueño con RLS. Escrituras: solo service_role desde el servidor.

-- Un listado de AliExpress enlazado a un producto, con lo que dice de sí mismo.
create table public.review_sources (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products on delete cascade,
  user_id           uuid not null references auth.users on delete cascade,
  source            text not null default 'aliexpress' check (source in ('aliexpress')),
  source_product_id text not null,                         -- id numérico del artículo
  url               text not null,
  avg_rating        numeric(2,1),                          -- promedio de TODAS sus reseñas
  total_reviews     integer,
  photo_reviews     integer,
  last_imported_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id, source, source_product_id)
);
create index review_sources_user on public.review_sources (user_id);

-- Una importación: filtros elegidos y avance (“Leyendo reseñas… 112 de 204”). Sigue aunque el
-- comerciante salga de la pantalla.
create table public.review_imports (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  source_id      uuid references public.review_sources on delete cascade,
  url            text not null,
  min_rating     smallint not null default 4 check (min_rating between 1 and 5),
  photos_only    boolean not null default false,
  translate      boolean not null default true,
  status         public.pipeline_run_status not null default 'queued',
  step           text check (step in ('reading', 'photos')),
  read_count     integer not null default 0,
  total_count    integer,
  imported_count integer not null default 0,
  skipped_count  integer not null default 0,               -- ya estaban (importar otra vez no duplica)
  error_code     text,
  error_message  text,                                     -- en español, para mostrar
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index review_imports_product on public.review_imports (product_id, created_at desc);
-- Una sola importación activa por producto.
create unique index review_imports_one_active on public.review_imports (product_id) where status in ('queued', 'running');

-- Una reseña. El texto original se guarda siempre; editar solo corrige traducción u ortografía
-- (body_edited) y deja la marca “Editada por ti”. Calificación, autor, país y fecha no se editan.
create table public.product_reviews (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  source_id       uuid not null references public.review_sources on delete cascade,
  source          text not null default 'aliexpress' check (source in ('aliexpress')),
  external_id     text not null,
  author          text not null,                           -- anonimizado: “M***a”
  country         char(2) check (country ~ '^[A-Z]{2}$'),
  rating          smallint not null check (rating between 1 and 5),
  body_original   text,
  body_translated text,
  use_translation boolean not null default true,           -- se muestra la traducción de AliExpress
  body_edited     text,
  variant         text,
  reviewed_at     date,
  helpful_count   integer not null default 0,
  -- Fotos del cliente copiadas al bucket product-references, bajo <user_id>/<product_id>/ (así el
  -- borrado del producto se las lleva): [{ path, source_url }]
  photos          jsonb not null default '[]',
  flags           text[] not null default '{}',            -- alertas: sugerencias, nunca rechazan solas
  status          public.content_status not null default 'in_review',
  position        integer not null default 0,
  edited_at       timestamptz,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, source, external_id)
);
create index product_reviews_product on public.product_reviews (product_id, status, position);
create index product_reviews_user on public.product_reviews (user_id);

alter table public.review_sources enable row level security;
alter table public.review_imports enable row level security;
alter table public.product_reviews enable row level security;
create policy "dueño lee" on public.review_sources for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.review_imports for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.product_reviews for select using (user_id = (select auth.uid()));
