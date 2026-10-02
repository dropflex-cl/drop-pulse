-- Revisión de imágenes con IA (Información base › «Revisar cada imagen con IA»): con true, cada imagen
-- generada (página, creativos e imágenes clave de video) pasa por un QA con Claude y, si falla, se
-- genera una vez más. Apagado por defecto: el QA es una llamada extra por imagen. Se lee al terminar
-- cada imagen, así que cambiarlo vale para lo que termine después.
alter table public.products add column image_qa boolean not null default false;
