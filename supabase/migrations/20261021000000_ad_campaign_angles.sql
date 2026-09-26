-- Con qué desarrollos de ángulo se armaron los textos y creativos del borrador (lib/ads/angles.ts):
-- [{ id, edited_at }] en orden de slot. Si los ángulos cambian, Anuncios ofrece rehacer el borrador.
-- null: borrador de antes (se compara por sus textos).
alter table public.ad_campaigns add column angles_stamp jsonb;
