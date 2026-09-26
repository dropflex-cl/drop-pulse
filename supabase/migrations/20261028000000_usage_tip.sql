-- Etapa WhatsApp (/products/[id]/whatsapp): el consejo de uso del mensaje «Entregado» lo escribe la IA
-- una vez por producto (paso usage_tip) desde la ficha. Se guarda en el producto: { text, basis,
-- created_at, prompt_version, model } (lib/whatsapp/tip.ts › UsageTip). Se borra con el producto.
alter table public.products add column usage_tip jsonb;
