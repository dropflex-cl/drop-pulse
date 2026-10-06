-- Audit evidence only. This file is not a migration and contains no mutations.
-- No credentials or production payloads. Revalidate permissions/volume before repeating.

-- 00-schema | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'session' as section, jsonb_build_object(
  'current_user',current_user,'transaction_read_only',current_setting('transaction_read_only'),
  'postgres_version',current_setting('server_version'),'captured_at',now()) as data
union all
select 'tables', coalesce(jsonb_agg(jsonb_build_object(
  'name',c.relname,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
  'kind',c.relkind) order by c.relname),'[]'::jsonb)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
union all
select 'columns', coalesce(jsonb_agg(jsonb_build_object(
  'table',table_name,'column',column_name,'type',data_type,'udt',udt_name,'nullable',is_nullable)
  order by table_name,ordinal_position),'[]'::jsonb)
from information_schema.columns where table_schema='public'
union all
select 'constraints', coalesce(jsonb_agg(jsonb_build_object(
  'table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,
  'definition',pg_catalog.pg_get_constraintdef(k.oid)) order by c.relname,k.conname),'[]'::jsonb)
from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
union all
select 'policies',coalesce(jsonb_agg(jsonb_build_object(
  'table',tablename,'name',policyname,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check)
  order by tablename,policyname),'[]'::jsonb)
