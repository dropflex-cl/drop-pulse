/** Migra una fixture del esquema anterior dentro de una transacción que se revierte. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const local = process.env.PI_LOCAL_TEST === "1" ? describe : describe.skip;
local("retirada de revisión de imágenes · migración", () => {
  it("elimina campos/RPC antiguos y conserva archivos, decisiones, costos y trabajos vigentes", () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    const gallery = readFileSync("supabase/migrations/20261113000000_product_intelligence_gallery_operations.sql", "utf8");
    const enqueue = gallery.slice(gallery.indexOf("create function public.pi_enqueue_gallery_generation"), gallery.indexOf("create function public.pi_claim_gallery_image"));
    const ugc = readFileSync("supabase/migrations/20261108000000_product_intelligence_ugc.sql", "utf8");
    const stamp = ugc.slice(ugc.indexOf("create function public.pi_ugc_context_stamp"), ugc.indexOf("create function public.pi_ugc_state")).replace("create function", "create or replace function");
    const claim = readFileSync("supabase/migrations/20261114000000_gallery_claim_snapshot.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20261216000000_retire_image_qa.sql", "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    const sql = `begin;
      alter table public.products add column image_qa boolean not null default false;
      alter table public.pi_gallery_operations add column qa_enabled boolean not null default false;
      alter table public.page_images add column qa jsonb, add column baked_texts jsonb default '[]', add column retry_of uuid, add column attempt smallint default 1;
      alter table public.creative_assets add column qa jsonb, add column baked_texts jsonb default '[]', add column attempt smallint default 1;
      alter table public.video_shots add column qa jsonb;
      drop function public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean);
      ${enqueue} ${stamp} ${claim}
      create temporary table review_retirement_fixture(id uuid, previous_stamp text, image jsonb, discarded_image jsonb);
      do $$ declare owner_id uuid:=gen_random_uuid(); product_id uuid; base_id uuid; image_id uuid; discarded_id uuid; operation_id uuid; old_stamp text; enabled boolean;
      begin
        insert into auth.users(id,email) values(owner_id,owner_id::text||'@example.test');
        foreach enabled in array array[false,true] loop
          product_id:=gen_random_uuid(); base_id:=gen_random_uuid(); image_id:=gen_random_uuid();
          insert into public.products(id,user_id,shopify_product_id,title,image_qa) values(product_id,owner_id,product_id::text,'Fixture de retiro',enabled);
          insert into public.product_intelligence(product_id,user_id) values(product_id,owner_id);
          insert into public.product_reference_images(id,product_id,user_id,source,url,is_base) values(base_id,product_id,owner_id,'shopify','https://example.test/base.webp',true);
          old_stamp:=public.pi_ugc_context_stamp(product_id);
          insert into public.pi_gallery_operations(product_id,user_id,access,context_stamp,base_reference_id,estimated_usd,qa_enabled)
            values(product_id,owner_id,'{}',old_stamp,base_id,1,enabled) returning id into operation_id;
          insert into public.page_image_runs(product_id,user_id,status,input) values(product_id,owner_id,'succeeded',jsonb_build_object('generation_stamp',old_stamp));
          insert into public.page_image_runs(product_id,user_id,status,input) values(product_id,owner_id,'succeeded','{"generation_stamp":"obsolete"}');
          insert into public.page_images(id,product_id,user_id,slot,source,storage_path,status,qa,pi_operation_id)
            values(image_id,product_id,owner_id,'gallery','upload',owner_id::text||'/'||product_id::text||'/selected.webp','approved','{"pass":true}',operation_id);
          insert into public.ai_generations(user_id,product_id,step,model,status,cost_usd) values(owner_id,product_id,'page_qa','historical','succeeded',0.03);
          discarded_id:=gen_random_uuid();
          insert into public.page_images(id,product_id,user_id,slot,source,storage_path,status,qa)
            values(discarded_id,product_id,owner_id,'gallery','upload',owner_id::text||'/'||product_id::text||'/discarded.webp','rejected','{"pass":false}');
          insert into review_retirement_fixture values(product_id,old_stamp,
            (select to_jsonb(i)-'qa'-'baked_texts'-'retry_of'-'attempt' from public.page_images i where id=image_id),
            (select to_jsonb(i)-'qa'-'baked_texts'-'retry_of'-'attempt' from public.page_images i where id=discarded_id));
        end loop;
      end $$;
      ${migration}
      do $$ begin
        if exists(select 1 from information_schema.columns where table_schema='public' and
          ((table_name='products' and column_name='image_qa') or (table_name='pi_gallery_operations' and column_name='qa_enabled') or
          (table_name in ('page_images','creative_assets','video_shots') and column_name='qa') or
          (table_name in ('page_images','creative_assets') and column_name='baked_texts') or (table_name='page_images' and column_name='retry_of') or (table_name in ('page_images','creative_assets') and column_name='attempt'))) then raise exception 'Campos QA persistentes'; end if;
        if to_regprocedure('public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean,boolean)') is not null then raise exception 'RPC QA persistente'; end if;
        if not has_function_privilege('service_role','public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean)','EXECUTE') or
          has_function_privilege('anon','public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean)','EXECUTE') or
          has_function_privilege('authenticated','public.pi_enqueue_gallery_generation(jsonb,uuid,bigint,text,text,text,text,text,jsonb,numeric,boolean)','EXECUTE') then raise exception 'Permisos de RPC incorrectos'; end if;
        if exists(select 1 from review_retirement_fixture f join public.page_images i on i.product_id=f.id where i.id=(f.image->>'id')::uuid and to_jsonb(i)<>f.image) then raise exception 'Cambió imagen o decisión'; end if;
        if exists(select 1 from review_retirement_fixture f join public.page_images i on i.id=(f.discarded_image->>'id')::uuid where to_jsonb(i)<>f.discarded_image) then raise exception 'Cambió descarte'; end if;
        if (select sum(cost_usd) from public.ai_generations where product_id in(select id from review_retirement_fixture))<>0.06 then raise exception 'Cambió historial de costos'; end if;
        if exists(select 1 from public.pi_gallery_operations o join review_retirement_fixture f on f.id=o.product_id where o.context_stamp<>public.pi_ugc_context_stamp(f.id) or o.status<>'queued') then raise exception 'Trabajo vigente invalidado'; end if;
        if (select count(*) from public.page_image_runs r join review_retirement_fixture f on f.id=r.product_id where r.input->>'generation_stamp'=public.pi_ugc_context_stamp(f.id))<>2 then raise exception 'Input vigente invalidado'; end if;
        if (select count(*) from public.page_image_runs r join review_retirement_fixture f on f.id=r.product_id where r.input->>'generation_stamp'='obsolete')<>2 then raise exception 'Input obsoleto recuperado'; end if;
      end $$;
      rollback;`;
    const result = execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", timeout: 20000 });
    expect(result).toContain("ROLLBACK");
  }, 25000);
});
