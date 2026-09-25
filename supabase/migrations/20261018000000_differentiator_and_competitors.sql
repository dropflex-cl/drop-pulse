-- Diferenciador y competencia (docs/spec-angulos-testeo.md › §3, Fase 1), en Información base.
-- El diferenciador lo propone la ficha (product_briefs.payload.differentiator) y el comerciante lo
-- confirma o edita aquí. Las tiendas de la competencia las pega el comerciante (de 1 a 7 links) y el
-- servidor analiza cada página en segundo plano (lib/pipeline/competitors.ts).
-- Lecturas: el dueño con RLS. Escrituras: solo service_role desde el servidor.

-- El diferenciador confirmado por el comerciante: { versus, claim, basis }. null = sin confirmar
-- (la pantalla muestra la propuesta de la ficha).
alter table public.products add column differentiator jsonb;
alter table public.products add column differentiator_confirmed_at timestamptz;

-- Una tienda de la competencia y su análisis. Cuelga en cascada de products (deleteProducts no
-- necesita pasos nuevos).
create table public.product_competitors (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  url         text not null,
  source      text not null default 'manual',   -- hoy solo 'manual'
  analysis    jsonb,                            -- lib/competitors/schemas.ts › competitorAnalysisSchema; null = sin analizar
  status      text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error_code  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, url)
);
create index product_competitors_product on public.product_competitors (product_id);
create index product_competitors_user on public.product_competitors (user_id);

alter table public.product_competitors enable row level security;
create policy "dueño lee" on public.product_competitors for select using (user_id = (select auth.uid()));