from pg_catalog.pg_policies where schemaname in ('public','storage')
union all
select 'functions', coalesce(jsonb_agg(jsonb_build_object(
  'name',p.proname,'args',pg_catalog.pg_get_function_identity_arguments(p.oid),
  'security_definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile)
  order by p.proname),'[]'::jsonb)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public';


-- 01-counts | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'ad_campaigns' as table_name, count(*) as row_count from public."ad_campaigns"
union all
select 'ad_changes' as table_name, count(*) as row_count from public."ad_changes"
union all
select 'ad_decisions' as table_name, count(*) as row_count from public."ad_decisions"
union all
select 'ad_insights_daily' as table_name, count(*) as row_count from public."ad_insights_daily"
union all
select 'ad_insights_snapshots' as table_name, count(*) as row_count from public."ad_insights_snapshots"
union all
select 'ad_media' as table_name, count(*) as row_count from public."ad_media"
union all
select 'ad_sets' as table_name, count(*) as row_count from public."ad_sets"
union all
select 'ad_templates' as table_name, count(*) as row_count from public."ad_templates"
union all
select 'ads' as table_name, count(*) as row_count from public."ads"
union all
select 'ai_generations' as table_name, count(*) as row_count from public."ai_generations"
union all
select 'angle_briefs' as table_name, count(*) as row_count from public."angle_briefs"
union all
select 'angle_rankings' as table_name, count(*) as row_count from public."angle_rankings"
union all
select 'anthropic_connections' as table_name, count(*) as row_count from public."anthropic_connections"
union all
select 'catalog_items' as table_name, count(*) as row_count from public."catalog_items"
union all
select 'copy_runs' as table_name, count(*) as row_count from public."copy_runs"
union all
select 'creative_assets' as table_name, count(*) as row_count from public."creative_assets"
union all
select 'creative_concepts' as table_name, count(*) as row_count from public."creative_concepts"
union all
select 'creative_runs' as table_name, count(*) as row_count from public."creative_runs"
union all
select 'customer_avatars' as table_name, count(*) as row_count from public."customer_avatars"
union all
select 'data_deletion_requests' as table_name, count(*) as row_count from public."data_deletion_requests"
union all
select 'event_activations' as table_name, count(*) as row_count from public."event_activations"
union all
select 'event_copy' as table_name, count(*) as row_count from public."event_copy"
union all
select 'events' as table_name, count(*) as row_count from public."events"
union all
select 'gemini_connections' as table_name, count(*) as row_count from public."gemini_connections"
union all
select 'higgsfield_connections' as table_name, count(*) as row_count from public."higgsfield_connections"
union all
select 'image_provider_choices' as table_name, count(*) as row_count from public."image_provider_choices"
union all
select 'merchant_settings' as table_name, count(*) as row_count from public."merchant_settings"
union all
select 'meta_connections' as table_name, count(*) as row_count from public."meta_connections"
union all
select 'onboarding' as table_name, count(*) as row_count from public."onboarding"
union all
select 'pack_labels' as table_name, count(*) as row_count from public."pack_labels"
union all
select 'page_components' as table_name, count(*) as row_count from public."page_components"
union all
select 'page_image_runs' as table_name, count(*) as row_count from public."page_image_runs"
union all
select 'page_image_shots' as table_name, count(*) as row_count from public."page_image_shots"
union all
select 'page_images' as table_name, count(*) as row_count from public."page_images"
union all
select 'pipeline_runs' as table_name, count(*) as row_count from public."pipeline_runs"
union all
select 'product_briefs' as table_name, count(*) as row_count from public."product_briefs"
union all
select 'product_competitors' as table_name, count(*) as row_count from public."product_competitors"
union all
select 'product_pricing' as table_name, count(*) as row_count from public."product_pricing"
union all
select 'product_publications' as table_name, count(*) as row_count from public."product_publications"
union all
select 'product_reference_images' as table_name, count(*) as row_count from public."product_reference_images"
union all
select 'product_reviews' as table_name, count(*) as row_count from public."product_reviews"
union all
select 'products' as table_name, count(*) as row_count from public."products"
union all
select 'prompt_templates' as table_name, count(*) as row_count from public."prompt_templates"
union all
select 'review_imports' as table_name, count(*) as row_count from public."review_imports"
union all
select 'review_sources' as table_name, count(*) as row_count from public."review_sources"
union all
select 'shopify_connections' as table_name, count(*) as row_count from public."shopify_connections"
union all
select 'shopify_files' as table_name, count(*) as row_count from public."shopify_files"
union all
select 'shopify_theme_installations' as table_name, count(*) as row_count from public."shopify_theme_installations"
union all
select 'strategy_runs' as table_name, count(*) as row_count from public."strategy_runs"
union all
select 'video_scripts' as table_name, count(*) as row_count from public."video_scripts"
union all
select 'video_shots' as table_name, count(*) as row_count from public."video_shots"
union all
select 'webhook_events' as table_name, count(*) as row_count from public."webhook_events";


-- 02-migrations | SELECT-only diagnostics, executed via Supabase read-only endpoint
select version, name from supabase_migrations.schema_migrations order by version;


-- 03-fk-metadata | SELECT-only diagnostics, executed via Supabase read-only endpoint
select c.relname as child_table, k.conname,
       rn.nspname as parent_schema, rc.relname as parent_table,
       (select jsonb_agg(a.attname order by s.ord)
        from unnest(k.conkey) with ordinality s(num,ord)
        join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=s.num) as child_columns,
       (select jsonb_agg(a.attname order by s.ord)
        from unnest(k.confkey) with ordinality s(num,ord)
        join pg_catalog.pg_attribute a on a.attrelid=k.confrelid and a.attnum=s.num) as parent_columns,
       k.confdeltype as delete_action, k.convalidated as validated
from pg_catalog.pg_constraint k
join pg_catalog.pg_class c on c.oid=k.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
join pg_catalog.pg_class rc on rc.oid=k.confrelid
join pg_catalog.pg_namespace rn on rn.oid=rc.relnamespace
where n.nspname='public' and k.contype='f'
order by c.relname,k.conname;


-- 04-fk-integrity | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'ad_campaigns_product_id_fkey' as constraint_name, 'ad_campaigns' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_campaigns" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'ad_campaigns_source_campaign_id_fkey' as constraint_name, 'ad_campaigns' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."ad_campaigns" ch left join public."ad_campaigns" pa on ch."source_campaign_id"=pa."id" where ch."source_campaign_id" is not null
union all
select 'ad_campaigns_template_id_fkey' as constraint_name, 'ad_campaigns' as child_table, 'ad_templates' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_campaigns" ch left join public."ad_templates" pa on ch."template_id"=pa."id" where ch."template_id" is not null
union all
select 'ad_changes_campaign_id_fkey' as constraint_name, 'ad_changes' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_changes" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ad_changes_decision_id_fkey' as constraint_name, 'ad_changes' as child_table, 'ad_decisions' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_changes" ch left join public."ad_decisions" pa on ch."decision_id"=pa."id" where ch."decision_id" is not null
union all
select 'ad_decisions_campaign_id_fkey' as constraint_name, 'ad_decisions' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_decisions" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ad_insights_daily_campaign_id_fkey' as constraint_name, 'ad_insights_daily' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_insights_daily" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ad_insights_snapshots_campaign_id_fkey' as constraint_name, 'ad_insights_snapshots' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_insights_snapshots" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ad_media_product_id_fkey' as constraint_name, 'ad_media' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_media" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'ad_sets_campaign_id_fkey' as constraint_name, 'ad_sets' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ad_sets" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ads_adset_id_fkey' as constraint_name, 'ads' as child_table, 'ad_sets' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ads" ch left join public."ad_sets" pa on ch."adset_id"=pa."id" where ch."adset_id" is not null
union all
select 'ads_campaign_id_fkey' as constraint_name, 'ads' as child_table, 'ad_campaigns' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ads" ch left join public."ad_campaigns" pa on ch."campaign_id"=pa."id" where ch."campaign_id" is not null
union all
select 'ads_media_id_fkey' as constraint_name, 'ads' as child_table, 'ad_media' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ads" ch left join public."ad_media" pa on ch."media_id"=pa."id" where ch."media_id" is not null
union all
select 'ai_generations_product_id_fkey' as constraint_name, 'ai_generations' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."ai_generations" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'ai_generations_run_id_fkey' as constraint_name, 'ai_generations' as child_table, 'pipeline_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."ai_generations" ch left join public."pipeline_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'angle_briefs_product_id_fkey' as constraint_name, 'angle_briefs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."angle_briefs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'angle_briefs_ranking_id_fkey' as constraint_name, 'angle_briefs' as child_table, 'angle_rankings' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."angle_briefs" ch left join public."angle_rankings" pa on ch."ranking_id"=pa."id" where ch."ranking_id" is not null
union all
select 'angle_rankings_product_id_fkey' as constraint_name, 'angle_rankings' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."angle_rankings" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'copy_runs_product_id_fkey' as constraint_name, 'copy_runs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."copy_runs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'creative_assets_ad_media_id_fkey' as constraint_name, 'creative_assets' as child_table, 'ad_media' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."creative_assets" ch left join public."ad_media" pa on ch."ad_media_id"=pa."id" where ch."ad_media_id" is not null
union all
select 'creative_assets_concept_id_fkey' as constraint_name, 'creative_assets' as child_table, 'creative_concepts' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."creative_assets" ch left join public."creative_concepts" pa on ch."concept_id"=pa."id" where ch."concept_id" is not null
union all
select 'creative_assets_product_id_fkey' as constraint_name, 'creative_assets' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."creative_assets" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'creative_concepts_product_id_fkey' as constraint_name, 'creative_concepts' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."creative_concepts" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'creative_concepts_run_id_fkey' as constraint_name, 'creative_concepts' as child_table, 'creative_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."creative_concepts" ch left join public."creative_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'creative_runs_product_id_fkey' as constraint_name, 'creative_runs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."creative_runs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'customer_avatars_brief_id_fkey' as constraint_name, 'customer_avatars' as child_table, 'product_briefs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."customer_avatars" ch left join public."product_briefs" pa on ch."brief_id"=pa."id" where ch."brief_id" is not null
union all
select 'customer_avatars_product_id_fkey' as constraint_name, 'customer_avatars' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."customer_avatars" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'customer_avatars_run_id_fkey' as constraint_name, 'customer_avatars' as child_table, 'pipeline_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."customer_avatars" ch left join public."pipeline_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'event_activations_event_id_fkey' as constraint_name, 'event_activations' as child_table, 'events' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, null::bigint as owner_mismatch, null::bigint as cross_product from public."event_activations" ch left join public."events" pa on ch."event_id"=pa."id" where ch."event_id" is not null
union all
select 'event_activations_product_id_fkey' as constraint_name, 'event_activations' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."event_activations" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'event_copy_event_id_fkey' as constraint_name, 'event_copy' as child_table, 'events' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, null::bigint as owner_mismatch, null::bigint as cross_product from public."event_copy" ch left join public."events" pa on ch."event_id"=pa."id" where ch."event_id" is not null
union all
select 'event_copy_product_id_fkey' as constraint_name, 'event_copy' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."event_copy" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'pack_labels_product_id_fkey' as constraint_name, 'pack_labels' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."pack_labels" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'pack_labels_run_id_fkey' as constraint_name, 'pack_labels' as child_table, 'pipeline_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."pack_labels" ch left join public."pipeline_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'page_components_product_id_fkey' as constraint_name, 'page_components' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."page_components" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'page_components_run_id_fkey' as constraint_name, 'page_components' as child_table, 'copy_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."page_components" ch left join public."copy_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'page_image_runs_product_id_fkey' as constraint_name, 'page_image_runs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."page_image_runs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'page_image_shots_product_id_fkey' as constraint_name, 'page_image_shots' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."page_image_shots" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'page_image_shots_run_id_fkey' as constraint_name, 'page_image_shots' as child_table, 'page_image_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."page_image_shots" ch left join public."page_image_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'page_images_product_id_fkey' as constraint_name, 'page_images' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."page_images" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'page_images_reference_image_id_fkey' as constraint_name, 'page_images' as child_table, 'product_reference_images' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."page_images" ch left join public."product_reference_images" pa on ch."reference_image_id"=pa."id" where ch."reference_image_id" is not null
union all
select 'page_images_retry_of_fkey' as constraint_name, 'page_images' as child_table, 'page_images' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."page_images" ch left join public."page_images" pa on ch."retry_of"=pa."id" where ch."retry_of" is not null
union all
select 'page_images_shot_id_fkey' as constraint_name, 'page_images' as child_table, 'page_image_shots' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."page_images" ch left join public."page_image_shots" pa on ch."shot_id"=pa."id" where ch."shot_id" is not null
union all
select 'pipeline_runs_product_id_fkey' as constraint_name, 'pipeline_runs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."pipeline_runs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_briefs_product_id_fkey' as constraint_name, 'product_briefs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_briefs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_briefs_run_id_fkey' as constraint_name, 'product_briefs' as child_table, 'pipeline_runs' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."product_briefs" ch left join public."pipeline_runs" pa on ch."run_id"=pa."id" where ch."run_id" is not null
union all
select 'product_competitors_product_id_fkey' as constraint_name, 'product_competitors' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_competitors" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_pricing_product_id_fkey' as constraint_name, 'product_pricing' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_pricing" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_publications_product_id_fkey' as constraint_name, 'product_publications' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_publications" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_reference_images_product_id_fkey' as constraint_name, 'product_reference_images' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_reference_images" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_reviews_product_id_fkey' as constraint_name, 'product_reviews' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."product_reviews" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'product_reviews_source_id_fkey' as constraint_name, 'product_reviews' as child_table, 'review_sources' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."product_reviews" ch left join public."review_sources" pa on ch."source_id"=pa."id" where ch."source_id" is not null
union all
select 'review_imports_product_id_fkey' as constraint_name, 'review_imports' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."review_imports" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'review_imports_source_id_fkey' as constraint_name, 'review_imports' as child_table, 'review_sources' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."review_imports" ch left join public."review_sources" pa on ch."source_id"=pa."id" where ch."source_id" is not null
union all
select 'review_sources_product_id_fkey' as constraint_name, 'review_sources' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."review_sources" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'shopify_files_product_id_fkey' as constraint_name, 'shopify_files' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."shopify_files" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'strategy_runs_product_id_fkey' as constraint_name, 'strategy_runs' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."strategy_runs" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'strategy_runs_template_id_fkey' as constraint_name, 'strategy_runs' as child_table, 'prompt_templates' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, null::bigint as owner_mismatch, null::bigint as cross_product from public."strategy_runs" ch left join public."prompt_templates" pa on ch."template_id"=pa."id" where ch."template_id" is not null
union all
select 'video_scripts_ad_media_id_fkey' as constraint_name, 'video_scripts' as child_table, 'ad_media' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."video_scripts" ch left join public."ad_media" pa on ch."ad_media_id"=pa."id" where ch."ad_media_id" is not null
union all
select 'video_scripts_product_id_fkey' as constraint_name, 'video_scripts' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."video_scripts" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'video_shots_product_id_fkey' as constraint_name, 'video_shots' as child_table, 'products' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, null::bigint as cross_product from public."video_shots" ch left join public."products" pa on ch."product_id"=pa."id" where ch."product_id" is not null
union all
select 'video_shots_script_id_fkey' as constraint_name, 'video_shots' as child_table, 'video_scripts' as parent_table, count(*) as reference_rows, count(*) filter(where pa."id" is null) as orphan_count, count(*) filter(where pa."id" is not null and ch.user_id is distinct from pa.user_id) as owner_mismatch, count(*) filter(where pa."id" is not null and ch.product_id is distinct from pa.product_id) as cross_product from public."video_shots" ch left join public."video_scripts" pa on ch."script_id"=pa."id" where ch."script_id" is not null;


-- 05-formats | SELECT-only diagnostics, executed via Supabase read-only endpoint
with shapes as (
  select 'product_briefs'::text as entity, prompt_version as version, null::text as status,
    jsonb_typeof(payload) as payload_type,
    array(select jsonb_object_keys(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end) order by 1) as keys
  from public.product_briefs
  union all
  select 'customer_avatars', prompt_version, status::text, jsonb_typeof(payload),
    array(select jsonb_object_keys(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end) order by 1)
  from public.customer_avatars
  union all
  select 'angle_rankings', prompt_version,status::text,jsonb_typeof(payload),
    array(select jsonb_object_keys(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end) order by 1)
  from public.angle_rankings
  union all
  select 'angle_briefs',prompt_version,status::text,jsonb_typeof(payload),
    array(select jsonb_object_keys(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end) order by 1)
  from public.angle_briefs
  union all
  select 'strategy_runs',template_version,status::text,jsonb_typeof(extraction),
    array(select jsonb_object_keys(case when jsonb_typeof(extraction)='object' then extraction else '{}'::jsonb end) order by 1)
  from public.strategy_runs
)
select entity,version,status,payload_type,keys,count(*) as row_count
from shapes group by entity,version,status,payload_type,keys order by entity,version,status;


-- 06-coverage | SELECT-only diagnostics, executed via Supabase read-only endpoint
with products as (
  select *, row_number() over(order by created_at,id) as alias_number from public.products
)
select 'P'||lpad(p.alias_number::text,2,'0') as product_alias,
  p.is_upsell,p.currency,coalesce(p.product_data->>'description','')<>'' as identified,
  p.differentiator is not null as has_differentiator,p.differentiator_confirmed_at is not null as differentiator_confirmed,
  (select count(*) from public.product_pricing v where v.product_id=p.id) as pricing_rows,
  (select count(*) from public.product_briefs v where v.product_id=p.id) as brief_rows,
  (select count(*) from public.customer_avatars v where v.product_id=p.id) as avatar_rows,
  (select count(*) from public.customer_avatars v where v.product_id=p.id and v.status::text in ('approved','published')) as approved_avatars,
  (select count(*) from public.strategy_runs v where v.product_id=p.id) as strategy_runs,
  (select count(*) from public.strategy_runs v where v.product_id=p.id and v.confirmed_at is not null) as confirmed_strategy_runs,
  (select count(*) from public.angle_rankings v where v.product_id=p.id and v.confirmed_at is not null) as confirmed_rankings,
  (select count(*) from public.angle_briefs v where v.product_id=p.id and v.status::text in ('approved','published')) as approved_angle_briefs,
  (select count(*) from public.product_reviews v where v.product_id=p.id) as review_rows,
  (select count(*) from public.product_reviews v where v.product_id=p.id and v.status::text in ('approved','published')) as approved_reviews,
  (select count(*) from public.copy_runs v where v.product_id=p.id) as copy_runs,
  (select count(*) from public.page_components v where v.product_id=p.id and v.superseded_at is null) as current_components,
  (select count(*) from public.product_publications v where v.product_id=p.id and v.status::text='published') as published_rows,
  (select count(*) from public.product_competitors v where v.product_id=p.id) as competitor_rows
from products p order by p.alias_number;


-- 07-lifecycle | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'product_owner_count' as metric,count(distinct user_id)::bigint as value from public.products
union all
select 'confirmed_run_without_ranking',count(*) from public.strategy_runs r
where r.confirmed_at is not null and not exists(select 1 from public.angle_rankings a where a.product_id=r.product_id and a.input->>'strategy_run_id'=r.id::text)
union all
select 'unconfirmed_run_with_ranking',count(*) from public.strategy_runs r
where r.confirmed_at is null and exists(select 1 from public.angle_rankings a where a.product_id=r.product_id and a.input->>'strategy_run_id'=r.id::text)
union all
select 'strategy_run_multiple_rankings',count(*) from (
 select product_id,input->>'strategy_run_id' as strategy_run_id,count(*) as n from public.angle_rankings
 where input->>'strategy_run_id' is not null group by product_id,input->>'strategy_run_id' having count(*)>1
) v
union all
select 'rankings_unknown_strategy_run',count(*) from public.angle_rankings a
where a.input->>'strategy_run_id' is not null and not exists(select 1 from public.strategy_runs r where r.id::text=a.input->>'strategy_run_id' and r.product_id=a.product_id and r.user_id=a.user_id)
union all
select 'current_product_multiple_approved_avatars',count(*) from (
 select product_id,count(*) from public.customer_avatars where status::text in ('approved','published') group by product_id having count(*)>1
) v
union all
select 'duplicate_product_review_identity',count(*) from (
 select product_id,source,external_id,count(*) from public.product_reviews group by product_id,source,external_id having count(*)>1
) v
union all
select 'duplicate_shopify_product_identity',count(*) from (
 select user_id,shopify_product_id,count(*) from public.products group by user_id,shopify_product_id having count(*)>1
) v
union all
select 'base_image_multiple',count(*) from (
 select product_id,count(*) from public.product_reference_images where is_base group by product_id having count(*)>1
) v
union all
select 'base_image_excluded',count(*) from public.product_reference_images where is_base and excluded;


-- 08-details | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'strategy_run_outcomes' as section,coalesce(jsonb_agg(v),'[]'::jsonb) as data from (
  select status,current_step,error_code,template_version,confirmed_at is not null as confirmed,
    coalesce(length(report),0) as report_chars,jsonb_typeof(extraction) as extraction_type,
    round(extract(epoch from(finished_at-started_at))) as elapsed_seconds
  from public.strategy_runs
) v
union all
select 'reviews',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select status::text,status::text in('approved','published') as approved,count(*) as rows,
   count(*) filter(where coalesce(body_original,'')='') as empty_original,
   count(*) filter(where body_edited is not null) as edited,
   count(*) filter(where body_translated is not null) as translated,
   sum(case when jsonb_typeof(photos)='array' then jsonb_array_length(photos) else 0 end) as photo_items
 from public.product_reviews group by status
) v
union all
select 'pack_labels',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select status::text,count(*) as rows from public.pack_labels group by status
) v
union all
select 'competitors',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select status,source,jsonb_typeof(analysis) as analysis_type,count(*) as rows
 from public.product_competitors group by status,source,jsonb_typeof(analysis)
) v
union all
select 'brief_missingness',jsonb_build_object(
 'rows',count(*),'key_facts_total',sum(case when jsonb_typeof(payload->'key_facts')='array' then jsonb_array_length(payload->'key_facts') else 0 end),
 'proof_with_real_reviews',count(*) filter(where jsonb_typeof(payload#>'{proof,real_reviews}')='array' and payload#>'{proof,real_reviews}'<>'[]'::jsonb),
 'empty_inferred_fields',count(*) filter(where payload->'inferred_fields'='[]'::jsonb),
 'without_canonical_relation_ids',count(*) filter(where not(payload?'persona_id') and not(payload?'jtbd_ids') and not(payload?'pain_ids'))
) from public.product_briefs
union all
select 'ranking_formats',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select prompt_version,status,confirmed_at is not null as confirmed,
   jsonb_typeof(chosen_angles) as chosen_type,
   case when jsonb_typeof(chosen_angles)='array' then jsonb_array_length(chosen_angles) else 0 end as chosen_count,
   primary_angle is not null as has_legacy_primary,secondary_angle is not null as has_legacy_secondary,
   input->>'source' as input_source,count(*) as rows
 from public.angle_rankings group by prompt_version,status,confirmed_at is not null,jsonb_typeof(chosen_angles),
   case when jsonb_typeof(chosen_angles)='array' then jsonb_array_length(chosen_angles) else 0 end,
   primary_angle is not null,secondary_angle is not null,input->>'source'
) v
union all
select 'pdp_components',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select status::text,superseded_at is not null as superseded,count(*) as rows,
   count(*) filter(where enabled) as enabled_rows
 from public.page_components group by status,superseded_at is not null
) v
union all
select 'metrics_coverage',jsonb_build_object('daily_rows',count(*),'levels',array_agg(distinct level),
 'date_min',min(date),'date_max',max(date),'rows_with_purchases',count(*) filter(where purchases>0))
