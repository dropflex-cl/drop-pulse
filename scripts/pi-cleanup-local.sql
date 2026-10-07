-- Solo PostgreSQL local de ensayo; crea fixtures y revierte toda la transacción.
-- Ejecutar antes de migration up: node --import tsx scripts/pi-cleanup-local.ts
begin;
create temp table cleanup_fixture as select gen_random_uuid() owner_id, gen_random_uuid() product_id, gen_random_uuid() pipeline_id, gen_random_uuid() copy_id;
insert into auth.users(id,email) select owner_id,owner_id::text||'@cleanup.example.test' from cleanup_fixture;
insert into public.products(id,user_id,shopify_product_id,title,product_data) select product_id,owner_id,product_id::text,'Cleanup fixture','{"name":"old","description":"legacy analysis"}' from cleanup_fixture;
insert into public.pipeline_runs(id,user_id,product_id,status) select pipeline_id,owner_id,product_id,'succeeded' from cleanup_fixture;
insert into public.ai_generations(user_id,product_id,run_id,step,provider,model,status,cost_usd) select owner_id,product_id,pipeline_id,'product_data','anthropic','historical-model','succeeded',0.25 from cleanup_fixture;
insert into public.pack_labels(user_id,product_id,run_id,payload,prices,prompt_version,model) select owner_id,product_id,pipeline_id,'[]','[]',1,'historical-model' from cleanup_fixture;
insert into public.copy_runs(id,user_id,product_id,status,input) select copy_id,owner_id,product_id,'succeeded','{"avatar_id":"historical","briefs":[]}' from cleanup_fixture;
insert into public.page_components(user_id,product_id,run_id,component,position,proposal) select owner_id,product_id,copy_id,'listing',0,'{"short_name":"Conserved"}' from cleanup_fixture;
set constraints all immediate;
create temp table cleanup_before(table_name text primary key, fingerprint text);
do $$
declare t text; fingerprint text;
begin
 foreach t in array array['products','ai_generations','pack_labels','copy_runs','page_components','ad_media','creative_runs','creative_concepts','creative_assets','page_image_runs','page_image_shots','page_images','video_scripts','video_shots','ad_campaigns','product_intelligence','pi_product_inputs','pi_revisions','pi_audit_events','pi_idempotency_records'] loop
   execute format($query$select md5(coalesce(string_agg((to_jsonb(t)-'run_id'-'product_data')::text,'' order by (to_jsonb(t)-'run_id'-'product_data')::text),'')) from public.%I t$query$,t) into fingerprint;
   insert into cleanup_before values(t,fingerprint);
 end loop;
end $$;
\ir ../supabase/migrations/20261118000000_retire_legacy_analysis.sql

do $$
declare t record; fingerprint text;
begin
 for t in select * from cleanup_before loop
   execute format($query$select md5(coalesce(string_agg((to_jsonb(t)-'run_id'-'product_data')::text,'' order by (to_jsonb(t)-'run_id'-'product_data')::text),'')) from public.%I t$query$,t.table_name) into fingerprint;
   if fingerprint is distinct from t.fingerprint then raise exception 'Changed retained data in %',t.table_name; end if;
 end loop;
 if (select count(*) from information_schema.tables where table_schema='public' and table_name in ('pipeline_runs','product_briefs','customer_avatars','angle_rankings','angle_briefs','strategy_runs','prompt_templates','product_competitors')) <> 0 then raise exception 'Retired table remains'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and ((table_name='products' and column_name='product_data') or (table_name in ('ai_generations','pack_labels') and column_name='run_id'))) then raise exception 'Retired column remains'; end if;
 if not exists(select 1 from public.products p,cleanup_fixture f where p.id=f.product_id and public.pi_operational_snapshot(p.id) is not null) then raise exception 'Snapshot unavailable'; end if;
end $$;
select '20 retained table fingerprints match; 8 tables and 3 columns removed; operational snapshot works' as checks;
rollback;
