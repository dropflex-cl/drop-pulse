-- Etiquetas persuasivas de los packs (“2 meses de uso”, “Uno para ti y otro para tu pareja”). La IA
-- las propone en el paso del cliente ideal (misma llamada) y el comerciante las decide aparte en
-- “Precio y packs”: entran como `generated`, igual que customer_avatars.
create table public.pack_labels (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  run_id         uuid references public.pipeline_runs on delete set null,
  payload        jsonb not null,                           -- [{ units, label, support, badge, basis, reason }]
  -- Precios de los packs cuando se generaron: si cambian, la pantalla pide revisar las etiquetas
  -- (“3 al precio de 2” deja de ser cierto si cambia el descuento).
  prices         jsonb not null default '[]',              -- [{ units, price }]
  status         public.content_status not null default 'generated',
  prompt_version smallint not null,
  model          text not null,
  edited_at      timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pack_labels_product on public.pack_labels (product_id, created_at desc);

alter table public.pack_labels enable row level security;
create policy "dueño lee" on public.pack_labels for select using (user_id = (select auth.uid()));
