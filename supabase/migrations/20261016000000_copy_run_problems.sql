-- Lo que el validador encontró en el último intento de una escritura fallida
-- (lib/copy/page-schema.ts › pageProblems). Para diagnosticar sin los logs del servidor.
alter table public.copy_runs add column problems jsonb;
