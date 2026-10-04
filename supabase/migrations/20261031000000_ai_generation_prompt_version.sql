-- La versión del prompt de cada llamada (docs/spec-prompts-simples.md §9): cada fase se mide antes y
-- después por paso y versión. Sin esto, la versión solo se deducía por la fecha del despliegue.
alter table public.ai_generations add column prompt_version integer;
create index ai_generations_step_version on public.ai_generations (step, prompt_version, created_at);
