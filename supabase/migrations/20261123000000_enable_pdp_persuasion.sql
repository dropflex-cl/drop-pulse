-- Activación autorizada: disponible para productos actuales y nuevas sincronizaciones.
-- No aprueba planes, activa experiencias ni publica contenido en Shopify.
alter table public.products alter column pdp_persuasion_enabled set default true;
update public.products set pdp_persuasion_enabled = true where not pdp_persuasion_enabled;
