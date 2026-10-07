-- Contracción del esquema: desplegar primero los lectores sin análisis legacy.
-- Exportar estas tablas/columnas antes de aplicar en producción: su contenido se elimina.
-- No CASCADE: una dependencia no auditada debe abortar, nunca borrar contenido operativo.
do $$
begin
  if exists(select 1 from public.pipeline_runs where status in ('queued','running'))
    or exists(select 1 from public.strategy_runs where status in ('queued','running'))
    or exists(select 1 from public.angle_rankings where status in ('queued','running'))
    or exists(select 1 from public.angle_briefs where generation in ('queued','running')) then
    raise exception 'Retired analysis jobs remain active; finish or reconcile them before cleanup';
  end if;
end $$;

-- Conservar generaciones/costos y etiquetas, retirando solo la relación al pipeline eliminado.
alter table public.ai_generations drop column run_id;
alter table public.pack_labels drop column run_id;
alter table public.products drop column product_data;

drop function public.activate_prompt_template(uuid);
drop table public.strategy_runs;
drop table public.prompt_templates;
drop table public.product_competitors;
drop table public.angle_briefs;
drop table public.angle_rankings;
drop table public.customer_avatars;
drop table public.product_briefs;
drop table public.pipeline_runs;

-- sales_angle y pipeline_run_status también tipan contenido/render conservados: no eliminarlos.
