-- Ángulos de venta (etapa Ángulos, después de Información base). Con la ficha, el cliente ideal
-- aprobado y el precio, el orquestador (angle-router) evalúa los 6 ángulos; el puntaje se calcula en
-- código (lib/angles/score.ts) a partir de su evaluación. El comerciante elige principal y secundario y
-- los agentes de ángulo desarrollan los dos elegidos en paralelo. La IA propone, el comerciante decide.

create type public.sales_angle as enum (
  'authority', 'common_enemy', 'unique_mechanism', 'age_identity', 'personal_story', 'offer'
);

-- Una evaluación del orquestador. La elección del comerciante se guarda en la misma fila.
create table public.angle_rankings (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products on delete cascade,
  user_id             uuid not null references auth.users on delete cascade,
  status              public.pipeline_run_status not null default 'queued',
  error_code          text,
  error_message       text,                        -- en español, para la pantalla
  input               jsonb not null default '{}', -- mercado, precio y el cliente ideal usado (avatar_id)
  payload             jsonb,                       -- la evaluación del modelo (criterios 0–5, motivos, riesgos)
  scores              jsonb,                       -- el ranking calculado: [{ angle, score, breakdown, risks, why }]
  suggested_primary   public.sales_angle,
  suggested_secondary public.sales_angle,
  primary_angle       public.sales_angle,          -- la elección confirmada del comerciante
  secondary_angle     public.sales_angle,
  confirmed_at        timestamptz,
  prompt_version      smallint,
  model               text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (primary_angle is null or secondary_angle is null or primary_angle <> secondary_angle)
);
create index angle_rankings_product on public.angle_rankings (product_id, created_at desc);
-- Una evaluación en curso por producto: tocar dos veces no cobra dos veces.
create unique index angle_rankings_one_active on public.angle_rankings (product_id) where status in ('queued', 'running');

-- El desarrollo de un ángulo elegido (brief de ángulo). Una fila por intento: regenerar crea otra y
-- la anterior queda `rejected` (recuperable).
create table public.angle_briefs (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  ranking_id     uuid not null references public.angle_rankings on delete cascade,
  angle          public.sales_angle not null,
  role           text not null check (role in ('primary', 'secondary')),
  generation     public.pipeline_run_status not null default 'queued',
  error_code     text,
  error_message  text,
  payload        jsonb,                            -- el brief (esquema por ángulo en lib/angles/schemas.ts)
  status         public.content_status not null default 'generated',
  prompt_version smallint,
  model          text,
  edited_at      timestamptz,
  decided_at     timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index angle_briefs_product on public.angle_briefs (product_id, created_at desc);
create index angle_briefs_ranking on public.angle_briefs (ranking_id);
-- Un desarrollo en curso por papel (principal / secundario) y producto.
create unique index angle_briefs_one_active on public.angle_briefs (product_id, role) where generation in ('queued', 'running');

alter table public.angle_rankings enable row level security;
alter table public.angle_briefs   enable row level security;
create policy "dueño lee" on public.angle_rankings for select using (user_id = (select auth.uid()));
create policy "dueño lee" on public.angle_briefs   for select using (user_id = (select auth.uid()));
