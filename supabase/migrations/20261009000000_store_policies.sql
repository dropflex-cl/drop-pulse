-- Envíos y políticas de la tienda (Ajustes › Envíos y políticas). Son los datos reales que la tienda
-- pone en los componentes de conversión: se publican como shop.metafields.dropflex.policies y
-- dropflex.logistics (lib/shopify/components/define.ts › SHARED_METAFIELDS). Un beneficio que menciona
-- una política vacía aquí no se muestra en la tienda. free_shipping ya existía (20261001000000).
alter table public.merchant_settings
  add column free_shipping_threshold numeric check (free_shipping_threshold is null or free_shipping_threshold > 0),
  add column return_days integer check (return_days is null or return_days between 1 and 365),
  add column warranty_months integer check (warranty_months is null or warranty_months between 1 and 120),
  add column whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  add column handling_days integer check (handling_days is null or handling_days between 0 and 30),
  add column transit_days_min integer check (transit_days_min is null or transit_days_min between 0 and 60),
  add column transit_days_max integer check (transit_days_max is null or transit_days_max between 0 and 60),
  add column cutoff_hour integer check (cutoff_hour is null or cutoff_hour between 0 and 23),
  add column business_days_only boolean not null default true,
  add column saturday_delivery boolean not null default false,
  add constraint merchant_settings_transit_range check (transit_days_min is null or transit_days_max is null or transit_days_min <= transit_days_max);
