-- Etapa Publicar (docs/spec-publicar.md): el tema de DropFlex instalado en la tienda y cada producto
-- publicado (ficha, packs como variantes, galería y metafields dropflex.*). Escritura solo con
-- service_role; el dueño lee.

-- ---------------------------------------------------------------- Tema
-- Una fila por comerciante: el tema de DropFlex en su tienda. `kit_version` es la huella del código
-- del tema (lib/shopify/publish/kit.ts); si cambia, «Actualizar tema» sube solo lo que difiere.
create table public.shopify_theme_installations (
  user_id       uuid primary key references auth.users on delete cascade,
  shop_domain   text not null,
  theme_gid     text,
  theme_name    text,
  kit_version   text,
  status        text not null check (status in ('installing', 'preview', 'published', 'failed')),
  error_message text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.shopify_theme_installations enable row level security;
create policy "dueño lee" on public.shopify_theme_installations for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Archivos
-- Caché de lo subido a Shopify Files: el mismo archivo de origen (una imagen de la página, una foto
-- de reseña) no se sube dos veces a la misma tienda. Cae con el producto.
create table public.shopify_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  product_id  uuid not null references public.products on delete cascade,
  shop_domain text not null,
  source_key  text not null,                       -- '<bucket>/<path>'
  file_gid    text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, shop_domain, source_key)
);
create index shopify_files_product on public.shopify_files (product_id);
alter table public.shopify_files enable row level security;
create policy "dueño lee" on public.shopify_files for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Publicación del producto
-- La última publicación de cada producto. `summary` dice qué se envió (para la pantalla);
-- `stale` se calcula comparando `fingerprint` con lo aprobado hoy.
create table public.product_publications (
  product_id    uuid primary key references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  shop_domain   text not null,
  status        text not null check (status in ('publishing', 'published', 'error')),
  error_message text,
  fingerprint   text,
  summary       jsonb not null default '{}',
  product_url   text,
  published_at  timestamptz,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.product_publications enable row level security;
create policy "dueño lee" on public.product_publications for select using (user_id = (select auth.uid()));
