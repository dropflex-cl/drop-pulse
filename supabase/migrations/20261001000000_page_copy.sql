-- Página del producto (etapa Textos, docs/spec-textos.md). Con los 2 desarrollos de ángulo aprobados,
-- el redactor de página escribe los bloques de la página en la tienda (título, descripción corta,
-- beneficios, cómo funciona, preguntas frecuentes, envío y pago, SEO). Cada bloque es una propuesta
-- que el comerciante acepta, edita o descarta. La IA propone, el comerciante decide.

-- Cómo despacha la tienda: el bloque «Envío y pago» lo dice tal cual. Hoy toda la operación es envío
-- gratis a todo el país con pago contra entrega.
alter table public.merchant_settings
  add column free_shipping boolean not null default true;

-- Una escritura de la página. `input` guarda qué se usó (desarrollos, cliente ideal, precio) y, al
-- reescribir, qué bloques ya estaban aprobados.
create table public.copy_runs (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  status         public.pipeline_run_status not null default 'queued',
  error_code     text,
  error_message  text,                        -- en español, para la pantalla
  input          jsonb not null default '{}',
  payload        jsonb,                       -- lo que devolvió el modelo (lib/copy/schemas.ts)
  prompt_version smallint,
  model          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index copy_runs_product on public.copy_runs (product_id, created_at desc);
-- Una escritura en curso por producto: tocar dos veces no cobra dos veces.
create unique index copy_runs_one_active on public.copy_runs (product_id) where status in ('queued', 'running');

-- Un bloque propuesto. Reescribir reemplaza los que no estaban aprobados (superseded_at).
create table public.content_items (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  run_id        uuid not null references public.copy_runs on delete cascade,
  key           text not null,                -- lib/copy/blocks.ts › PAGE_BLOCKS
  position      smallint not null,            -- orden en la página
  original      text,                         -- lo que hay hoy en Shopify (título; descripción como referencia)
  proposal      text not null,                -- preguntas: «pregunta\nrespuesta»
  edited_text   text,                         -- «Guardar y aceptar»
  angle_role    text check (angle_role in ('primary', 'secondary')),
  note          text,                         -- por qué lo propone la IA
  missing       text,                         -- dato que la IA no tiene («el plazo de entrega»)
  status        public.content_status not null default 'generated',
  decided_at    timestamptz,
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index content_items_active on public.content_items (product_id, position) where superseded_at is null;
create index content_items_run on public.content_items (run_id);

alter table public.copy_runs     enable row level security;
alter table public.content_items enable row level security;
create policy "dueño lee" on public.copy_runs     for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.content_items for select using (user_id = (select auth.uid()));