from public.ad_insights_daily;


-- 09-storage | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'buckets' as section,coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)
 order by id),'[]'::jsonb) as data from storage.buckets
union all
select 'object_counts',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select bucket_id,count(*) as rows from storage.objects group by bucket_id
) v;


-- 10-permissions | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'function_permissions' as section,coalesce(jsonb_agg(jsonb_build_object(
 'name',p.proname,'anon_execute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_role_execute',pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname),'[]'::jsonb) as data
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all
select 'public_relation_grants',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select grantee,privilege_type,count(*) as table_grants from information_schema.table_privileges
 where table_schema='public' and grantee in('anon','authenticated','service_role') group by grantee,privilege_type
) v
union all
select 'readonly_role',jsonb_build_object('bypassrls',rolbypassrls,'superuser',rolsuper)
from pg_catalog.pg_roles where rolname=current_user;


-- 11-storage-integrity | SELECT-only diagnostics, executed via Supabase read-only endpoint
with refs as (
  select 'product_reference_images'::text as entity,'product-references'::text as bucket_id,storage_path as path,user_id,product_id from public.product_reference_images where storage_path is not null
  union all
  select 'review_photos','product-references',photo->>'path',r.user_id,r.product_id
  from public.product_reviews r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.photos)='array' then r.photos else '[]'::jsonb end) photo
  where photo->>'path' is not null
  union all
  select 'ad_media','ad-media',storage_path,user_id,product_id from public.ad_media where storage_path is not null
  union all
  select 'creative_assets','creative-media',storage_path,user_id,product_id from public.creative_assets where storage_path is not null
  union all
  select 'video_shots','creative-media',storage_path,user_id,product_id from public.video_shots where storage_path is not null
  union all
  select 'video_scripts','creative-media',final_storage_path,user_id,product_id from public.video_scripts where final_storage_path is not null
  union all
  select 'page_images','page-media',storage_path,user_id,product_id from public.page_images where storage_path is not null
), diagnostics as (
  select 'references'::text as section,r.entity as entity,r.bucket_id,count(*) as rows,
    count(*) filter(where o.id is null) as missing_objects,
    count(*) filter(where split_part(r.path,'/',1) is distinct from r.user_id::text) as owner_prefix_mismatch,
    count(*) filter(where split_part(r.path,'/',2) is distinct from r.product_id::text) as product_prefix_mismatch
  from refs r left join storage.objects o on o.bucket_id=r.bucket_id and o.name=r.path
  group by r.entity,r.bucket_id
  union all
  select 'objects_without_asset_reference',null,o.bucket_id,count(*),null::bigint,null::bigint,null::bigint
  from storage.objects o where o.bucket_id in('product-references','ad-media','creative-media','page-media')
    and not exists(select 1 from refs r where r.bucket_id=o.bucket_id and r.path=o.name)
  group by o.bucket_id
  union all
  select 'objects_without_live_product_prefix',null,o.bucket_id,count(*),null::bigint,null::bigint,null::bigint
  from storage.objects o where o.bucket_id in('product-references','ad-media','creative-media','page-media')
    and not exists(select 1 from public.products p where p.user_id::text=split_part(o.name,'/',1) and p.id::text=split_part(o.name,'/',2))
  group by o.bucket_id
)
select * from diagnostics order by section,bucket_id,entity;


