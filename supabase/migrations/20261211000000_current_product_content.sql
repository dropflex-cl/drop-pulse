-- Contenido vigente y decisiones explícitas. Sin restaurar descartes ni versiones antiguas.
-- Mantiene los nombres y estados antiguos como compatibilidad durante el despliegue.
begin;
alter table public.page_images add column if not exists is_selected boolean not null default false;
alter table public.page_images add column if not exists discarded_at timestamptz;
-- BACKFILL CURRENT DECISIONS BEGIN
-- Las imágenes proyectadas desde bindings mantienen su guard: solo este backfill autorizado
-- escribe las nuevas decisiones sin modificar archivos, destinos ni selecciones anteriores.
select set_config('pi.visual_projection','true',true);
update public.page_images set is_selected=(status='approved'), discarded_at=case when status='rejected' then coalesce(decided_at,updated_at) end;
update public.pi_visual_records set payload=payload||jsonb_build_object('selected',status='selected')
 where kind='binding' and not (payload ? 'selected');
select set_config('pi.visual_projection','false',true);
-- BACKFILL CURRENT DECISIONS END
-- Clientes anteriores siguen escribiendo status; los nuevos usan la decisión explícita.
create or replace function public.pi_image_use_compat() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status='approved' then new.is_selected:=true; end if;
  if new.status='rejected' then new.discarded_at:=coalesce(new.discarded_at,clock_timestamp()); new.is_selected:=false; end if;
 elsif new.status is distinct from old.status then
  new.is_selected:=new.status='approved';
  new.discarded_at:=case when new.status='rejected' then clock_timestamp() else null end;
 elsif new.is_selected is distinct from old.is_selected then
  if new.discarded_at is not null and new.is_selected then raise exception 'PI_VALIDATION_ERROR'; end if;
  new.status:=case when new.is_selected then 'approved'::public.content_status else 'generated'::public.content_status end;
 end if;
 return new;
end $$;
drop trigger if exists pi_image_use_compat on public.page_images;
create trigger pi_image_use_compat before insert or update on public.page_images for each row execute function public.pi_image_use_compat();
-- La estrategia seleccionada es editable; pi_revisions/pi_audit_events conservan el historial.
drop trigger if exists pi_immutable_strategy on public.pi_strategy_versions;
create trigger pi_immutable_strategy before delete on public.pi_strategy_versions for each row execute function public.pi_immutable_context_history();
create or replace function public.pi_guard_current_strategy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('pi.explicit_context_commit',true) is distinct from 'true' then raise exception 'Escribe mediante la RPC autorizada' using errcode='42501'; end if;
 if (new.id,new.product_id,new.user_id,new.created_by) is distinct from (old.id,old.product_id,old.user_id,old.created_by) then raise exception 'PI_INVALID_REFERENCE'; end if;
 return new;
end $$;
drop trigger if exists pi_guard_current_strategy on public.pi_strategy_versions;
create trigger pi_guard_current_strategy before update on public.pi_strategy_versions for each row execute function public.pi_guard_current_strategy();
revoke all on function public.pi_guard_current_strategy() from public,anon,authenticated,service_role;


-- Omitir imágenes al editar una variante conserva su selección; [] la vacía explícitamente.
create or replace function public.pi_preserve_variant_media(p_current jsonb,p_next jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_next)='array' then (
  select coalesce(jsonb_agg(case when not (v.value ? 'images') and old.value ? 'images'
    then v.value||jsonb_build_object('images',old.value->'images') else v.value end order by v.ordinality),'[]'::jsonb)
  from jsonb_array_elements(p_next) with ordinality v
  left join lateral (select value from jsonb_array_elements(case when jsonb_typeof(p_current)='array' then p_current else '[]'::jsonb end)
    where value->>'key'=v.value->>'key' limit 1) old on true
 ) else p_next end
$$;
revoke all on function public.pi_preserve_variant_media(jsonb,jsonb) from public,anon,authenticated;

-- pi_commit_landing_legacy
CREATE OR REPLACE FUNCTION public.pi_commit_landing_legacy(p_access jsonb, p_product_id uuid, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_entries jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 automatic boolean; run_id uuid; request_id uuid:=gen_random_uuid(); part jsonb; existing public.page_components; component_id uuid; items jsonb:='[]'::jsonb;
 ids text[]:=array['listing','review-stars','benefit-usps','inventory','shipping-timeline','benefit-double-box','gif-strip','review-slider','ugc-slider','scrolling-benefits','pain-block','image-with-benefits','mechanism','use-cases','before-after','stats-with-image','results-timeline','usage-steps','product-includes','insta-story','customer-stories','review-wall','expert-endorsement','comparison-table','guarantee','faq-and-text','offer-summary'];
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=true; -- El guardado MCP aprueba; no habilita publish_product.
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 -- Bloquear reseñas y contenido durante la validación final. Mutaciones de página se serializan con el producto.
 perform 1 from public.product_reviews where product_id=p_product_id and user_id=owner_id for share;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_etag is distinct from public.pi_snapshot_hash(state->'rows') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if jsonb_array_length(state->'active_runs')>0 then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 27
   or octet_length(p_entries::text)>262144 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not (e->>'component'=any(ids)) or jsonb_typeof(e->'content') not in ('object','array') or (e ? 'enabled' and jsonb_typeof(e->'enabled')<>'boolean'))
   or (select count(distinct e->>'component') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   run_id:=gen_random_uuid();
   insert into public.copy_runs(id,product_id,user_id,status,input,payload,started_at,finished_at)
     values(run_id,p_product_id,owner_id,'succeeded',jsonb_build_object('source','mcp_chat','contract_version','1.1','before',state->'rows','analysis_revision',rev,
       'actor_id',p_access->>'actor_id','snapshot',snap),jsonb_build_object('entries',p_entries),now(),now());
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
   perform public.pi_validate_landing_variants(part->'content',p_product_id,owner_id);
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   if not p_dry_run then
     if existing.id is not null then
       component_id:=existing.id;
       update public.page_components set proposal=public.pi_preserve_variant_media(coalesce(existing.content,existing.proposal),part->'content'),content=public.pi_preserve_variant_media(coalesce(existing.content,existing.proposal),part->'content'),
         status=case when existing.status='rejected' and part->>'enabled' is distinct from 'true' then 'rejected'::public.content_status else 'approved'::public.content_status end,
         enabled=case when part ? 'enabled' then (part->>'enabled')::boolean else existing.enabled end,
         updated_at=clock_timestamp() where id=existing.id;
     else
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,content,enabled,images,status,decided_at)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',existing.content,coalesce((part->>'enabled')::boolean,true),coalesce(existing.images,'[]'::jsonb),case when existing.status='rejected' then 'rejected'::public.content_status else 'approved'::public.content_status end,case when automatic then clock_timestamp() else null end);
     end if;
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status',case when existing.status='rejected' and part->>'enabled' is distinct from 'true' then 'rejected' else 'approved' end));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action',case when automatic then 'Contenido guardado y disponible. Publicar es una acción aparte.' else 'Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $function$;

