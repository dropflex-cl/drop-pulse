-- Cada creativo de Anuncios recuerda de qué ángulo de testeo sale (docs/spec-angulos-testeo.md §6):
-- el anuncio lleva el texto de SU ángulo. Los subidos a mano quedan sin ángulo (null).
alter table public.ad_media add column angle_slot smallint check (angle_slot between 1 and 3);

update public.ad_media m
set angle_slot = c.angle_slot
from public.creative_assets a
join public.creative_concepts c on c.id = a.concept_id
where a.ad_media_id = m.id;