-- 12-auth-and-untyped-links | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'function_result_types' as section,coalesce(jsonb_agg(jsonb_build_object(
 'name',p.proname,'result',pg_catalog.pg_get_function_result(p.oid)) order by p.proname),'[]'::jsonb) as data
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all
select 'table_permission_counts',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select role_name,count(*) filter(where pg_catalog.has_table_privilege(role_name,c.oid,'SELECT')) as select_tables,
   count(*) filter(where pg_catalog.has_table_privilege(role_name,c.oid,'INSERT')) as insert_tables,
   count(*) filter(where pg_catalog.has_table_privilege(role_name,c.oid,'UPDATE')) as update_tables,
   count(*) filter(where pg_catalog.has_table_privilege(role_name,c.oid,'DELETE')) as delete_tables
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 cross join (values ('anon'),('authenticated'),('service_role')) roles(role_name)
 where n.nspname='public' and c.relkind in ('r','p') group by role_name
) v
union all
select 'daily_unit_links',jsonb_build_object('rows',count(*),'unresolved',count(*) filter(where
 (i.level='campaign' and not exists(select 1 from public.ad_campaigns c where c.id=i.unit_id and c.id=i.campaign_id and c.user_id=i.user_id)) or
 (i.level='adset' and not exists(select 1 from public.ad_sets s where s.id=i.unit_id and s.campaign_id=i.campaign_id and s.user_id=i.user_id)) or
 (i.level='ad' and not exists(select 1 from public.ads a where a.id=i.unit_id and a.campaign_id=i.campaign_id and a.user_id=i.user_id))
)) from public.ad_insights_daily i
union all
select 'snapshot_unit_links',jsonb_build_object('rows',count(*),'unresolved',count(*) filter(where
 (i.level='campaign' and not exists(select 1 from public.ad_campaigns c where c.id=i.unit_id and c.id=i.campaign_id and c.user_id=i.user_id)) or
 (i.level='adset' and not exists(select 1 from public.ad_sets s where s.id=i.unit_id and s.campaign_id=i.campaign_id and s.user_id=i.user_id)) or
 (i.level='ad' and not exists(select 1 from public.ads a where a.id=i.unit_id and a.campaign_id=i.campaign_id and a.user_id=i.user_id))
)) from public.ad_insights_snapshots i;


