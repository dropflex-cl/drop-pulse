-- Un video por formato en cada ángulo (docs/spec-video-ugc.md §11): el UGC con persona y la mascota
-- animada del mismo ángulo conviven. Antes había un solo guion vigente por ángulo, y escribir en el otro
-- formato reemplazaba el anterior (y se borraban sus imágenes clave, clips y video final).

alter table public.video_scripts
  add column format text not null default 'ugc' check (format in ('ugc', 'mascot'));

-- Hasta ahora el formato vivía en input.format (sin él, UGC).
update public.video_scripts set format = 'mascot' where input->>'format' = 'mascot';

drop index public.video_scripts_active;
create unique index video_scripts_active on public.video_scripts (product_id, angle_slot, format) where superseded_at is null;
