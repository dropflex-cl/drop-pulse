-- Reutilizar un desarrollo de ángulo al volver a evaluar (lib/pipeline/angles.ts › confirmSelection):
-- huella de todo lo que leyó el agente (versión del prompt, mercado, ficha, cliente ideal, precio,
-- etiquetas, información base, ángulo, papel y compañero). Si la huella de la evaluación nueva es la
-- misma, el desarrollo se conserva en vez de pagar otro que saldría de lo mismo.
alter table public.angle_briefs add column input_key text;
