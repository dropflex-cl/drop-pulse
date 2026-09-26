-- Productos de upsell: se venden como extra en el checkout y no se optimizan. Productos y Hoy los
-- esconden y se ven aparte en /products/upsell. Lo marca el comerciante; la sincronización con
-- Shopify no lo toca (inserta con ignoreDuplicates).
alter table public.products add column is_upsell boolean not null default false;
