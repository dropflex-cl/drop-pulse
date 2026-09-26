-- Por qué se rechazó una respuesta del modelo (las reglas que no cumplió). Sin esto, una falla pagada
-- solo dice «invalid_concepts» y no se puede saber qué regla corregir (auditoría de costos de IA).
alter table public.ai_generations add column problems jsonb;
