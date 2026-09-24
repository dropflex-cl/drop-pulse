-- Costo de IA por producto (design-system/arquitectura.md › 11: AiCostChip, AiCostCard, AiRunList).
-- Toda llamada a un modelo queda en ai_generations (lib/ai/track.ts); la pantalla suma por producto.

-- Qué se generó dentro del paso (“Transformación”, “Concepto 2 · 9:16”): separa un desarrollo de otro
-- para distinguir generar, regenerar y reintentar.
alter table public.ai_generations add column detail text;
-- El proveedor no informa el costo (Higgsfield): cost_usd es una estimación.
alter table public.ai_generations add column cost_estimated boolean not null default false;
create index ai_generations_product on public.ai_generations (product_id, created_at);

-- Tope opcional de gasto en IA por producto, en la moneda de la tienda. Avisa desde el 80%.
alter table public.merchant_settings
  add column ai_cost_cap numeric check (ai_cost_cap > 0);
