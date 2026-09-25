-- Ángulos de testeo (docs/spec-angulos-testeo.md §4): en vez de un principal y un secundario que se
-- mezclan en un mismo mensaje, 2 o 3 ángulos separados (uno por conjunto de anuncios). Cada ángulo es
-- un mensaje (dolor o deseo, segmento, promesa) contado con una de las 6 formas (sales_angle).

-- La elección del comerciante: [{ slot, frame, title, pain_or_desire, segment, promise, trigger_moment, competition }].
-- suggested_slots: los índices de test_angles (payload) que sugiere el código.
alter table public.angle_rankings
  add column chosen_angles jsonb,
  add column suggested_slots jsonb;

-- Las evaluaciones confirmadas con principal y secundario pasan a 2 ángulos (1 y 2) contados con esa forma.
update public.angle_rankings
set chosen_angles = jsonb_build_array(
  jsonb_build_object('slot', 1, 'frame', primary_angle, 'title', '', 'pain_or_desire', '', 'segment', '', 'promise', '', 'trigger_moment', '', 'competition', ''),
  jsonb_build_object('slot', 2, 'frame', secondary_angle, 'title', '', 'pain_or_desire', '', 'segment', '', 'promise', '', 'trigger_moment', '', 'competition', '')
)
where primary_angle is not null and secondary_angle is not null;

-- Un desarrollo por ángulo (slot 1, 2 o 3). `role` queda solo como historia.
alter table public.angle_briefs add column slot smallint check (slot between 1 and 3);
update public.angle_briefs set slot = case role when 'primary' then 1 else 2 end;
alter table public.angle_briefs alter column slot set not null;
alter table public.angle_briefs alter column role drop not null;
drop index if exists public.angle_briefs_one_active;
create unique index angle_briefs_one_active on public.angle_briefs (product_id, slot) where generation in ('queued', 'running');

-- Cada concepto de estático pertenece a un ángulo (su slot).
alter table public.creative_concepts add column angle_slot smallint check (angle_slot between 1 and 3);
update public.creative_concepts set angle_slot = case angle_role when 'primary' then 1 else 2 end;
alter table public.creative_concepts alter column angle_slot set not null;
alter table public.creative_concepts alter column angle_role drop not null;