-- pi_commit_landing
CREATE OR REPLACE FUNCTION public.pi_commit_landing(p_access jsonb, p_product_id uuid, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_entries jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; part jsonb; meta jsonb; plan public.pi_persuasion_plans; experience public.pi_landing_experiences;
 section jsonb; committed_result jsonb; receipt public.pi_idempotency_records;
 protected record; previous jsonb; incoming jsonb; current_row public.page_components;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content' and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
  meta:=part->'metadata';
  if meta is null then continue; end if;
  if not (select pdp_persuasion_enabled from public.products where id=p_product_id) then raise exception 'PI_VALIDATION_ERROR'; end if;
  select * into plan from public.pi_persuasion_plans where id=(meta->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or plan.angle_id::text is distinct from meta->>'angle_id' or plan.landing_angle_id is distinct from meta->>'landing_angle_id' then raise exception 'PI_INVALID_REFERENCE'; end if;
  if meta ? 'experience_id' then
   select * into experience from public.pi_landing_experiences where id=(meta->>'experience_id')::uuid and product_id=p_product_id and user_id=owner_id;
   if not found or experience.persuasion_plan_id<>plan.id or experience.landing_hook_id is distinct from meta->>'landing_hook_id' then raise exception 'PI_INVALID_REFERENCE'; end if;
  end if;
 end loop;
 committed_result:=public.pi_commit_landing_legacy(p_access,p_product_id,p_expected_revision,p_etag,p_stamp,p_key,p_hash,p_entries,p_dry_run);
 if p_dry_run then return committed_result; end if;
 for part in select value from jsonb_array_elements(p_entries) where value ? 'metadata' loop
  update public.page_components set pdp_metadata=part->'metadata' where product_id=p_product_id and user_id=owner_id and superseded_at is null and component=part->>'component';
 end loop;
 committed_result:=jsonb_set(committed_result,'{data,landing_etag}',to_jsonb(public.pi_snapshot_hash(public.pi_landing_state(p_product_id,owner_id)->'rows')));
 update public.pi_idempotency_records set result=committed_result where product_id=p_product_id and user_id=owner_id and tool='save_landing_content' and idempotency_key=p_key;
 return committed_result;
end $function$;

-- pi_load_landing
CREATE OR REPLACE FUNCTION public.pi_load_landing(p_access jsonb, p_product_id uuid, p_key text DEFAULT NULL::text, p_hash text DEFAULT NULL::text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; scope text;
begin
 scope:=case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if p_key is not null and not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_landing_content'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return jsonb_build_object('replay',receipt.result);
   end if;
 end if;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 return (state-'active_runs')||jsonb_build_object('snapshot',snap,'revision',rev,
   'context_stale',false,
   'landing_etag',public.pi_snapshot_hash(state->'rows'),'stamp',public.pi_snapshot_hash(jsonb_build_array(state,snap)));
end $function$;

-- pi_commit_knowledge
CREATE OR REPLACE FUNCTION public.pi_commit_knowledge(p_access jsonb, p_product_id uuid, p_expected_revision bigint, p_stamp text, p_tool text, p_key text, p_hash text, p_graph jsonb, p_notes text, p_reviewed_ids jsonb, p_strategy jsonb, p_archive jsonb, p_result jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; rev bigint; next_rev bigint; before_snap jsonb; after_snap jsonb; previous jsonb;
  changed boolean; sensitive boolean:=false; receipt public.pi_idempotency_records; scopes text[]:=array['product_intelligence:write'];
  old_active uuid; new_id uuid; scope text; r jsonb; k text; dependency jsonb;
begin
  owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
  if p_tool not in ('save_research','save_product_analysis','patch_product_analysis','set_product_strategy') then raise exception 'PI_VALIDATION_ERROR'; end if;
  perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  perform public.pi_authorize_context(p_access,'product_intelligence:write');
  if not p_dry_run then
    select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      foreach scope in array receipt.required_scopes loop perform public.pi_authorize_context(p_access,scope); end loop;
      return receipt.result;
    end if;
  end if;
  rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
  before_snap:=public.pi_context_snapshot(p_product_id); previous:=before_snap->'knowledge'->'graph';
  if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(before_snap) then raise exception 'PI_REVISION_CONFLICT'; end if;
  if p_result->>'ok' is distinct from 'true' or p_result->>'product_id' is distinct from p_product_id::text
    or (p_result->'data'->>'dry_run')::boolean is distinct from p_dry_run or octet_length(p_result::text)>60000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  changed:=not (p_result->'data'->>'no_op')::boolean; next_rev:=rev+case when changed and not p_dry_run then 1 else 0 end;
  if (p_result->>'revision')::bigint is distinct from next_rev or (p_result->'data'->>'applied')::boolean is distinct from (changed and not p_dry_run) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_tool<>'set_product_strategy' then
    if p_strategy is not null or p_archive is not null or (p_result->'data'->>'base_revision')::bigint is distinct from rev then raise exception 'PI_VALIDATION_ERROR'; end if;
    sensitive:=public.pi_validate_knowledge(p_access,p_product_id,previous,p_graph,rev,p_reviewed_ids);
    if changed is distinct from (p_graph is distinct from previous or p_notes is distinct from before_snap->'knowledge'->>'methodological_notes') then raise exception 'PI_VALIDATION_ERROR'; end if;
    if sensitive then scopes:=array_append(scopes,'product_intelligence:verify'); end if;
    if p_tool='save_research' then
      foreach k in array array['persona','jtbd','pain','desire','objection','angle','customer_language','offer'] loop
        if p_graph->k is distinct from previous->k then raise exception 'PI_VALIDATION_ERROR'; end if;
      end loop;
      if p_notes is distinct from before_snap->'knowledge'->>'methodological_notes' then raise exception 'PI_VALIDATION_ERROR'; end if;
    else
      foreach k in array array['Source','Fact','EvidenceLink'] loop
        if p_graph->k is distinct from previous->k then raise exception 'PI_VALIDATION_ERROR'; end if;
      end loop;
    end if;
  else
    if p_graph is not null or (p_strategy is not null and p_archive is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
    if p_strategy is not null then
      if (p_strategy->>'analysis_revision')::bigint is distinct from rev or p_strategy->>'state' not in ('draft','selected') then raise exception 'PI_REVISION_CONFLICT'; end if;
      -- Cada copia congelada corresponde exactamente a una entidad actual de este producto.
      for k,dependency in select key,value from jsonb_each(p_strategy->'snapshot') loop
        if k='persona' then r:=jsonb_build_array(dependency); k:='persona';
        elsif k='jtbd' then r:=jsonb_build_array(dependency); k:='jtbd';
        elsif k='pain' then r:=jsonb_build_array(dependency); k:='pain';
        elsif k='offer' then if dependency='null'::jsonb then continue; end if; r:=jsonb_build_array(dependency); k:='offer';
        elsif k='related_jtbd' then r:=dependency; k:='jtbd';
        elsif k='related_pains' then r:=dependency; k:='pain';
        elsif k='desires' then r:=dependency; k:='desire';
        elsif k='angles' then r:=dependency; k:='angle';
        elsif k='facts' then r:=dependency; k:='Fact';
        elsif k='sources' then r:=dependency; k:='Source';
        elsif k='evidence_links' then r:=dependency; k:='EvidenceLink';
        elsif k='objections' then r:=dependency; k:='objection';
        elsif k='customer_language' then r:=dependency; k:='customer_language'; else continue; end if;
        if exists(select 1 from jsonb_array_elements(r) d where not exists(select 1 from jsonb_array_elements(previous->k) n where n=d and coalesce(n->>'lifecycle','active')='active')) then raise exception 'PI_INVALID_REFERENCE'; end if;
      end loop;
    elsif p_archive is not null then
      if not exists(select 1 from public.pi_strategy_versions where id=(p_archive->>'id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_NOT_FOUND'; end if;
    elsif changed then raise exception 'PI_VALIDATION_ERROR'; end if;
  end if;
  if p_dry_run then return p_result; end if;
  insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(p_product_id,owner_id,rev,before_snap,public.pi_snapshot_hash(before_snap),p_access->>'actor_id') on conflict do nothing;
  perform set_config('pi.explicit_context_commit','true',true);
  if changed then
    if p_tool<>'set_product_strategy' then
      perform public.pi_write_knowledge(p_product_id,owner_id,p_graph,p_access->>'actor_id');
      -- Huella de la revisión incluye el contenido y todas las fuentes/enlaces relevantes.
      for r in select value from jsonb_array_elements(p_graph->'Fact') where value->>'id' in (select jsonb_array_elements_text(p_reviewed_ids)) loop
        if r->>'verification_status'='unverified' and r->>'usage_status'='pending' then
          update public.pi_facts set verification_hash=null,verified_by=null,verified_at=null where id=(r->>'id')::uuid and product_id=p_product_id and user_id=owner_id; continue;
        end if;
        update public.pi_facts set verification_hash=public.pi_snapshot_hash(jsonb_build_object('fact',r,
          'links',(select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id'),
          'sources',(select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_graph->'Source') where value->>'id' in
            (select value->>'source_id' from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id')))),
          verified_by=case when r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' then p_access->>'actor_id' else null end,
          verified_at=case when r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' then now() else null end where id=(r->>'id')::uuid and product_id=p_product_id and user_id=owner_id;
      end loop;
      update public.product_intelligence set methodological_notes=p_notes where product_id=p_product_id;
    else
      select active_strategy_id into old_active from public.product_intelligence where product_id=p_product_id;
      if p_strategy is not null then
        new_id:=(p_strategy->>'id')::uuid;
        insert into public.pi_strategy_versions(id,product_id,user_id,analysis_revision,snapshot,operational_hash,created_by)
          values(new_id,p_product_id,owner_id,rev,p_strategy->'snapshot',p_strategy->>'operational_hash',p_access->>'actor_id')
          on conflict(id) do update set analysis_revision=excluded.analysis_revision,snapshot=excluded.snapshot,operational_hash=excluded.operational_hash;
        insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
          values(new_id,p_product_id,owner_id,p_strategy->>'state',p_strategy->'snapshot'->>'rationale',next_rev,p_access->>'actor_id');
        if p_strategy->>'state'='selected' then
          if old_active is not null and old_active<>new_id then
            insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
              values(old_active,p_product_id,owner_id,'superseded','Selección reemplazada',next_rev,p_access->>'actor_id');
          end if;
          update public.product_intelligence set active_strategy_id=new_id where product_id=p_product_id;
        end if;
      else
        new_id:=(p_archive->>'id')::uuid;
        insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
          values(new_id,p_product_id,owner_id,'archived',p_archive->>'reason',next_rev,p_access->>'actor_id');
        if old_active=new_id then update public.product_intelligence set active_strategy_id=null where product_id=p_product_id; end if;
      end if;
    end if;
    after_snap:=public.pi_context_snapshot(p_product_id);
    update public.product_intelligence set revision=next_rev,updated_at=now() where product_id=p_product_id;
    insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
      values(p_product_id,owner_id,next_rev,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
    insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
      values(p_product_id,owner_id,(p_result->>'request_id')::uuid,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,next_rev,
        coalesce(p_result->'data'->'diff',jsonb_build_array(jsonb_build_object('entity','strategy','action',case when p_archive is null then 'select' else 'archive' end,'id',new_id))));
  end if;
  delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and
    (expires_at<=now() or (tool=p_tool and idempotency_key=p_key));
  insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
    values(p_product_id,owner_id,p_tool,p_key,p_hash,scopes,p_result,next_rev,(p_result->>'request_id')::uuid);
  return p_result;
end $function$;

-- pi_validate_visual_record_batch
CREATE OR REPLACE FUNCTION public.pi_validate_visual_record_batch(p_access jsonb, p_product_id uuid, p_record jsonb, p_batch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare owner_id uuid:=(p_access->>'user_id')::uuid; visual_payload jsonb:=p_record->'payload'; kind text:=p_record->>'kind'; ref jsonb; row public.pi_visual_records;
begin
 if kind not in ('identity','plan','iteration','asset','binding','review') or jsonb_typeof(visual_payload) is distinct from 'object' or octet_length(visual_payload::text)>120000 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if kind='identity' then
  if not exists(select 1 from public.product_reference_images where id=(visual_payload->>'canonical_reference_image_id')::uuid and product_id=p_product_id and user_id=owner_id and not excluded) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if (select id from public.product_reference_images where product_id=p_product_id and user_id=owner_id and not excluded order by is_base desc,is_cover desc,position,id limit 1) is distinct from (visual_payload->>'canonical_reference_image_id')::uuid then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif kind='plan' then
  if not exists(select 1 from public.pi_strategy_versions where id=(visual_payload->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  for ref in select value from jsonb_array_elements(visual_payload->'shots') loop
   if ref->>'angle_id' is not null and not exists(select 1 from public.pi_angles where id=(ref->>'angle_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if ref->'persuasion_plan_ref'->>'id' is not null and not exists(select 1 from public.pi_persuasion_plans where id=(ref->'persuasion_plan_ref'->>'id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
  if jsonb_array_length(visual_payload->'shots') not between 1 and 30 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='asset' then
   if not exists(select 1 from public.pi_visual_files where id=(visual_payload->>'file_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if visual_payload->>'representation'='real_evidence' and visual_payload->>'source_system'<>'manual' then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='binding' then
  -- Quitar un uso obsoleto es válido aunque su destino ya esté deshabilitado.
  if p_record->>'status'='archived' or (p_record->>'status'='proposed' and exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.status='selected')) then
   if not exists(select 1 from public.pi_visual_records r where r.id=(p_record->>'id')::uuid and r.product_id=p_product_id and r.user_id=owner_id and r.kind='binding'
    and r.payload->'target'=visual_payload->'target' and r.payload->>'asset_id'=visual_payload->>'asset_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
  else perform public.pi_visual_validate_target(p_product_id,owner_id,visual_payload->'target'); end if;
  select * into row from public.pi_visual_records where id=(visual_payload->>'asset_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset';
  if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_record->>'status'='selected' and (row.status in ('rejected','archived') or row.payload->>'archived_at' is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif kind='review' then
  if not exists(select 1 from public.pi_visual_records where id=(visual_payload->>'subject_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 for ref in select visual_payload->'identity_ref' union all select visual_payload->'plan_ref' loop
  if ref is not null and ref<>'null'::jsonb and not exists(select 1 from public.pi_visual_records where id=(ref->>'id')::uuid and product_id=p_product_id and user_id=owner_id and kind=case when ref=visual_payload->'identity_ref' then 'identity' else 'plan' end)
   and not exists(select 1 from jsonb_array_elements(p_batch) b where b->>'id'=ref->>'id'
    and b->>'kind'=case when ref=visual_payload->'identity_ref' then 'identity' else 'plan' end)
   then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(coalesce(visual_payload->'reference_asset_ids','[]'::jsonb)) loop
  if not exists(select 1 from public.pi_visual_records where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id and kind='asset') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
end $function$;

-- pi_visual_validate_target
CREATE OR REPLACE FUNCTION public.pi_visual_validate_target(p_product_id uuid, p_owner uuid, t jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if t->>'type'='gallery_shot' then
  if t->>'slot' not in ('cover','gallery') and not exists(select 1 from public.page_image_shots where product_id=p_product_id and user_id=p_owner and slot=t->>'slot' and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if t->>'slot'='gallery' and (t->>'position')::int not between 1 and 12 then raise exception 'PI_VALIDATION_ERROR'; end if;
 elsif t->>'type'='landing_section' then
  if not exists(select 1 from public.pi_landing_experiences e,jsonb_array_elements(e.payload->'sections') s where e.id=(t->>'experience_id')::uuid and e.product_id=p_product_id and e.user_id=p_owner and e.status<>'archived'
    and s->>'section_key'=t->>'section_key' and s->>'component'=t->>'component' and s->>'content_variant_key'=t->>'content_variant_key') then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='creative_concept' then
  if not exists(select 1 from public.creative_concepts where id=(t->>'concept_id')::uuid and product_id=p_product_id and user_id=p_owner and superseded_at is null) then raise exception 'PI_INVALID_REFERENCE'; end if;
 elsif t->>'type'='ugc_shot' then
  if not exists(select 1 from public.video_shots v join public.video_scripts s on s.id=v.script_id where v.id=(t->>'video_shot_id')::uuid and v.script_id=(t->>'script_id')::uuid and v.product_id=p_product_id and v.user_id=p_owner
    and v.superseded_at is null and s.superseded_at is null and ((t->>'slot'='keyframe' and v.kind='keyframe') or (t->>'slot'='b_roll' and v.kind='b_roll'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
 else raise exception 'PI_INVALID_REFERENCE'; end if;
end $function$;

-- Una asignación explícita de experiencia actualiza las selecciones del mismo componente vigente.
create or replace function public.pi_apply_experience_media(p_product_id uuid,p_owner_id uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare section jsonb; row public.page_components; effective jsonb; next_content jsonb;
begin
 for section in select value from jsonb_array_elements(p_payload->'sections') loop
  if not (section ? 'images') then continue; end if;
  select * into row from public.page_components where product_id=p_product_id and user_id=p_owner_id and component=section->>'component' and superseded_at is null;
  if row.id is null or row.status='rejected' then continue; end if;
  effective:=coalesce(row.content,row.proposal);
  if jsonb_typeof(effective)='array' then
   select jsonb_agg(case when v->>'key'=section->>'content_variant_key' then v||jsonb_build_object('images',section->'images') else v end order by n)
    into next_content from jsonb_array_elements(effective) with ordinality a(v,n);
   if next_content is distinct from effective then update public.page_components set content=next_content,proposal=next_content,updated_at=clock_timestamp() where id=row.id; end if;
  elsif row.images is distinct from section->'images' then
   update public.page_components set images=section->'images',updated_at=clock_timestamp() where id=row.id;
  end if;
 end loop;
end $$;
revoke all on function public.pi_apply_experience_media(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- pi_commit_persuasion
CREATE OR REPLACE FUNCTION public.pi_commit_persuasion(p_access jsonb, p_product_id uuid, p_tool text, p_id uuid, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_payload jsonb, p_issues jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; old_payload jsonb; old_etag text; old_rev bigint;
 new_id uuid; new_rev bigint; new_etag text; rev bigint; strategy_id uuid; angle_id uuid; plan public.pi_persuasion_plans; result jsonb;
 request_id uuid:=gen_random_uuid(); ref jsonb; section jsonb; row public.page_components; target jsonb; displaced public.pi_landing_experiences; displaced_payload jsonb; displaced_etag text;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null and (pdp_persuasion_enabled or exists(select 1 from public.pi_landing_experiences where product_id=p_product_id and status='active')) for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_tool not in ('save_angle_persuasion_plan','save_landing_experience') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 state:=public.pi_pdp_state(p_product_id,owner_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
   or p_payload->>'schema_version' is distinct from '1.0' or octet_length(p_payload::text)>60000 or jsonb_typeof(p_issues) is distinct from 'array' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_id is not null then
  if p_tool='save_angle_persuasion_plan' then select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_persuasion_plans where id=p_id and product_id=p_product_id and user_id=owner_id;
  else select payload,etag,revision into old_payload,old_etag,old_rev from public.pi_landing_experiences where id=p_id and product_id=p_product_id and user_id=owner_id; end if;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
 end if;
 if p_etag is distinct from coalesce(old_etag,state->>'empty_etag') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_id is null and ((p_tool='save_angle_persuasion_plan' and jsonb_array_length(state->'plans')>=20)
  or (p_tool='save_landing_experience' and jsonb_array_length(state->'experiences')>=20)) then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 strategy_id:=(p_payload->>'strategy_id')::uuid; angle_id:=(p_payload->>'angle_id')::uuid;
 if not exists(select 1 from public.pi_strategy_versions where id=strategy_id and product_id=p_product_id and user_id=owner_id)
   or not exists(select 1 from public.pi_angles where id=angle_id and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_payload->>'status' in ('draft','review') then
  p_payload:=jsonb_set(p_payload,'{status}',to_jsonb(case when p_payload->>'status'='archived' then 'archived'::text when p_tool='save_angle_persuasion_plan' then 'approved'::text else 'active'::text end));
 end if;
 if p_payload->>'status' in ('review','approved','active') and exists(select 1 from jsonb_array_elements(p_issues) i where i->>'severity'='error') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 27
  or (select count(distinct s->>'section_key') from jsonb_array_elements(p_payload->'sections') s)<>jsonb_array_length(p_payload->'sections') then raise exception 'PI_VALIDATION_ERROR'; end if;
 for ref in select jsonb_path_query(p_payload,'$.**.fact_ids[*]') loop
  if not exists(select 1 from public.pi_facts where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.**.evidence_ids[*]') loop
  if not exists(select 1 from public.pi_fact_evidence where id=(ref#>>'{}')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.sections[*].source_asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].asset_refs[*]')
  union all select jsonb_path_query(p_payload,'$.sections[*].images[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'assets') a where a->>'source'=ref->>'source' and a->>'id'=ref->>'id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 for ref in select jsonb_path_query(p_payload,'$.claims[*].review_ids[*]') loop
  if not exists(select 1 from jsonb_array_elements(state->'landing'->'reviews') r where r->>'id'=ref#>>'{}') then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 if p_tool='save_angle_persuasion_plan' then
  if (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='primary')>least(7,(p_payload->'attention_budget'->>'max_primary_sections')::int)
    or (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='support')>least(26,(p_payload->'attention_budget'->>'max_support_sections')::int)
    or jsonb_array_length(p_payload->'beliefs') not between 4 and 7 or p_payload->>'status' not in ('draft','review','approved','archived') then raise exception 'PI_VALIDATION_ERROR'; end if;
 else
  select * into plan from public.pi_persuasion_plans where id=(p_payload->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_payload->>'status'='active' and exists(select 1 from public.pi_landing_experiences e where e.product_id=p_product_id and e.id is distinct from p_id and e.status='active'
    and (e.landing_angle_id=p_payload->>'landing_angle_id' and coalesce(e.landing_hook_id,'')=coalesce(p_payload->>'landing_hook_id',''))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  for section in select value from jsonb_array_elements(p_payload->'sections') where value->>'enabled'='true' loop
   select * into row from public.page_components where product_id=p_product_id and user_id=owner_id and component=section->>'component' and superseded_at is null;
   target:=coalesce(row.content,row.proposal);
   if jsonb_typeof(target)='array' then select value into target from jsonb_array_elements(target) v where v->>'key'=section->>'content_variant_key';
   elsif section->>'content_variant_key'<>'default' then target:=null; end if;
   if p_payload->>'status'='active' and (target is null or not row.enabled or row.status='rejected') then raise exception 'PI_INVALID_REFERENCE'; end if;
  end loop;
 end if;
 new_id:=coalesce(p_id,gen_random_uuid()); new_rev:=coalesce(old_rev,0)+1;
 new_etag:=public.pi_snapshot_hash(jsonb_build_array(new_id,new_rev,p_payload));
 if p_dry_run then return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',false,'dry_run',true,'id',p_id,'revision',coalesce(old_rev,0),'etag',coalesce(old_etag,state->>'empty_etag'),'issues',p_issues)); end if;
 if p_tool='save_angle_persuasion_plan' then
  if p_id is null and (select count(*) from public.pi_persuasion_plans where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  insert into public.pi_persuasion_plans(id,product_id,user_id,strategy_id,angle_id,landing_angle_id,revision,etag,payload)
   values(new_id,p_product_id,owner_id,strategy_id,angle_id,p_payload->>'landing_angle_id',new_rev,new_etag,p_payload)
   on conflict(id) do update set strategy_id=excluded.strategy_id,angle_id=excluded.angle_id,landing_angle_id=excluded.landing_angle_id,revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
 else
  if p_id is null and (select count(*) from public.pi_landing_experiences where product_id=p_product_id)>=20 then raise exception 'PI_VALIDATION_ERROR'; end if;
  -- Cambiar la principal es una decisión atómica, con historia de la versión anterior.
  if p_payload->>'status'='active' and (p_payload->>'is_default')::boolean then
   for displaced in select * from public.pi_landing_experiences where product_id=p_product_id and user_id=owner_id and id is distinct from new_id and status='active' and is_default loop
    displaced_payload:=jsonb_set(displaced.payload,'{is_default}','false'::jsonb);
    displaced_etag:=public.pi_snapshot_hash(jsonb_build_array(displaced.id,displaced.revision+1,displaced_payload));
    update public.pi_landing_experiences set is_default=false,payload=displaced_payload,revision=displaced.revision+1,etag=displaced_etag,updated_at=clock_timestamp() where id=displaced.id;
    insert into public.pi_pdp_revisions(product_id,user_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
     values(p_product_id,owner_id,displaced.id,displaced.revision+1,displaced_etag,displaced_payload,'[]',p_access->>'actor_id',p_access->>'actor_kind');
   end loop;
  end if;
  insert into public.pi_landing_experiences(id,product_id,user_id,persuasion_plan_id,strategy_id,angle_id,landing_angle_id,landing_hook_id,experience_key,status,is_default,revision,etag,payload)
   values(new_id,p_product_id,owner_id,plan.id,strategy_id,angle_id,p_payload->>'landing_angle_id',p_payload->>'landing_hook_id',p_payload->>'experience_key',p_payload->>'status',(p_payload->>'is_default')::boolean,new_rev,new_etag,p_payload)
   on conflict(id) do update set strategy_id=excluded.strategy_id,angle_id=excluded.angle_id,landing_angle_id=excluded.landing_angle_id,persuasion_plan_id=excluded.persuasion_plan_id,landing_hook_id=excluded.landing_hook_id,experience_key=excluded.experience_key,status=excluded.status,
    is_default=excluded.is_default,revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
  perform public.pi_apply_experience_media(p_product_id,owner_id,p_payload);
 end if;
 insert into public.pi_pdp_revisions(product_id,user_id,plan_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind)
  values(p_product_id,owner_id,case when p_tool='save_angle_persuasion_plan' then new_id end,case when p_tool='save_landing_experience' then new_id end,new_rev,new_etag,p_payload,p_issues,p_access->>'actor_id',p_access->>'actor_kind');
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
  'applied',true,'dry_run',false,'id',new_id,'revision',new_rev,'etag',new_etag,'issues',p_issues));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,jsonb_build_object('id',new_id,'artifact_revision',new_rev,'status',p_payload->>'status'));
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
  values(p_product_id,owner_id,p_tool,p_key,p_hash,array['product_intelligence:read','product_intelligence:write'],result,rev,request_id);
 return result;
end $function$;

-- pi_pdp_state
CREATE OR REPLACE FUNCTION public.pi_pdp_state(p_product_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('enabled',(select pdp_persuasion_enabled from public.products where id=p_product_id and user_id=p_owner_id),
  'snapshot',public.pi_context_snapshot(p_product_id),'landing',public.pi_landing_state(p_product_id,p_owner_id),
  'empty_etag',public.pi_snapshot_hash(jsonb_build_object('plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'etag',etag) order by id) from public.pi_persuasion_plans where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),'experiences',coalesce((select jsonb_agg(jsonb_build_object('id',id,'etag',etag) order by id) from public.pi_landing_experiences where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb))),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_persuasion_plans where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'experiences',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_landing_experiences where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('source',source,'id',id,'role',role,'slot',slot,'selected',selected)) order by source,id) from (
    select id,'reference'::text as source,'hero'::text as role,null::text as slot,null::boolean as selected from public.product_reference_images where product_id=p_product_id and user_id=p_owner_id and not excluded
    union all select id,'page_image','explanation',slot,is_selected from public.page_images where product_id=p_product_id and user_id=p_owner_id
     and source<>'reference' and render_status='succeeded' and status<>'rejected' and storage_path is not null
    union all select id,'ugc','demo',null::text,true from public.video_scripts where product_id=p_product_id and user_id=p_owner_id and superseded_at is null
     and final_status in ('approved','in_review','generated') and final_storage_path is not null
  ) a),'[]'::jsonb))
$function$;

-- pi_commit_content
CREATE OR REPLACE FUNCTION public.pi_commit_content(p_access jsonb, p_product_id uuid, p_kind text, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_content jsonb, p_input jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; tool_name text;
 result jsonb; request_id uuid:=gen_random_uuid(); run_id uuid; artifact_id uuid; ids jsonb:='[]'; item jsonb; draft_payload jsonb; n integer:=0; angle_slot integer; selected_id uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 tool_name:=case p_kind when 'tip' then 'save_usage_tip' else 'save_'||p_kind||'_content' end;
 if p_kind is null or p_kind not in ('creative','gallery','event','tip') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_content_state(p_product_id,owner_id,p_kind); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_etag is distinct from state->>'content_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>65536 or jsonb_typeof(p_input) is distinct from 'object'
   or snap->'pricing'='null'::jsonb or snap->'catalog'->>'currency' is distinct from snap->'pricing'->>'currency' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if jsonb_typeof(p_content->'fact_ids') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(p_content->'fact_ids') r(id) where
   not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p_product_id and f.user_id=owner_id and f.usage_status='approved' and f.verification_status='verified')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=r.id::uuid and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind in ('creative','gallery') then
   selected_id:=(snap->'knowledge'->>'active_strategy_id')::uuid;
   if selected_id is null or p_content->>'strategy_id' is distinct from selected_id::text or
     jsonb_typeof(p_content->'angle_ids') is distinct from 'array'
     or jsonb_array_length(p_content->'angle_ids') not between 1 and 3
     or exists(select 1 from jsonb_array_elements_text(p_content->'angle_ids') a(id) where not exists(select 1 from public.pi_angles b where b.id=a.id::uuid and b.product_id=p_product_id and b.user_id=owner_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 if p_kind='event' and not exists(select 1 from public.events where id=(p_content->>'event_id')::uuid and status='published') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind='tip' and (length(trim(p_content->>'text')) not between 1 and 140 or jsonb_array_length(p_content->'fact_ids')<1) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='creative' and (jsonb_typeof(p_content->'concepts') is distinct from 'array' or jsonb_array_length(p_content->'concepts') not between 1 and 18) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='gallery' and (jsonb_typeof(p_content->'plan'->'shots') is distinct from 'array' or jsonb_array_length(p_content->'plan'->'shots')<>9) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_kind='creative' and exists(select 1 from public.creative_assets where product_id=p_product_id and user_id=owner_id and render_status in ('queued','running'))
   or p_kind='gallery' and exists(select 1 from public.page_images where product_id=p_product_id and user_id=owner_id and render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   p_input:=p_input||jsonb_build_object('content',p_content,'analysis_revision',rev,'actor_id',p_access->>'actor_id','context_stamp',p_stamp);
   if p_kind='creative' then

     insert into public.creative_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content,0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'concepts') loop
       n:=n+1;
       select ordinality::int into angle_slot from jsonb_array_elements_text(p_content->'angle_ids') with ordinality where value=item->>'angle_id';
       if angle_slot is null then raise exception 'PI_INVALID_REFERENCE'; end if;
       draft_payload:=item||jsonb_build_object('angle',angle_slot,'preset_id',null,'preset',null,'product_look',p_content->'product_look','kit',p_content->'kit',
         'source','mcp_chat','sales_angle','offer','angle_name',(select a->>'name' from jsonb_array_elements(p_input->'strategy_snapshot'->'angles') a where a->>'id'=item->>'angle_id'),
         'provenance',jsonb_build_object('strategy_id',selected_id,'angle_id',item->>'angle_id','fact_ids',p_content->'fact_ids','analysis_revision',rev,'dramatization',item->>'family'='whatsapp_chat'));
       select id into artifact_id from public.creative_concepts where product_id=p_product_id and user_id=owner_id and superseded_at is null
         and family=item->>'family' and public.creative_concepts.payload->>'name'=item->>'name'
         and public.creative_concepts.payload->'provenance'->>'angle_id'=item->>'angle_id' order by updated_at desc limit 1;
       if artifact_id is null then
         insert into public.creative_concepts(product_id,user_id,run_id,position,angle_slot,family,payload) values(p_product_id,owner_id,run_id,n,angle_slot,item->>'family',draft_payload) returning id into artifact_id;
       else
         update public.creative_concepts set payload=draft_payload,updated_at=now() where id=artifact_id;
       end if;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='gallery' then

     insert into public.page_image_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content->'plan',0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'plan'->'shots') loop
       n:=n+1;
       draft_payload:=item||jsonb_build_object('product_look',p_content->'plan'->'product_look','kit',p_content->'plan'->'kit','props_forbidden',p_content->'plan'->'props_forbidden',
         'world',p_content->'plan'->'visual_world','pairs',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'text' else null end,
         'angle',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'angle' else null end,'source','mcp_chat');
       select id into artifact_id from public.page_image_shots where product_id=p_product_id and user_id=owner_id and superseded_at is null
         and slot=case when item->>'slot'='benefit' then 'benefit-'||(item->>'benefit') else item->>'slot' end and position=n order by updated_at desc limit 1;
       if artifact_id is null then
         insert into public.page_image_shots(product_id,user_id,run_id,slot,position,payload) values(p_product_id,owner_id,run_id,
           case when item->>'slot'='benefit' then 'benefit-'||(item->>'benefit') else item->>'slot' end,n,draft_payload) returning id into artifact_id;
       else
         update public.page_image_shots set payload=draft_payload,updated_at=now() where id=artifact_id;
       end if;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='event' then
     insert into public.event_copy(product_id,user_id,event_id,status,proposal,content,model,prompt_version,provenance,decided_at)
       values(p_product_id,owner_id,(p_content->>'event_id')::uuid,'approved',p_content->'content',p_content->'content','chat',0,p_input,now())
       on conflict(product_id,event_id) do update set status=case when public.event_copy.status='rejected' then 'rejected'::public.content_status else 'approved'::public.content_status end,proposal=excluded.proposal,content=excluded.content,model='chat',prompt_version=0,provenance=excluded.provenance,decided_at=now(),updated_at=now() returning id into artifact_id;
     ids:=jsonb_build_array(artifact_id);
   else
     update public.products set usage_tip=jsonb_build_object('text',p_content->>'text','basis',p_content->>'basis','created_at',now(),'model','chat','prompt_version',0,'source','mcp_chat','provenance',p_input),updated_at=now() where id=p_product_id and user_id=owner_id;
   end if;
   after_snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev+1,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
     values(p_product_id,owner_id,request_id,tool_name,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_object('before',state->'current','after',p_content));
   rev:=rev+1; state:=public.pi_content_state(p_product_id,owner_id,p_kind);
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not p_dry_run,'dry_run',p_dry_run,'content_etag',state->>'content_etag','artifact_ids',ids,'next_action','Contenido guardado y disponible. Generar y publicar son acciones aparte.'));
 if not p_dry_run then
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,tool_name,p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 end if;
 return result;
end $function$;

-- pi_commit_ugc
CREATE OR REPLACE FUNCTION public.pi_commit_ugc(p_access jsonb, p_product_id uuid, p_command jsonb, p_prepared jsonb, p_stamp text, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare owner_id uuid; tool text:=p_command->>'tool'; scope text; rev bigint; state jsonb; snap jsonb; receipt public.pi_idempotency_records;
 cmd jsonb:=p_command->'input'; dry boolean:=coalesce((p_command->'input'->>'dry_run')::boolean,false); script public.video_scripts; result jsonb;
 script_id uuid; op_id uuid; item jsonb; now_at timestamptz:=clock_timestamp(); request_id uuid:=gen_random_uuid(); daily_count int; cap int;
begin
 scope:=case when tool='generate_ugc' then 'ugc:generate' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 if tool='generate_ugc' then perform public.pi_authorize_context(p_access,'product_intelligence:read'); end if;
 if tool not in ('save_ugc_content','generate_ugc','review_ugc') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if tool='review_ugc' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if tool<>'review_ugc' and not dry then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and pi_idempotency_records.tool=tool and idempotency_key=cmd->>'idempotency_key' and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_ugc_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if tool='save_ugc_content' then
   if cmd->>'expected_ugc_etag' is distinct from state->>'ugc_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   if not exists(select 1 from public.pi_strategy_versions v where v.id=(cmd->>'strategy_id')::uuid and v.product_id=p_product_id and v.user_id=owner_id and v.id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)
      and exists(select 1 from jsonb_array_elements(v.snapshot->'angles') with ordinality a(value,slot) where a.value->>'id'=cmd->>'angle_id' and a.slot=(cmd->>'angle_slot')::int)) then raise exception 'PI_INVALID_REFERENCE'; end if;
   if cmd->>'execution_key' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or cmd->>'landing_angle_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or cmd->>'landing_hook_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or (cmd->>'angle_slot')::int not between 1 and 3 or cmd->'content'->>'format' not in ('ugc','mascot')
     or jsonb_typeof(p_prepared->'payload') is distinct from 'object' or octet_length(p_prepared::text)>131072 then raise exception 'PI_VALIDATION_ERROR'; end if;
   select * into script from public.video_scripts where product_id=p_product_id and user_id=owner_id and execution_key=cmd->>'execution_key' and format=cmd->'content'->>'format' and superseded_at is null for update;
   if exists(select 1 from public.video_shots s where s.script_id=script.id and s.render_status in ('queued','running') and s.superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if (select count(*) from public.video_scripts where product_id=p_product_id and source='mcp_chat' and superseded_at is null)>=24 and script.id is null then raise exception 'PI_RATE_LIMITED'; end if;
   if not dry then
     update public.pi_ugc_operations set status='cancelled',updated_at=now_at where pi_ugc_operations.script_id=script.id and status in ('queued','running');
     script_id:=coalesce(script.id,gen_random_uuid());
     insert into public.video_scripts(id,product_id,user_id,angle_slot,format,status,payload,input,source,execution_key,provenance,prompt_version,model,finished_at,approved_at)
       values(script_id,p_product_id,owner_id,(cmd->>'angle_slot')::smallint,cmd->'content'->>'format','succeeded',p_prepared->'payload',p_prepared->'input',
         'mcp_chat',cmd->>'execution_key',jsonb_build_object('strategy_id',cmd->>'strategy_id','angle_id',cmd->>'angle_id','analysis_revision',rev,
         'landing_angle_id',cmd->>'landing_angle_id','landing_hook_id',cmd->>'landing_hook_id','hook',cmd->'hook','context_stamp',p_stamp,'actor_id',p_access->>'actor_id'),0,'chat',now_at,now_at) on conflict(id) do update set payload=excluded.payload,input=excluded.input,provenance=excluded.provenance,updated_at=now_at;
     insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
     update public.product_intelligence set revision=rev+1,updated_at=now_at where product_id=p_product_id;
     rev:=rev+1;
     insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
     state:=public.pi_ugc_state(p_product_id,owner_id);
   end if;
   result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not dry,'dry_run',dry,'script_id',script_id,'ugc_etag',state->>'ugc_etag',
     'artifact_etag',(select artifact_etag from public.video_scripts where id=script_id),'status','approved','next_action','Guion guardado. Genera las tomas cuando lo pidas.'));
 else
   select * into script from public.video_scripts where id=(cmd->>'script_id')::uuid and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
   if script.id is null then raise exception 'PI_NOT_FOUND'; end if;
   if cmd->>'expected_artifact_etag' is distinct from script.artifact_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   if tool='review_ugc' then
     if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
     if cmd->>'action' not in ('approve','unapprove','edit') then raise exception 'PI_VALIDATION_ERROR'; end if;
     if cmd->>'action'='edit' then
       -- Se invalida el montaje completo: también puede cambiar la sincronización de B-roll/textos.
       update public.video_scripts set payload=p_prepared->'payload',edited_at=now_at,updated_at=now_at where id=script.id;
     else
       update public.video_scripts set approved_at=case when cmd->>'action'='approve' then now_at else null end,
         final_status=case when cmd->>'action'='unapprove' and final_storage_path is not null then 'in_review'::public.content_status else final_status end,updated_at=now_at where id=script.id;
     end if;
     return jsonb_build_object('script_id',script.id);
   end if;
   if script.status<>'succeeded' or cmd->>'stage' not in ('keyframes','clips') then raise exception 'PI_VALIDATION_ERROR'; end if;
   if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if cmd->>'stage'='clips' and exists(select 1 from jsonb_array_elements(script.payload->'keyframes') k where not exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=k->>'key' and s.kind='keyframe' and s.render_status='succeeded' and s.status<>'rejected' and s.superseded_at is null)) then raise exception 'PI_VALIDATION_ERROR'; end if;
   cap:=case when cmd->>'stage'='keyframes' then 60 else 40 end;
   -- Por dueño, evita que dos productos superen el cupo simultáneamente.
   perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ugc-budget',0));
   select count(*) into daily_count from public.video_shots where user_id=owner_id and created_at>now_at-interval '24 hours' and (kind='keyframe')=(cmd->>'stage'='keyframes');
   if daily_count+jsonb_array_length(p_prepared->'shots')>cap then raise exception 'PI_RATE_LIMITED'; end if;
   if jsonb_array_length(p_prepared->'shots') not between 1 and 20 then raise exception 'PI_VALIDATION_ERROR'; end if;
   for item in select value from jsonb_array_elements(p_prepared->'shots') loop
     if item->>'key' not in (select jsonb_array_elements_text(cmd->'shot_keys')) or not exists(select 1 from jsonb_array_elements(case when cmd->>'stage'='keyframes' then script.payload->'keyframes' else (script.payload->'a_roll')||(script.payload->'b_roll') end) k where k->>'key'=item->>'key') then raise exception 'PI_INVALID_REFERENCE'; end if;
     if exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=item->>'key' and s.superseded_at is null and (not coalesce((cmd->>'replace_existing')::boolean,false) and s.render_status<>'failed' and s.status<>'rejected' or s.error_code in ('dispatch_unknown','dispatching') or (s.render_status='failed' and s.hf_request_id is not null and coalesce(s.error_code,'') not in ('failed','nsfw','canceled')))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   end loop;
   if dry then return p_prepared->'preview'; end if;
   if coalesce((cmd->>'replace_existing')::boolean,false) then
     if cmd->>'stage'='keyframes' then
       update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and superseded_at is null and
         (kind<>'keyframe' or ('K1' in (select jsonb_array_elements_text(cmd->'shot_keys')) and key<>'K1'));
     end if;
     update public.video_scripts set final_status=case when final_storage_path is null then null else 'in_review'::public.content_status end,updated_at=now_at where id=script.id;
     select * into script from public.video_scripts where id=script.id;
   end if;
   op_id:=gen_random_uuid();
   insert into public.pi_ugc_operations(id,product_id,user_id,script_id,stage,access,input_hash,context_stamp,script_etag,analysis_revision,request_revision,estimated_usd)
     values(op_id,p_product_id,owner_id,script.id,cmd->>'stage',p_access,p_hash,p_stamp,script.artifact_etag,coalesce((script.provenance->>'analysis_revision')::bigint,rev),rev,(p_prepared->>'estimated_usd')::numeric);
   for item in select value from jsonb_array_elements(p_prepared->'shots') loop
     update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and key=item->>'key' and superseded_at is null;
     insert into public.video_shots(script_id,product_id,user_id,key,kind,attempt,endpoint,input,operation_id) values(script.id,p_product_id,owner_id,item->>'key',item->>'kind',1,item->>'endpoint',item->'input',op_id);
   end loop;
   result:=jsonb_build_object('operation_id',op_id,'revision',rev,'request_id',request_id);
 end if;
 if dry then return result; end if;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,(cmd->>'expected_revision')::bigint,rev,jsonb_build_array(jsonb_build_object('script_id',coalesce(script_id,script.id),'operation_id',op_id)));
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and pi_idempotency_records.tool=tool and idempotency_key=cmd->>'idempotency_key';
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,tool,cmd->>'idempotency_key',p_hash,array[scope],result,rev,request_id);
 return result;
end $function$;

-- pi_shopify_automation_active
CREATE OR REPLACE FUNCTION public.pi_shopify_automation_active(p_access jsonb, p_product_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; policy public.pi_shopify_automations;
begin
 if not coalesce(p_access->'scopes' ? 'product_intelligence:read',false) then return false; end if;
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 if not coalesce(p_access->'scopes' ? 'product_intelligence:write',false) then return false; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 select * into policy from public.pi_shopify_automations where product_id=p_product_id and user_id=owner_id;
 return coalesce(policy.enabled and policy.actor_id=p_access->>'actor_id' and policy.actor_kind=p_access->>'actor_kind'
  and exists(select 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null),false);
end $function$;

-- pi_guard_video
CREATE OR REPLACE FUNCTION public.pi_guard_video()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform 1 from public.products where id=new.product_id and user_id=new.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if tg_op='UPDATE' and (new.product_id,new.user_id) is distinct from (old.product_id,old.user_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if tg_op='UPDATE' and old.superseded_at is not null then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if tg_op='UPDATE' and old.final_operation_id is not null and current_setting('pi.final_commit',true) is distinct from 'true' and old.final_operation_started_at>clock_timestamp()-interval '10 minutes' then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if new.source='mcp_chat' then
   if tg_op='UPDATE' and new.final_storage_path is distinct from old.final_storage_path and new.final_storage_path is not null then
     new.final_script_hash:=public.pi_snapshot_hash(new.payload); new.final_shots_hash:=public.pi_ugc_shots_hash(new.id);
   end if;
   if new.final_status='approved' and new.final_storage_path is null then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 return new;
end $function$;

-- pi_guard_landing_ugc
CREATE OR REPLACE FUNCTION public.pi_guard_landing_ugc()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare content jsonb; requested_id text;
begin
 if new.component<>'ugc-slider' or not new.enabled then return new; end if;
 perform 1 from public.products where id=new.product_id and user_id=new.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 for content in select value from jsonb_array_elements(case when jsonb_typeof(coalesce(new.content,new.proposal))='array' then coalesce(new.content,new.proposal) else jsonb_build_array(jsonb_build_object('content',coalesce(new.content,new.proposal))) end) loop
   for requested_id in select jsonb_array_elements_text(coalesce(content->'content'->'script_ids','[]'::jsonb)) loop
     if not exists(select 1 from public.video_scripts s where s.id=requested_id::uuid and s.product_id=new.product_id and s.user_id=new.user_id and s.superseded_at is null and s.final_status is distinct from 'rejected'::public.content_status and s.final_storage_path is not null) then raise exception 'PI_INVALID_REFERENCE'; end if;
   end loop;
 end loop;
 return new;
end $function$;

-- pi_assert_ugc_publishable
CREATE OR REPLACE FUNCTION public.pi_assert_ugc_publishable(p_access jsonb, p_product_id uuid, p_script_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; script public.video_scripts; requested uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 foreach requested in array p_script_ids loop
   select * into script from public.video_scripts where id=requested and product_id=p_product_id and user_id=owner_id and superseded_at is null;
   if script.id is null or script.final_status='rejected' or script.final_storage_path is null then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
end $function$;

-- pi_claim_ugc_final
CREATE OR REPLACE FUNCTION public.pi_claim_ugc_final(p_access jsonb, p_product_id uuid, p_script_id uuid, p_etag text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; script public.video_scripts;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into script from public.video_scripts where id=p_script_id and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
 if script.id is null then raise exception 'PI_NOT_FOUND'; end if;
 if script.artifact_etag is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if script.final_operation_id is not null and script.final_operation_started_at>clock_timestamp()-interval '10 minutes' then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if coalesce(p_access->>'final_action','upload') in ('upload','approve') then
   if exists(select 1 from public.video_shots s where s.script_id=script.id and s.superseded_at is null and s.render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;

 end if;
 perform set_config('pi.final_commit','true',true);
 update public.video_scripts set final_operation_id=gen_random_uuid(),final_operation_started_at=clock_timestamp() where id=p_script_id returning * into script;
 return to_jsonb(script);
end $function$;

-- pi_claim_ugc_shot
CREATE OR REPLACE FUNCTION public.pi_claim_ugc_shot(p_shot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare shot public.video_shots; script public.video_scripts; op public.pi_ugc_operations;
begin
 select * into shot from public.video_shots where id=p_shot_id and superseded_at is null;
 if shot.id is null then return null; end if;
 perform 1 from public.products where id=shot.product_id and user_id=shot.user_id and pi_deleting_at is null for update;
 if not found then return null; end if;
 select * into script from public.video_scripts where id=shot.script_id and superseded_at is null;
 if script.id is null then return null; end if;
 select * into op from public.pi_ugc_operations where id=shot.operation_id for update;
 if op.id is not null then
   if op.status in ('cancelled','failed') then return null; end if;
   begin
     perform public.pi_authorize_context(op.access,'ugc:generate');
     if op.script_etag is distinct from script.artifact_etag then raise exception 'PI_REVISION_CONFLICT'; end if;
   exception when others then
     update public.pi_ugc_operations set status='cancelled',updated_at=clock_timestamp() where id=op.id;
     update public.video_shots set render_status='failed',error_code='context_revoked',error_message='Cambió el contexto o la autorización. Revisa el guion antes de generar.',finished_at=now(),updated_at=now() where operation_id=op.id and render_status='queued';
     return null;
   end;
 end if;
 update public.video_shots set error_code='dispatching',updated_at=clock_timestamp() where id=shot.id and render_status='queued' and superseded_at is null and error_code is distinct from 'dispatching' returning * into shot;
 if shot.id is null then return null; end if;
 if op.id is not null then update public.pi_ugc_operations set status='running',updated_at=clock_timestamp() where id=op.id; end if;
 return to_jsonb(shot);
end $function$;

-- pi_pack_labels_state
CREATE OR REPLACE FUNCTION public.pi_pack_labels_state(p_product_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('current',(select (to_jsonb(l)-'provenance')||jsonb_build_object('provenance',l.provenance-'snapshot','catalog_currency',(select currency from public.products where id=p_product_id and user_id=p_owner_id),'evidence_stale',public.pi_pack_evidence_stale(l.provenance,l.product_id,l.user_id))
   from public.pack_labels l where l.product_id=p_product_id and l.user_id=p_owner_id and l.superseded_at is null
   order by l.created_at desc,l.id desc limit 1),
   'etag',public.pi_snapshot_hash(jsonb_build_array(coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.pack_labels l
     where l.product_id=p_product_id and l.user_id=p_owner_id and l.superseded_at is null),'[]'::jsonb))))
$function$;

-- pi_commit_pack_labels
CREATE OR REPLACE FUNCTION public.pi_commit_pack_labels(p_access jsonb, p_product_id uuid, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_action text, p_labels jsonb, p_fact_ids jsonb DEFAULT '[]'::jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 row public.pack_labels; new_id uuid; request_id uuid:=gen_random_uuid(); pack_prices jsonb; target_status public.content_status;
 automatic boolean; changed boolean; facts uuid[]; entry jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_action is distinct from 'propose' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 automatic:=true; -- El guardado MCP aprueba; no habilita publish_product.
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_pack_labels'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 state:=public.pi_pack_labels_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_etag is distinct from state->>'etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if snap->'pricing'='null'::jsonb or snap->'pricing'->>'currency' is distinct from snap->'catalog'->>'currency' or p_action is null or p_action not in ('propose','approve','reopen','edit','edit_approve')
   or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_labels) is distinct from 'array' or jsonb_array_length(p_labels) not between 1 and 3 or octet_length(p_labels::text)>16384
   or jsonb_typeof(p_fact_ids) is distinct from 'array' or jsonb_array_length(p_fact_ids)>20 then raise exception 'PI_VALIDATION_ERROR'; end if;
 if (select count(distinct e->>'units') from jsonb_array_elements(p_labels) e)<>jsonb_array_length(p_labels)
   or jsonb_array_length(p_labels)<>jsonb_array_length(snap->'pricing'->'packs')
   or exists(select 1 from jsonb_array_elements(p_labels) e where not exists(select 1 from jsonb_array_elements(snap->'pricing'->'packs') k where k->'units'=e->'units')
     or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 80
     or length(coalesce(e->>'support',''))>100 or length(coalesce(e->>'badge',''))>30 or length(trim(e->>'reason')) not between 1 and 1000
     or jsonb_typeof(e->'reason') is distinct from 'string' or e->>'basis' is null or e->>'basis' not in ('duration','sharing','spare','gift','savings','other'))
   or (select count(*) from jsonb_array_elements(p_labels) e where e->>'badge' is not null)>1 then raise exception 'PI_VALIDATION_ERROR'; end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into facts from jsonb_array_elements_text(p_fact_ids);
 if p_action<>'reopen' and exists(select 1 from unnest(facts) id where not exists(select 1 from public.pi_facts f where f.id=id and f.product_id=p_product_id and f.user_id=owner_id
   and f.verification_status='verified' and f.usage_status='approved')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=id and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('units',k->'units','price',k->'price') order by (k->>'units')::int),'[]'::jsonb) into pack_prices from jsonb_array_elements(snap->'pricing'->'packs') k;
 select * into row from public.pack_labels where id=(state->'current'->>'id')::uuid;
 if p_action<>'propose' and row.id is null then raise exception 'PI_NOT_FOUND'; end if;
 target_status:=case when row.status='rejected' then 'rejected'::public.content_status else 'approved'::public.content_status end;
 -- Compatibilidad de nombres; guardar y editar no necesitan aprobación.
 /* target_status:=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then 'approved'::public.content_status when p_action='propose' then 'generated'::public.content_status else 'in_review'::public.content_status end; */
 if p_action in ('approve','reopen') and p_labels is distinct from row.payload then raise exception 'PI_VALIDATION_ERROR'; end if;
 changed:=case when p_action='propose' then (automatic and row.status is distinct from target_status) or row.source is distinct from 'mcp_chat' or public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id) or row.payload is distinct from p_labels or row.prices is distinct from pack_prices or coalesce(row.provenance->'duration_fact_ids','[]'::jsonb) is distinct from p_fact_ids or row.provenance->>'currency' is distinct from snap->'pricing'->>'currency'
   else (p_action<>'reopen' and row.source='mcp_chat' and row.provenance->>'currency' is distinct from snap->'pricing'->>'currency') or (p_action<>'reopen' and public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id)) or row.status is distinct from target_status or row.payload is distinct from p_labels or (p_action<>'reopen' and row.prices is distinct from pack_prices) end;
 if not changed then target_status:=row.status; end if;
 new_id:=row.id;
 if changed and not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   perform set_config('pi.pack_labels_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   if p_action='propose' and row.id is null then
     new_id:=gen_random_uuid();
     insert into public.pack_labels(id,product_id,user_id,payload,prices,status,prompt_version,model,source,provenance,decided_at)
       values(new_id,p_product_id,owner_id,p_labels,pack_prices,target_status,0,'chat','mcp_chat',jsonb_build_object('contract_version','1.0',
         'duration_fact_ids',p_fact_ids,'currency',snap->'pricing'->>'currency','analysis_revision',rev,'actor_id',p_access->>'actor_id','snapshot',snap,'reviewed_fact_revisions',case when automatic then coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb) else '{}'::jsonb end),case when automatic then clock_timestamp() else null end);
   else
     update public.pack_labels set source='mcp_chat',payload=p_labels,prices=case when p_action='reopen' then row.prices else pack_prices end,status=target_status,
       provenance=case when p_action in ('approve','edit_approve') or (p_action='propose' and automatic) then row.provenance||jsonb_build_object('currency',snap->'pricing'->>'currency','reviewed_fact_revisions',
         coalesce((select jsonb_object_agg(f.id::text,f.last_revision) from public.pi_facts f where f.id=any(facts) and f.product_id=p_product_id and f.user_id=owner_id),'{}'::jsonb)) else row.provenance end,
       decided_at=case when target_status='approved' then now() else null end,
       edited_at=case when p_action in ('edit','edit_approve') then now() else row.edited_at end,updated_at=now()
       where id=row.id and product_id=p_product_id and user_id=owner_id and superseded_at is null;
   end if;
   after_snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
     values(p_product_id,owner_id,rev+1,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
     values(p_product_id,owner_id,request_id,'pack_labels_'||p_action,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_array(jsonb_build_object('proposal_id',new_id,'status',target_status)));
   rev:=rev+1; state:=public.pi_pack_labels_state(p_product_id,owner_id);
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',changed and not p_dry_run,'dry_run',p_dry_run,'proposal_id',case when p_dry_run then null else new_id end,
   'status',target_status,'pack_labels_etag',state->>'etag','next_action',case when automatic then 'Etiquetas guardadas. Publicar es una acción aparte.' else 'Revisa y acepta las etiquetas en Información base. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_pack_labels' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_pack_labels',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $function$;

-- pi_review_landing
CREATE OR REPLACE FUNCTION public.pi_review_landing(p_access jsonb, p_product_id uuid, p_component text, p_id uuid, p_updated_at timestamp with time zone, p_stamp text, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; state jsonb; snap jsonb; row public.page_components; pending_content jsonb; approving boolean; exp public.pi_landing_experiences; section jsonb; sections jsonb; effective jsonb; variant jsonb; selected_images jsonb; next_payload jsonb; next_etag text; changed boolean;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 select * into row from public.page_components where id=p_id and product_id=p_product_id and user_id=owner_id and component=p_component and superseded_at is null for update;
 if not found or row.updated_at is distinct from p_updated_at then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 state:=public.pi_landing_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 pending_content:=case when p_patch ? 'content' then p_patch->'content' else coalesce(row.content,row.proposal) end;
 approving:=coalesce((p_patch->>'approve')::boolean,false) or p_patch ? 'content' or p_patch ? 'images' or p_patch->>'enabled'='true';
 if approving then perform public.pi_validate_landing_variants(pending_content,p_product_id,owner_id); end if;
 update public.page_components set
   content=case when p_patch ? 'content' then pending_content else page_components.content end,
   proposal=case when p_patch ? 'content' then pending_content else page_components.proposal end,
   images=case when p_patch ? 'images' then p_patch->'images' else images end,
   enabled=case when p_component='listing' then true when p_patch ? 'enabled' then (p_patch->>'enabled')::boolean else enabled end,
   status=case when row.status='rejected' and p_patch->>'enabled' is distinct from 'true' then row.status when approving then 'approved'::public.content_status else status end,
   decided_at=case when approving then clock_timestamp() else decided_at end, updated_at=clock_timestamp()
 where id=p_id and user_id=owner_id;
 -- El editor manual comparte selección de imágenes con las experiencias guardadas.
 if p_patch ? 'content' or p_patch ? 'images' then
  select coalesce(content,proposal) into effective from public.page_components where id=p_id;
  for exp in select * from public.pi_landing_experiences where product_id=p_product_id and user_id=owner_id and payload->>'status'='active' for update loop
   sections:='[]'; changed:=false;
   for section in select value from jsonb_array_elements(exp.payload->'sections') loop
    if section->>'component'=p_component then
     variant:=null;
     if jsonb_typeof(effective)='array' then select value into variant from jsonb_array_elements(effective) where value->>'key'=section->>'content_variant_key'; end if;
     selected_images:=coalesce(variant->'images',p_patch->'images',row.images,'[]');
     section:=section||jsonb_build_object('images',selected_images,'manual_overrides',coalesce((select jsonb_agg(distinct value) from jsonb_array_elements(coalesce(section->'manual_overrides','[]')||case when p_patch ? 'content' then '["content"]'::jsonb else '[]'::jsonb end||case when p_patch ? 'images' or selected_images is distinct from section->'images' then '["assets"]'::jsonb else '[]'::jsonb end)),'[]'));
     changed:=true;
    end if;
    sections:=sections||jsonb_build_array(section);
   end loop;
   if changed then
    next_payload:=exp.payload||jsonb_build_object('sections',sections);
    next_etag:=public.pi_snapshot_hash(jsonb_build_array(exp.id,exp.revision+1,next_payload));
    update public.pi_landing_experiences set payload=next_payload,revision=exp.revision+1,etag=next_etag,updated_at=clock_timestamp() where id=exp.id;
    insert into public.pi_pdp_revisions(product_id,user_id,experience_id,revision,etag,payload,issues,actor_id,actor_kind) values(p_product_id,owner_id,exp.id,exp.revision+1,next_etag,next_payload,'[]',p_access->>'actor_id','merchant');
   end if;
  end loop;
 end if;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
 values(p_product_id,owner_id,gen_random_uuid(),'edit_landing_content',p_access->>'actor_id',
   coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   jsonb_build_object('component',p_component,'before',jsonb_build_object('content',coalesce(row.content,row.proposal),'enabled',row.enabled,'images',row.images,'status',row.status),
     'after',(select jsonb_build_object('content',coalesce(c.content,c.proposal),'enabled',c.enabled,'images',c.images,'status',c.status) from public.page_components c where id=p_id)));
end $function$;

-- No cambiar textos, imágenes, destinos, orden ni enabled durante esta migración.
-- No leer pi_visual_versions/pi_pdp_revisions/pi_revisions para decidir si se puede usar contenido.
-- Archivar contexto conserva relaciones como procedencia, con dueño/tipo/persona válidos.
CREATE OR REPLACE FUNCTION public.pi_validate_knowledge(p_access jsonb, p_product_id uuid, p_previous jsonb, p_graph jsonb, p_revision bigint, p_reviewed_ids jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text; rows jsonb; r jsonb; old_row jsonb; ref jsonb; target jsonb; sensitive boolean := false;
  affected uuid[] := '{}'; reviewed uuid[] := '{}'; f uuid; source_id uuid; owner_id uuid := (p_access->>'user_id')::uuid;
begin
  if jsonb_typeof(p_graph) <> 'object' or p_graph - array['persona','jtbd','pain','desire','objection','angle','customer_language','offer','Source','Fact','EvidenceLink'] <> '{}'::jsonb
    or octet_length(p_graph::text) > 1048576 then raise exception 'PI_VALIDATION_ERROR'; end if;
  if (select count(*) from jsonb_each(p_graph) e cross join lateral jsonb_array_elements(e.value) node(value))
    <> (select count(distinct node.value->>'id') from jsonb_each(p_graph) e cross join lateral jsonb_array_elements(e.value) node(value)) then raise exception 'PI_VALIDATION_ERROR'; end if;
  foreach k in array array['persona','jtbd','pain','desire','objection','angle','customer_language','offer','Source','Fact','EvidenceLink'] loop
    rows := p_graph->k;
    if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
    -- Los comandos V1 archivan; no eliminan identidades ni cambian su tipo.
    if exists(select 1 from jsonb_array_elements(p_previous->k) b where not exists(select 1 from jsonb_array_elements(rows) n where n->>'id'=b->>'id')) then raise exception 'PI_INVALID_REFERENCE'; end if;
    for r in select value from jsonb_array_elements(rows) loop
      select value into old_row from jsonb_array_elements(p_previous->k) where value->>'id'=r->>'id';
      if (old_row is null or (old_row-'last_revision') is distinct from (r-'last_revision')) then
        if (r->>'last_revision')::bigint is distinct from p_revision+1 then raise exception 'PI_VALIDATION_ERROR'; end if;
      elsif r->>'last_revision' is distinct from old_row->>'last_revision' then raise exception 'PI_VALIDATION_ERROR'; end if;
      if k in ('jtbd','pain','desire','objection','angle','customer_language') then
        select value into target from jsonb_array_elements(p_graph->'persona') where value->>'id'=r->>'persona_id';
        if target is null then raise exception 'PI_INVALID_REFERENCE'; end if;
      end if;
      if k in ('persona','jtbd','pain','desire','objection','angle') then
        if r->>'epistemic_status'<>'hypothesis' and jsonb_array_length(r->'evidence')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->>'epistemic_status'='validated' and coalesce(length(trim(r->>'validation_note')),0)=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        for ref in select value from jsonb_array_elements(r->'evidence') loop
          select value into target from jsonb_array_elements(p_graph->'Source') where value->>'id'=ref->>'source_id';
          if target is null then raise exception 'PI_INVALID_REFERENCE'; end if;
          if coalesce(length(ref->>'fragment'),0)=0 or position(ref->>'fragment' in target->>'excerpt')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        end loop;
      end if;
      if k='Source' then
        if (r->'url'='null'::jsonb) = (r->'internal_ref'='null'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->'internal_ref'<>'null'::jsonb and not (public.pi_internal_references(p_product_id,owner_id) ? ((r->'internal_ref'->>'kind')||':'||(r->'internal_ref'->>'id'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
      elsif k='EvidenceLink' then
        if (select count(*) from jsonb_array_elements(p_graph->'EvidenceLink') n where (n->>'fact_id',n->>'source_id',n->>'relation',n->>'fragment')=(r->>'fact_id',r->>'source_id',r->>'relation',r->>'fragment'))>1 then raise exception 'PI_VALIDATION_ERROR'; end if;
        if not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=r->>'fact_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        select value into target from jsonb_array_elements(p_graph->'Source') where value->>'id'=r->>'source_id';
        if target is null then raise exception 'PI_INVALID_REFERENCE'; end if;
        if coalesce(length(r->>'fragment'),0)=0 or position(r->>'fragment' in target->>'excerpt')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
      elsif k='Fact' then
        if r->>'verification_status'='verified' and not exists(select 1 from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id' and value->>'relation'='supports') then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->>'usage_status'='approved' and r->>'verification_status'<>'verified' then raise exception 'PI_VALIDATION_ERROR'; end if;
        if old_row is not null and (old_row->>'verification_status'<>'unverified' or old_row->>'usage_status'<>'pending') then reviewed:=array_append(reviewed,(r->>'id')::uuid); end if;
        if (old_row is null or (old_row-'last_revision') is distinct from (r-'last_revision')) and
          (r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' or old_row->>'verification_status'<>'unverified' or old_row->>'usage_status'<>'pending') then
          sensitive:=true; affected:=array_append(affected,(r->>'id')::uuid);
        end if;
      elsif k='angle' then
        if jsonb_array_length(r->'jtbd_ids')=0 or jsonb_array_length(r->'pain_ids')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        foreach rows in array array[r->'jtbd_ids',r->'pain_ids',r->'desire_ids',r->'fact_ids',coalesce(r->'generation_guidance'->'proof_fact_ids','[]'::jsonb),coalesce(r->'generation_guidance'->'objection_ids','[]'::jsonb)] loop
          if jsonb_array_length(rows) <> (select count(distinct value) from jsonb_array_elements(rows)) then raise exception 'PI_VALIDATION_ERROR'; end if;
        end loop;
        for ref in select jsonb_build_object('kind',v.kind,'id',x.value) from
          (values ('jtbd',r->'jtbd_ids'),('pain',r->'pain_ids'),('desire',r->'desire_ids'),('Fact',r->'fact_ids'),
          ('Fact',coalesce(r->'generation_guidance'->'proof_fact_ids','[]'::jsonb)),('objection',coalesce(r->'generation_guidance'->'objection_ids','[]'::jsonb))) v(kind,ids)
          cross join lateral jsonb_array_elements_text(v.ids) x loop
          select value into target from jsonb_array_elements(p_graph->(ref->>'kind')) where value->>'id'=ref->>'id';
          if target is null or (ref->>'kind'<>'Fact' and (target->>'persona_id' is distinct from r->>'persona_id')) then raise exception 'PI_INVALID_REFERENCE'; end if;
        end loop;
      elsif k='objection' then
        if exists(select 1 from jsonb_array_elements_text(r->'fact_ids') x where not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=x.value)) then raise exception 'PI_INVALID_REFERENCE'; end if;
      elsif k='pain' then
        for ref in select value from jsonb_array_elements(jsonb_build_array(r->'frequency',r->'severity')) where value->>'basis_type'='observed' loop
          if not exists(select 1 from jsonb_array_elements(p_graph->'Source') where value->>'id'=ref->>'source_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        end loop;
      elsif k='customer_language' then
        if r->'angle_id'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(p_graph->'angle') where value->>'id'=r->>'angle_id' and value->>'persona_id'=r->>'persona_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        if r->>'origin'='observed' and not exists(select 1 from jsonb_array_elements(p_graph->'Source') where value->>'id'=r->>'source_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        if r->>'origin'='synthetic' and (r->>'type'='customer_quote' or r->'source_id'<>'null'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
      end if;
    end loop;
  end loop;
  -- Cambiar fuentes o respaldo de un hecho revisado requiere verify + revisión explícita del hecho.
  for r in select value from jsonb_array_elements(p_graph->'EvidenceLink') loop
    select value into old_row from jsonb_array_elements(p_previous->'EvidenceLink') where value->>'id'=r->>'id';
    if ((old_row is null and r->>'relation'<>'contradicts') or (old_row is not null and (old_row-'last_revision') is distinct from (r-'last_revision')))
      and ((r->>'fact_id')::uuid=any(reviewed) or (old_row->>'fact_id')::uuid=any(reviewed)) then
      sensitive:=true;
      if (r->>'fact_id')::uuid=any(reviewed) then affected:=array_append(affected,(r->>'fact_id')::uuid); end if;
      if (old_row->>'fact_id')::uuid=any(reviewed) then affected:=array_append(affected,(old_row->>'fact_id')::uuid); end if;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(p_graph->'Source') loop
    select value into old_row from jsonb_array_elements(p_previous->'Source') where value->>'id'=r->>'id';
    if old_row is not null and (old_row-'last_revision') is distinct from (r-'last_revision') then
      for ref in select value from jsonb_array_elements(p_previous->'EvidenceLink') where value->>'source_id'=r->>'id' and (value->>'fact_id')::uuid=any(reviewed) loop
        sensitive:=true; affected:=array_append(affected,(ref->>'fact_id')::uuid);
      end loop;
    end if;
  end loop;
  if sensitive then
    perform public.pi_authorize_context(p_access,'product_intelligence:verify');
    foreach f in array affected loop
      if not (p_reviewed_ids ? f::text) or not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=f::text and length(trim(value->>'reason'))>0) then raise exception 'PI_VALIDATION_ERROR'; end if;
    end loop;
  end if;
  foreach k in array array['persona','jtbd','pain','desire','objection','angle','offer'] loop
    if exists(select 1 from (
      select (value->>'priority')::bigint p,row_number() over(partition by value->>'persona_id' order by (value->>'priority')::bigint) n
      from jsonb_array_elements(p_graph->k) where value->>'lifecycle'='active'
    ) a where p<>n) then raise exception 'PI_VALIDATION_ERROR'; end if;
  end loop;
  return sensitive;
end $function$;


create or replace function public.pi_product_gallery_etag(p_product_id uuid,p_owner_id uuid) returns text language sql stable set search_path='' as $$
 select public.pi_snapshot_hash(coalesce(jsonb_agg(jsonb_build_object('id',id,'slot',slot,'position',position,'selected',is_selected,'discarded_at',discarded_at,'updated_at',updated_at) order by id),'[]'))
 from public.page_images where product_id=p_product_id and user_id=p_owner_id and slot in ('cover','gallery')
$$;
revoke all on function public.pi_product_gallery_etag(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pi_product_gallery_etag(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.pi_review_ugc_keyframes(p_access jsonb, p_product_id uuid, p_script_id uuid, p_etag text, p_action text, p_shot_id uuid DEFAULT NULL::uuid, p_shot_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; script public.video_scripts; shot public.video_shots; affected int;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into script from public.video_scripts where id=p_script_id and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
 if script.id is null then raise exception 'PI_NOT_FOUND'; end if;
 if script.artifact_etag is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_action not in ('approve','reject','reopen') or (p_shot_id is null and p_action<>'approve') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from public.video_shots s where s.script_id=script.id and s.superseded_at is null and s.render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if p_shot_id is not null then
   select * into shot from public.video_shots where id=p_shot_id and script_id=p_script_id and user_id=owner_id and product_id=p_product_id and kind='keyframe' and render_status='succeeded' and superseded_at is null for update;
   if shot.id is null or (p_shot_updated_at is not null and shot.updated_at is distinct from p_shot_updated_at) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 end if;
 update public.video_shots s set status=case p_action when 'approve' then 'approved'::public.content_status when 'reject' then 'rejected'::public.content_status else 'in_review'::public.content_status end,updated_at=clock_timestamp()
   where s.script_id=p_script_id and s.kind='keyframe' and s.superseded_at is null and s.render_status='succeeded'
   and (s.id=p_shot_id or (p_shot_id is null and s.status='in_review'))
   and s.status is distinct from case p_action when 'approve' then 'approved'::public.content_status when 'reject' then 'rejected'::public.content_status else 'in_review'::public.content_status end;
 get diagnostics affected=row_count;
 if affected>0 then

   update public.video_scripts set artifact_etag=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),
     updated_at=clock_timestamp() where id=p_script_id;
 end if;
end $function$;

CREATE OR REPLACE FUNCTION public.pi_commit_visual(p_access jsonb, p_product_id uuid, p_tool text, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_records jsonb, p_dry_run boolean DEFAULT false, p_operation jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; rev bigint; receipt public.pi_visual_receipts; raw jsonb; candidate jsonb; old public.pi_visual_records;
 changes jsonb:='[]'::jsonb; result jsonb; request_id uuid:=gen_random_uuid(); changed boolean:=false; current_etag text; op_id uuid;
begin
 if p_tool not in ('save_visual_identity','save_visual_generation_plan','prepare_visual_iteration','record_visual_iteration_result','prepare_visual_asset_upload','ingest_external_visual_asset','bind_visual_asset','unbind_visual_asset','save_visual_reconciliation','save_visual_binding_suggestions','review_visual_record') then raise exception 'PI_VALIDATION_ERROR'; end if;
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 if not p_dry_run then
  select * into receipt from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   return receipt.result;
  end if;
 end if;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 -- CAS del artefacto y de cada miembro conserva concurrencia sin invalidar por contexto.
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>40 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 for candidate in select value from jsonb_array_elements(p_records) loop
  select * into old from public.pi_visual_records where id=(candidate->>'id')::uuid;
  if found and (old.product_id<>p_product_id or old.user_id<>owner_id or old.kind<>candidate->>'kind') then raise exception 'PI_INVALID_REFERENCE'; end if;
  if found and candidate->>'etag'=old.etag then continue; end if;
  if (candidate->>'version')::bigint is distinct from coalesce(old.version,0)+1 then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  if not found and (select count(*) from public.pi_visual_records where product_id=p_product_id)>=1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  if old.kind='review' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if old.kind='asset' and candidate->>'status' in ('rejected','archived') and exists(select 1 from public.pi_visual_records b where b.product_id=p_product_id and b.kind='binding' and b.status='selected' and b.payload->>'asset_id'=old.id::text) then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  perform public.pi_validate_visual_record_batch(p_access,p_product_id,candidate,p_records);
  changes:=changes||jsonb_build_array(candidate); changed:=true;
 end loop;
 -- The etag is the read collection or the single edited head; version CAS checks every batch member.
 if p_etag is distinct from public.pi_snapshot_hash(raw->'records') and not exists(select 1 from public.pi_visual_records where product_id=p_product_id and user_id=owner_id and etag=p_etag) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_operation is not null then
  if p_operation->>'kind' not in ('upload','ingest') or not exists(select 1 from public.pi_visual_records where id=(p_operation->>'iteration_id')::uuid and product_id=p_product_id and user_id=owner_id and kind='iteration' and status in ('prepared','result_recorded')) then raise exception 'PI_INVALID_REFERENCE'; end if;
  op_id:=(p_operation->>'id')::uuid;
 end if;
 if p_dry_run then return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',false,'dry_run',true,'records',changes,'etag',p_etag,'dependency_stamp',p_stamp)); end if;
 for candidate in select value from jsonb_array_elements(changes) loop
  insert into public.pi_visual_records(id,product_id,user_id,kind,version,etag,status,payload,created_at,updated_at)
   values((candidate->>'id')::uuid,p_product_id,owner_id,candidate->>'kind',(candidate->>'version')::bigint,candidate->>'etag',candidate->>'status',candidate->'payload',(candidate->>'created_at')::timestamptz,(candidate->>'updated_at')::timestamptz)
   on conflict(id) do update set version=excluded.version,etag=excluded.etag,status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at;
  insert into public.pi_visual_versions(record_id,product_id,user_id,version,record,actor_id) values((candidate->>'id')::uuid,p_product_id,owner_id,(candidate->>'version')::bigint,candidate,p_access->>'actor_id');
 end loop;
 if p_operation is not null then
  insert into public.pi_visual_operations(id,product_id,user_id,kind,iteration_id,access,source,status)
   values(op_id,p_product_id,owner_id,p_operation->>'kind',(p_operation->>'iteration_id')::uuid,p_access,p_operation->'source','pending');
 end if;
 if changed then
  insert into public.product_intelligence(product_id,user_id,revision) values(p_product_id,owner_id,1)
   on conflict(product_id) do update set revision=public.product_intelligence.revision+1,updated_at=clock_timestamp() returning revision into rev;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev,public.pi_context_snapshot(p_product_id),public.pi_snapshot_hash(public.pi_context_snapshot(p_product_id)),p_access->>'actor_id');
 end if;
 for candidate in select value from jsonb_array_elements(changes) loop
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,
    case when candidate->>'kind'='binding' then case when candidate->>'status'='selected' then 'visual_asset.bound' else 'visual_asset.unbound' end
     when candidate->>'kind'='review' then 'visual_review.recorded'
     else 'visual_'||(candidate->>'kind')||'.'||case when (candidate->>'version')::int=1 then 'created' when candidate->>'status' in ('approved','rejected','archived') then candidate->>'status' else 'updated' end end,
    p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,
    jsonb_build_object('record_id',candidate->>'id','version',candidate->'version','status',candidate->>'status'));
 end loop;
 raw:=public.pi_visual_source_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',changed or op_id is not null,'dry_run',false,'records',changes,'operation_id',op_id,'etag',public.pi_snapshot_hash(raw->'records'),'dependency_stamp',public.pi_snapshot_hash(raw)));
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
  values(p_product_id,owner_id,request_id,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,p_expected_revision,rev,jsonb_build_object('record_ids',(select coalesce(jsonb_agg(v->>'id'),'[]'::jsonb) from jsonb_array_elements(changes) v),'operation_id',op_id));
 delete from public.pi_visual_receipts where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key;
 insert into public.pi_visual_receipts(product_id,user_id,tool,idempotency_key,payload_hash,result) values(p_product_id,owner_id,p_tool,p_key,p_hash,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.pi_set_product_gallery(p_access jsonb, p_product_id uuid, p_expected_revision bigint, p_etag text, p_stamp text, p_key text, p_hash text, p_records jsonb, p_native jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid; result jsonb; item jsonb; before_state jsonb;
begin
 if p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 -- Los reintentos no vuelven a aplicar una selección antigua.
 select r.result into result from public.pi_visual_receipts r where r.product_id=p_product_id and r.user_id=owner_id and r.tool='review_visual_record' and r.idempotency_key=p_key and r.expires_at>clock_timestamp() and r.payload_hash=p_hash;
 if result is not null then return result; end if;
 if jsonb_typeof(p_native)<>'array' or jsonb_array_length(p_native)>6 then raise exception 'PI_VALIDATION_ERROR'; end if;
 for item in select value from jsonb_array_elements(p_native) loop
  if item->>'slot' not in ('cover','gallery') or (item->>'position')::int not between 1 and 5 or not exists(
   select 1 from public.page_images i where i.id=(item->>'id')::uuid and i.product_id=p_product_id and i.user_id=owner_id and i.slot in ('cover','gallery') and i.visual_binding_id is null and i.status<>'rejected' and i.render_status='succeeded'
   and (i.source<>'reference' or exists(select 1 from public.product_reference_images r where r.id=i.reference_image_id and not r.excluded))) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slot',slot,'position',position)),'[]') into before_state from public.page_images where product_id=p_product_id and user_id=owner_id and slot in ('cover','gallery') and status='approved';
 if p_stamp like 'gallery:%' then
   if substring(p_stamp from 9) is distinct from public.pi_product_gallery_etag(p_product_id,owner_id) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 elsif p_expected_revision is distinct from coalesce((select revision from public.product_intelligence where product_id=p_product_id),0) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 result:=public.pi_commit_visual(p_access,p_product_id,'review_visual_record',p_expected_revision,p_etag,p_stamp,p_key,p_hash,p_records,false,null);
 perform set_config('pi.visual_projection','true',true);
 update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp() where product_id=p_product_id and user_id=owner_id and slot in ('cover','gallery') and status='approved' and visual_binding_id is null;
 for item in select value from jsonb_array_elements(p_native) loop
  update public.page_images set slot=item->>'slot',status='approved',position=(item->>'position')::int,decided_at=clock_timestamp(),updated_at=clock_timestamp() where id=(item->>'id')::uuid and product_id=p_product_id and user_id=owner_id;
 end loop;
 perform set_config('pi.visual_projection','false',true);
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,gen_random_uuid(),'select_product_images',p_access->>'actor_id',p_expected_revision,(result->>'revision')::bigint,jsonb_build_object('before',before_state,'native',p_native));
 return result;
end $function$;

create or replace function public.pi_tip_usable(p_product_id uuid,p_owner_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p.usage_tip is not null and coalesce(p.usage_tip->>'status','generated')<>'rejected'
   and p.usage_tip->>'discarded_at' is null
 from public.products p where p.id=p_product_id and p.user_id=p_owner_id
$$;

notify pgrst,'reload schema';
commit;
