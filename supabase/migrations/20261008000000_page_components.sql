-- Página del producto con componentes (docs/spec-pagina-componentes.md). Reemplaza los bloques de
-- texto de content_items: una escritura (copy_runs, una llamada a Claude) propone la ficha del
-- producto y el contenido de cada componente de conversión (lib/shopify/components/catalog.ts); el
-- comerciante elige cuáles usar en la página, los edita y los aprueba. La IA propone, el comerciante
-- decide.

create table public.page_components (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  run_id        uuid not null references public.copy_runs on delete cascade,
  component     text not null,                   -- 'listing' (la ficha) o un id de catalog.ts
  position      smallint not null,               -- orden en la página (el del catálogo; la ficha, 0)
  proposal      jsonb not null,                  -- lo que escribió la IA (validado con su content.ts)
  content       jsonb,                           -- la versión del comerciante; null = la propuesta
  enabled       boolean not null default false,  -- «Usar en la página» (la ficha, siempre)
  images        jsonb not null default '[]',     -- [{ slot, source: 'reference'|'page_image', id }]
  status        public.content_status not null default 'generated',  -- generated → approved
  decided_at    timestamptz,
  superseded_at timestamptz,                     -- reemplazado por otra escritura
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Uno vigente por componente y producto.
create unique index page_components_active on public.page_components (product_id, component) where superseded_at is null;
create index page_components_run on public.page_components (run_id);
create index page_components_user on public.page_components (user_id);

alter table public.page_components enable row level security;
create policy "dueño lee" on public.page_components for select using (user_id = (select auth.uid()));

-- Los bloques del modelo anterior no se migran: se vuelven a escribir con un toque.
drop table public.content_items;
