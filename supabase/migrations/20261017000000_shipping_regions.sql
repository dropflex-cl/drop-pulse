-- Envíos: despacho los sábados y plazo de regiones (Ajustes › Envíos y políticas). Con
-- regions_extra_days, el tránsito de merchant_settings rige en main_city («Santiago») y el resto del
-- país suma esos días: la línea de tiempo de la tienda muestra las dos fechas
-- (lib/settings/policies.ts › logisticsMetafield).
alter table public.merchant_settings
  add column saturday_dispatch boolean not null default false,
  add column main_city text check (main_city is null or char_length(main_city) between 1 and 40),
  add column regions_extra_days integer check (regions_extra_days is null or regions_extra_days between 1 and 30),
  add constraint merchant_settings_regions_city check (regions_extra_days is null or main_city is not null);