-- 14-schema-checks | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'product_briefs' as entity,'whole_schema' as field,prompt_version,count(*) as rows,count(*) filter(where not coalesce((jsonb_typeof(payload)='object' and (payload?'product_name' and (jsonb_typeof((payload->'product_name'))='string')) and (payload?'category' and (jsonb_typeof((payload->'category'))='string')) and (payload?'what_it_does' and (jsonb_typeof((payload->'what_it_does'))='string')) and (payload?'problem_solved' and (jsonb_typeof((payload->'problem_solved'))='string')) and (payload?'how_it_works' and ((jsonb_typeof((payload->'how_it_works'))='string') or (jsonb_typeof((payload->'how_it_works'))='null'))) and (payload?'key_facts' and (jsonb_typeof((payload->'key_facts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'key_facts'))='array' then (payload->'key_facts') else '[]'::jsonb end) e1(value) where not coalesce((jsonb_typeof(e1.value)='object' and (e1.value?'label' and (jsonb_typeof((e1.value->'label'))='string')) and (e1.value?'value' and (jsonb_typeof((e1.value->'value'))='string'))),false)))) and (payload?'target_audience' and (jsonb_typeof((payload->'target_audience'))='object' and ((payload->'target_audience')?'age_range' and ((jsonb_typeof(((payload->'target_audience')->'age_range'))='string') or (jsonb_typeof(((payload->'target_audience')->'age_range'))='null'))) and ((payload->'target_audience')?'gender' and ((jsonb_typeof(((payload->'target_audience')->'gender'))='string' and ((payload->'target_audience')->'gender') in ('"female"'::jsonb,'"male"'::jsonb,'"any"'::jsonb)) or (jsonb_typeof(((payload->'target_audience')->'gender'))='null'))) and ((payload->'target_audience')?'life_stage_or_role' and ((jsonb_typeof(((payload->'target_audience')->'life_stage_or_role'))='string') or (jsonb_typeof(((payload->'target_audience')->'life_stage_or_role'))='null'))) and ((payload->'target_audience')?'where_they_feel_it' and ((jsonb_typeof(((payload->'target_audience')->'where_they_feel_it'))='string') or (jsonb_typeof(((payload->'target_audience')->'where_they_feel_it'))='null'))))) and (payload?'alternatives_already_tried' and (jsonb_typeof((payload->'alternatives_already_tried'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'alternatives_already_tried'))='array' then (payload->'alternatives_already_tried') else '[]'::jsonb end) e2(value) where not coalesce((jsonb_typeof(e2.value)='string'),false)))) and (payload?'differentiator' and ((jsonb_typeof((payload->'differentiator'))='object' and ((payload->'differentiator')?'versus' and (jsonb_typeof(((payload->'differentiator')->'versus'))='string')) and ((payload->'differentiator')?'claim' and (jsonb_typeof(((payload->'differentiator')->'claim'))='string')) and ((payload->'differentiator')?'basis' and (jsonb_typeof(((payload->'differentiator')->'basis'))='string'))) or (jsonb_typeof((payload->'differentiator'))='null'))) and (payload?'price' and ((jsonb_typeof((payload->'price'))='number') or (jsonb_typeof((payload->'price'))='null'))) and (payload?'unit_cost' and ((jsonb_typeof((payload->'unit_cost'))='number') or (jsonb_typeof((payload->'unit_cost'))='null'))) and (payload?'bundle_options' and (jsonb_typeof((payload->'bundle_options'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'bundle_options'))='array' then (payload->'bundle_options') else '[]'::jsonb end) e3(value) where not coalesce((jsonb_typeof(e3.value)='string'),false)))) and (payload?'real_deadline_or_event' and ((jsonb_typeof((payload->'real_deadline_or_event'))='string') or (jsonb_typeof((payload->'real_deadline_or_event'))='null'))) and (payload?'proof' and (jsonb_typeof((payload->'proof'))='object' and ((payload->'proof')?'real_reviews' and (jsonb_typeof(((payload->'proof')->'real_reviews'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(((payload->'proof')->'real_reviews'))='array' then ((payload->'proof')->'real_reviews') else '[]'::jsonb end) e4(value) where not coalesce((jsonb_typeof(e4.value)='string'),false)))) and ((payload->'proof')?'real_expert' and ((jsonb_typeof(((payload->'proof')->'real_expert'))='string') or (jsonb_typeof(((payload->'proof')->'real_expert'))='null'))) and ((payload->'proof')?'studies_or_certifications' and (jsonb_typeof(((payload->'proof')->'studies_or_certifications'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(((payload->'proof')->'studies_or_certifications'))='array' then ((payload->'proof')->'studies_or_certifications') else '[]'::jsonb end) e5(value) where not coalesce((jsonb_typeof(e5.value)='string'),false)))) and ((payload->'proof')?'units_sold_or_social_proof' and ((jsonb_typeof(((payload->'proof')->'units_sold_or_social_proof'))='string') or (jsonb_typeof(((payload->'proof')->'units_sold_or_social_proof'))='null'))) and ((payload->'proof')?'guarantee_days' and ((case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then trunc((((payload->'proof')->'guarantee_days')#>>'{}')::numeric)=(((payload->'proof')->'guarantee_days')#>>'{}')::numeric else false end and case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then (((payload->'proof')->'guarantee_days')#>>'{}')::numeric>=-9007199254740991 else false end and case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then (((payload->'proof')->'guarantee_days')#>>'{}')::numeric<=9007199254740991 else false end) or (jsonb_typeof(((payload->'proof')->'guarantee_days'))='null'))))) and (payload?'images' and (jsonb_typeof((payload->'images'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'images'))='array' then (payload->'images') else '[]'::jsonb end) e6(value) where not coalesce((jsonb_typeof(e6.value)='object' and (e6.value?'image_id' and (jsonb_typeof((e6.value->'image_id'))='string')) and (e6.value?'shows' and (jsonb_typeof((e6.value->'shows'))='string')) and (e6.value?'usable_for_ads' and (jsonb_typeof((e6.value->'usable_for_ads'))='boolean')) and (e6.value?'issues' and (jsonb_typeof((e6.value->'issues'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((e6.value->'issues'))='array' then (e6.value->'issues') else '[]'::jsonb end) e7(value) where not coalesce((jsonb_typeof(e7.value)='string'),false))))),false)))) and (payload?'known_objections' and (jsonb_typeof((payload->'known_objections'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'known_objections'))='array' then (payload->'known_objections') else '[]'::jsonb end) e8(value) where not coalesce((jsonb_typeof(e8.value)='string'),false)))) and (payload?'forbidden_claims' and (jsonb_typeof((payload->'forbidden_claims'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'forbidden_claims'))='array' then (payload->'forbidden_claims') else '[]'::jsonb end) e9(value) where not coalesce((jsonb_typeof(e9.value)='string'),false)))) and (payload?'inferred_fields' and (jsonb_typeof((payload->'inferred_fields'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'inferred_fields'))='array' then (payload->'inferred_fields') else '[]'::jsonb end) e10(value) where not coalesce((jsonb_typeof(e10.value)='string'),false)))) and (payload?'missing_inputs' and (jsonb_typeof((payload->'missing_inputs'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'missing_inputs'))='array' then (payload->'missing_inputs') else '[]'::jsonb end) e11(value) where not coalesce((jsonb_typeof(e11.value)='object' and (e11.value?'field' and (jsonb_typeof((e11.value->'field'))='string')) and (e11.value?'question' and (jsonb_typeof((e11.value->'question'))='string'))),false))))),false)) as incompatible from public.product_briefs group by prompt_version
union all
select 'product_briefs','product_name',prompt_version,count(*),count(*) filter(where not coalesce((payload?'product_name' and (jsonb_typeof((payload->'product_name'))='string')),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','category',prompt_version,count(*),count(*) filter(where not coalesce((payload?'category' and (jsonb_typeof((payload->'category'))='string')),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','what_it_does',prompt_version,count(*),count(*) filter(where not coalesce((payload?'what_it_does' and (jsonb_typeof((payload->'what_it_does'))='string')),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','problem_solved',prompt_version,count(*),count(*) filter(where not coalesce((payload?'problem_solved' and (jsonb_typeof((payload->'problem_solved'))='string')),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','how_it_works',prompt_version,count(*),count(*) filter(where not coalesce((payload?'how_it_works' and ((jsonb_typeof((payload->'how_it_works'))='string') or (jsonb_typeof((payload->'how_it_works'))='null'))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','key_facts',prompt_version,count(*),count(*) filter(where not coalesce((payload?'key_facts' and (jsonb_typeof((payload->'key_facts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'key_facts'))='array' then (payload->'key_facts') else '[]'::jsonb end) e12(value) where not coalesce((jsonb_typeof(e12.value)='object' and (e12.value?'label' and (jsonb_typeof((e12.value->'label'))='string')) and (e12.value?'value' and (jsonb_typeof((e12.value->'value'))='string'))),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','target_audience',prompt_version,count(*),count(*) filter(where not coalesce((payload?'target_audience' and (jsonb_typeof((payload->'target_audience'))='object' and ((payload->'target_audience')?'age_range' and ((jsonb_typeof(((payload->'target_audience')->'age_range'))='string') or (jsonb_typeof(((payload->'target_audience')->'age_range'))='null'))) and ((payload->'target_audience')?'gender' and ((jsonb_typeof(((payload->'target_audience')->'gender'))='string' and ((payload->'target_audience')->'gender') in ('"female"'::jsonb,'"male"'::jsonb,'"any"'::jsonb)) or (jsonb_typeof(((payload->'target_audience')->'gender'))='null'))) and ((payload->'target_audience')?'life_stage_or_role' and ((jsonb_typeof(((payload->'target_audience')->'life_stage_or_role'))='string') or (jsonb_typeof(((payload->'target_audience')->'life_stage_or_role'))='null'))) and ((payload->'target_audience')?'where_they_feel_it' and ((jsonb_typeof(((payload->'target_audience')->'where_they_feel_it'))='string') or (jsonb_typeof(((payload->'target_audience')->'where_they_feel_it'))='null'))))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','alternatives_already_tried',prompt_version,count(*),count(*) filter(where not coalesce((payload?'alternatives_already_tried' and (jsonb_typeof((payload->'alternatives_already_tried'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'alternatives_already_tried'))='array' then (payload->'alternatives_already_tried') else '[]'::jsonb end) e13(value) where not coalesce((jsonb_typeof(e13.value)='string'),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','differentiator',prompt_version,count(*),count(*) filter(where not coalesce((payload?'differentiator' and ((jsonb_typeof((payload->'differentiator'))='object' and ((payload->'differentiator')?'versus' and (jsonb_typeof(((payload->'differentiator')->'versus'))='string')) and ((payload->'differentiator')?'claim' and (jsonb_typeof(((payload->'differentiator')->'claim'))='string')) and ((payload->'differentiator')?'basis' and (jsonb_typeof(((payload->'differentiator')->'basis'))='string'))) or (jsonb_typeof((payload->'differentiator'))='null'))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','price',prompt_version,count(*),count(*) filter(where not coalesce((payload?'price' and ((jsonb_typeof((payload->'price'))='number') or (jsonb_typeof((payload->'price'))='null'))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','unit_cost',prompt_version,count(*),count(*) filter(where not coalesce((payload?'unit_cost' and ((jsonb_typeof((payload->'unit_cost'))='number') or (jsonb_typeof((payload->'unit_cost'))='null'))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','bundle_options',prompt_version,count(*),count(*) filter(where not coalesce((payload?'bundle_options' and (jsonb_typeof((payload->'bundle_options'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'bundle_options'))='array' then (payload->'bundle_options') else '[]'::jsonb end) e14(value) where not coalesce((jsonb_typeof(e14.value)='string'),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','real_deadline_or_event',prompt_version,count(*),count(*) filter(where not coalesce((payload?'real_deadline_or_event' and ((jsonb_typeof((payload->'real_deadline_or_event'))='string') or (jsonb_typeof((payload->'real_deadline_or_event'))='null'))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','proof',prompt_version,count(*),count(*) filter(where not coalesce((payload?'proof' and (jsonb_typeof((payload->'proof'))='object' and ((payload->'proof')?'real_reviews' and (jsonb_typeof(((payload->'proof')->'real_reviews'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(((payload->'proof')->'real_reviews'))='array' then ((payload->'proof')->'real_reviews') else '[]'::jsonb end) e15(value) where not coalesce((jsonb_typeof(e15.value)='string'),false)))) and ((payload->'proof')?'real_expert' and ((jsonb_typeof(((payload->'proof')->'real_expert'))='string') or (jsonb_typeof(((payload->'proof')->'real_expert'))='null'))) and ((payload->'proof')?'studies_or_certifications' and (jsonb_typeof(((payload->'proof')->'studies_or_certifications'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(((payload->'proof')->'studies_or_certifications'))='array' then ((payload->'proof')->'studies_or_certifications') else '[]'::jsonb end) e16(value) where not coalesce((jsonb_typeof(e16.value)='string'),false)))) and ((payload->'proof')?'units_sold_or_social_proof' and ((jsonb_typeof(((payload->'proof')->'units_sold_or_social_proof'))='string') or (jsonb_typeof(((payload->'proof')->'units_sold_or_social_proof'))='null'))) and ((payload->'proof')?'guarantee_days' and ((case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then trunc((((payload->'proof')->'guarantee_days')#>>'{}')::numeric)=(((payload->'proof')->'guarantee_days')#>>'{}')::numeric else false end and case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then (((payload->'proof')->'guarantee_days')#>>'{}')::numeric>=-9007199254740991 else false end and case when jsonb_typeof(((payload->'proof')->'guarantee_days'))='number' then (((payload->'proof')->'guarantee_days')#>>'{}')::numeric<=9007199254740991 else false end) or (jsonb_typeof(((payload->'proof')->'guarantee_days'))='null'))))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','images',prompt_version,count(*),count(*) filter(where not coalesce((payload?'images' and (jsonb_typeof((payload->'images'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'images'))='array' then (payload->'images') else '[]'::jsonb end) e17(value) where not coalesce((jsonb_typeof(e17.value)='object' and (e17.value?'image_id' and (jsonb_typeof((e17.value->'image_id'))='string')) and (e17.value?'shows' and (jsonb_typeof((e17.value->'shows'))='string')) and (e17.value?'usable_for_ads' and (jsonb_typeof((e17.value->'usable_for_ads'))='boolean')) and (e17.value?'issues' and (jsonb_typeof((e17.value->'issues'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((e17.value->'issues'))='array' then (e17.value->'issues') else '[]'::jsonb end) e18(value) where not coalesce((jsonb_typeof(e18.value)='string'),false))))),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','known_objections',prompt_version,count(*),count(*) filter(where not coalesce((payload?'known_objections' and (jsonb_typeof((payload->'known_objections'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'known_objections'))='array' then (payload->'known_objections') else '[]'::jsonb end) e19(value) where not coalesce((jsonb_typeof(e19.value)='string'),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','forbidden_claims',prompt_version,count(*),count(*) filter(where not coalesce((payload?'forbidden_claims' and (jsonb_typeof((payload->'forbidden_claims'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'forbidden_claims'))='array' then (payload->'forbidden_claims') else '[]'::jsonb end) e20(value) where not coalesce((jsonb_typeof(e20.value)='string'),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','inferred_fields',prompt_version,count(*),count(*) filter(where not coalesce((payload?'inferred_fields' and (jsonb_typeof((payload->'inferred_fields'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'inferred_fields'))='array' then (payload->'inferred_fields') else '[]'::jsonb end) e21(value) where not coalesce((jsonb_typeof(e21.value)='string'),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'product_briefs','missing_inputs',prompt_version,count(*),count(*) filter(where not coalesce((payload?'missing_inputs' and (jsonb_typeof((payload->'missing_inputs'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'missing_inputs'))='array' then (payload->'missing_inputs') else '[]'::jsonb end) e22(value) where not coalesce((jsonb_typeof(e22.value)='object' and (e22.value?'field' and (jsonb_typeof((e22.value->'field'))='string')) and (e22.value?'question' and (jsonb_typeof((e22.value->'question'))='string'))),false)))),false)) from public.product_briefs group by prompt_version
union all
select 'customer_avatars' as entity,'whole_schema' as field,prompt_version,count(*) as rows,count(*) filter(where not coalesce((jsonb_typeof(payload)='object' and (payload?'summary' and (jsonb_typeof((payload->'summary'))='string')) and (payload?'buyer' and (jsonb_typeof((payload->'buyer'))='string')) and (payload?'user' and (jsonb_typeof((payload->'user'))='string')) and (payload?'age_range' and (jsonb_typeof((payload->'age_range'))='string')) and (payload?'why_buy' and (jsonb_typeof((payload->'why_buy'))='string')) and (payload?'doubts' and (jsonb_typeof((payload->'doubts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'doubts'))='array' then (payload->'doubts') else '[]'::jsonb end) e23(value) where not coalesce((jsonb_typeof(e23.value)='string'),false)))) and (payload?'cash_on_delivery' and (jsonb_typeof((payload->'cash_on_delivery'))='string')) and (payload?'more_than_one' and (jsonb_typeof((payload->'more_than_one'))='string'))),false)) as incompatible from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','summary',prompt_version,count(*),count(*) filter(where not coalesce((payload?'summary' and (jsonb_typeof((payload->'summary'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','buyer',prompt_version,count(*),count(*) filter(where not coalesce((payload?'buyer' and (jsonb_typeof((payload->'buyer'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','user',prompt_version,count(*),count(*) filter(where not coalesce((payload?'user' and (jsonb_typeof((payload->'user'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','age_range',prompt_version,count(*),count(*) filter(where not coalesce((payload?'age_range' and (jsonb_typeof((payload->'age_range'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','why_buy',prompt_version,count(*),count(*) filter(where not coalesce((payload?'why_buy' and (jsonb_typeof((payload->'why_buy'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','doubts',prompt_version,count(*),count(*) filter(where not coalesce((payload?'doubts' and (jsonb_typeof((payload->'doubts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'doubts'))='array' then (payload->'doubts') else '[]'::jsonb end) e24(value) where not coalesce((jsonb_typeof(e24.value)='string'),false)))),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','cash_on_delivery',prompt_version,count(*),count(*) filter(where not coalesce((payload?'cash_on_delivery' and (jsonb_typeof((payload->'cash_on_delivery'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'customer_avatars','more_than_one',prompt_version,count(*),count(*) filter(where not coalesce((payload?'more_than_one' and (jsonb_typeof((payload->'more_than_one'))='string')),false)) from public.customer_avatars group by prompt_version
union all
select 'angle_briefs' as entity,'whole_schema' as field,prompt_version,count(*) as rows,count(*) filter(where not coalesce((jsonb_typeof(payload)='object' and (payload?'psychological_lever' and (jsonb_typeof((payload->'psychological_lever'))='string')) and (payload?'core_message' and (jsonb_typeof((payload->'core_message'))='string')) and (payload?'aida_summary' and (jsonb_typeof((payload->'aida_summary'))='object' and ((payload->'aida_summary')?'attention' and (jsonb_typeof(((payload->'aida_summary')->'attention'))='string')) and ((payload->'aida_summary')?'interest' and (jsonb_typeof(((payload->'aida_summary')->'interest'))='string')) and ((payload->'aida_summary')?'desire' and (jsonb_typeof(((payload->'aida_summary')->'desire'))='string')) and ((payload->'aida_summary')?'action' and (jsonb_typeof(((payload->'aida_summary')->'action'))='string')))) and (payload?'body_beats' and (jsonb_typeof((payload->'body_beats'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'body_beats'))='array' then (payload->'body_beats') else '[]'::jsonb end) e25(value) where not coalesce((jsonb_typeof(e25.value)='string'),false)))) and (payload?'proof_to_show' and (jsonb_typeof((payload->'proof_to_show'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'proof_to_show'))='array' then (payload->'proof_to_show') else '[]'::jsonb end) e26(value) where not coalesce((jsonb_typeof(e26.value)='string'),false)))) and (payload?'objection_handling' and (jsonb_typeof((payload->'objection_handling'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'objection_handling'))='array' then (payload->'objection_handling') else '[]'::jsonb end) e27(value) where not coalesce((jsonb_typeof(e27.value)='object' and (e27.value?'objection' and (jsonb_typeof((e27.value->'objection'))='string')) and (e27.value?'answer' and (jsonb_typeof((e27.value->'answer'))='string'))),false)))) and (payload?'offer_layer' and (jsonb_typeof((payload->'offer_layer'))='string')) and (payload?'visual_concepts' and (jsonb_typeof((payload->'visual_concepts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'visual_concepts'))='array' then (payload->'visual_concepts') else '[]'::jsonb end) e28(value) where not coalesce((jsonb_typeof(e28.value)='string'),false)))) and (payload?'static_ad_concepts' and (jsonb_typeof((payload->'static_ad_concepts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'static_ad_concepts'))='array' then (payload->'static_ad_concepts') else '[]'::jsonb end) e29(value) where not coalesce((jsonb_typeof(e29.value)='string'),false)))) and (payload?'page_block' and (jsonb_typeof((payload->'page_block'))='string')) and (payload?'compliance_flags' and (jsonb_typeof((payload->'compliance_flags'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'compliance_flags'))='array' then (payload->'compliance_flags') else '[]'::jsonb end) e30(value) where not coalesce((jsonb_typeof(e30.value)='string'),false)))) and (payload?'missing_inputs' and (jsonb_typeof((payload->'missing_inputs'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'missing_inputs'))='array' then (payload->'missing_inputs') else '[]'::jsonb end) e31(value) where not coalesce((jsonb_typeof(e31.value)='string'),false)))) and (payload?'handoff_to_ugc' and (jsonb_typeof((payload->'handoff_to_ugc'))='string')) and (payload?'details' and (jsonb_typeof((payload->'details'))='object'))),false)) as incompatible from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','psychological_lever',prompt_version,count(*),count(*) filter(where not coalesce((payload?'psychological_lever' and (jsonb_typeof((payload->'psychological_lever'))='string')),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','core_message',prompt_version,count(*),count(*) filter(where not coalesce((payload?'core_message' and (jsonb_typeof((payload->'core_message'))='string')),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','aida_summary',prompt_version,count(*),count(*) filter(where not coalesce((payload?'aida_summary' and (jsonb_typeof((payload->'aida_summary'))='object' and ((payload->'aida_summary')?'attention' and (jsonb_typeof(((payload->'aida_summary')->'attention'))='string')) and ((payload->'aida_summary')?'interest' and (jsonb_typeof(((payload->'aida_summary')->'interest'))='string')) and ((payload->'aida_summary')?'desire' and (jsonb_typeof(((payload->'aida_summary')->'desire'))='string')) and ((payload->'aida_summary')?'action' and (jsonb_typeof(((payload->'aida_summary')->'action'))='string')))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','body_beats',prompt_version,count(*),count(*) filter(where not coalesce((payload?'body_beats' and (jsonb_typeof((payload->'body_beats'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'body_beats'))='array' then (payload->'body_beats') else '[]'::jsonb end) e32(value) where not coalesce((jsonb_typeof(e32.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','proof_to_show',prompt_version,count(*),count(*) filter(where not coalesce((payload?'proof_to_show' and (jsonb_typeof((payload->'proof_to_show'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'proof_to_show'))='array' then (payload->'proof_to_show') else '[]'::jsonb end) e33(value) where not coalesce((jsonb_typeof(e33.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','objection_handling',prompt_version,count(*),count(*) filter(where not coalesce((payload?'objection_handling' and (jsonb_typeof((payload->'objection_handling'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'objection_handling'))='array' then (payload->'objection_handling') else '[]'::jsonb end) e34(value) where not coalesce((jsonb_typeof(e34.value)='object' and (e34.value?'objection' and (jsonb_typeof((e34.value->'objection'))='string')) and (e34.value?'answer' and (jsonb_typeof((e34.value->'answer'))='string'))),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','offer_layer',prompt_version,count(*),count(*) filter(where not coalesce((payload?'offer_layer' and (jsonb_typeof((payload->'offer_layer'))='string')),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','visual_concepts',prompt_version,count(*),count(*) filter(where not coalesce((payload?'visual_concepts' and (jsonb_typeof((payload->'visual_concepts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'visual_concepts'))='array' then (payload->'visual_concepts') else '[]'::jsonb end) e35(value) where not coalesce((jsonb_typeof(e35.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','static_ad_concepts',prompt_version,count(*),count(*) filter(where not coalesce((payload?'static_ad_concepts' and (jsonb_typeof((payload->'static_ad_concepts'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'static_ad_concepts'))='array' then (payload->'static_ad_concepts') else '[]'::jsonb end) e36(value) where not coalesce((jsonb_typeof(e36.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','page_block',prompt_version,count(*),count(*) filter(where not coalesce((payload?'page_block' and (jsonb_typeof((payload->'page_block'))='string')),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','compliance_flags',prompt_version,count(*),count(*) filter(where not coalesce((payload?'compliance_flags' and (jsonb_typeof((payload->'compliance_flags'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'compliance_flags'))='array' then (payload->'compliance_flags') else '[]'::jsonb end) e37(value) where not coalesce((jsonb_typeof(e37.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','missing_inputs',prompt_version,count(*),count(*) filter(where not coalesce((payload?'missing_inputs' and (jsonb_typeof((payload->'missing_inputs'))='array' and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof((payload->'missing_inputs'))='array' then (payload->'missing_inputs') else '[]'::jsonb end) e38(value) where not coalesce((jsonb_typeof(e38.value)='string'),false)))),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','handoff_to_ugc',prompt_version,count(*),count(*) filter(where not coalesce((payload?'handoff_to_ugc' and (jsonb_typeof((payload->'handoff_to_ugc'))='string')),false)) from public.angle_briefs group by prompt_version
union all
select 'angle_briefs','details',prompt_version,count(*),count(*) filter(where not coalesce((payload?'details' and (jsonb_typeof((payload->'details'))='object')),false)) from public.angle_briefs group by prompt_version;


-- 15-final-checks | SELECT-only diagnostics, executed via Supabase read-only endpoint
select 'approved_review_text' as section,jsonb_build_object(
 'rows',count(*),
 'empty_original',count(*) filter(where btrim(coalesce(body_original,''))=''),
 'empty_effective_text',count(*) filter(where btrim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,''))=''),
 'empty_original_with_photos',count(*) filter(where btrim(coalesce(body_original,''))='' and jsonb_typeof(photos)='array' and photos<>'[]'::jsonb)) as data
from public.product_reviews where status::text in('approved','published')
union all
select 'legacy_avatar_adapter_preconditions',jsonb_build_object('rows',count(*),
 'invalid_summary',count(*) filter(where payload?'summary' and jsonb_typeof(payload->'summary') not in('string','null')),
 'invalid_demographics',count(*) filter(where payload?'demographics' and jsonb_typeof(payload->'demographics') not in('object','null')),
 'invalid_objections',count(*) filter(where payload?'objections' and jsonb_typeof(payload->'objections') not in('object','null')),
 'invalid_trim_fields',count(*) filter(where exists(select 1 from (values
   (payload#>'{demographics,age_range}'),(payload#>'{emotions,core_motivation}'),(payload#>'{problems,main_problem}'),
   (payload#>'{objections,main_objection}'),(payload#>'{objections,critical_question}'),(payload#>'{objections,cash_on_delivery_concerns}')
 ) f(value) where f.value is not null and jsonb_typeof(f.value) not in('string','null'))))
from public.customer_avatars where prompt_version=4
union all
select 'metrics_freshness',jsonb_build_object(
 'daily_max_date',(select max(date) from public.ad_insights_daily),
 'daily_last_updated',(select max(updated_at) from public.ad_insights_daily),
 'snapshot_max_date',max(date),'last_snapshot',max(captured_at),'rows',count(*))
from public.ad_insights_snapshots
union all
select 'snapshot_shape',coalesce(jsonb_agg(v),'[]'::jsonb) from (
 select jsonb_typeof(today) as today_type,jsonb_typeof(lifetime) as lifetime_type,count(*) as rows
 from public.ad_insights_snapshots group by jsonb_typeof(today),jsonb_typeof(lifetime)
) v
union all
select 'final_recount',jsonb_build_object(
 'products',(select count(*) from public.products),
 'product_briefs',(select count(*) from public.product_briefs),
 'customer_avatars',(select count(*) from public.customer_avatars),
 'angle_rankings',(select count(*) from public.angle_rankings),
 'angle_briefs',(select count(*) from public.angle_briefs),
 'strategy_runs',(select count(*) from public.strategy_runs),
 'storage_objects',(select count(*) from storage.objects));
