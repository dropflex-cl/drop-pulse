-- Precio y packs de cada producto (sección “Precio y packs” de Información base). Requisito para
-- “Optimizar con IA”: la ficha y el cliente ideal leen estos números (lib/pricing/prompt.ts).
-- Lo que escribe el comerciante + lo derivado con la calculadora (lib/pricing/calculator.ts,
-- portada de dropflex v1). El servidor recalcula todo antes de guardar.
create table public.product_pricing (
  product_id           uuid primary key references public.products on delete cascade,
  user_id              uuid not null references auth.users on delete cascade,
  currency             char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- Lo que escribe el comerciante
  unit_cost            numeric(14, 2) not null check (unit_cost > 0),     -- precio de compra al proveedor
  avg_shipping_cost    numeric(14, 2) not null check (avg_shipping_cost >= 0),
  purchase_cost_limit  numeric(14, 2) not null check (purchase_cost_limit >= 0), -- CPA objetivo
  confirmation_rate    numeric(5, 2)  not null check (confirmation_rate > 0 and confirmation_rate <= 100),
  delivery_rate        numeric(5, 2)  not null check (delivery_rate > 0 and delivery_rate <= 100),
  sale_price           numeric(14, 2) not null check (sale_price > 0),
  compare_at_price     numeric(14, 2) check (compare_at_price is null or compare_at_price > sale_price),
  extra_unit_discount  numeric(5, 2)  not null check (extra_unit_discount >= 0 and extra_unit_discount <= 95),
  -- Derivado (calculadora)
  minimum_price        numeric(14, 2) not null,                            -- equilibrio de 1 unidad
  recommended_price    numeric(14, 2) not null,
  profit               numeric(14, 2) not null,                            -- por pedido entregado
  max_cpa              numeric(14, 2),
  beroas               numeric(10, 4),
  packs                jsonb not null default '[]',                        -- [{ units, price, profit, margin, per_unit_price, savings, savings_rate }]
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index product_pricing_user on public.product_pricing (user_id);

alter table public.product_pricing enable row level security;
create policy "dueño lee" on public.product_pricing for select using (user_id = (select auth.uid()));
