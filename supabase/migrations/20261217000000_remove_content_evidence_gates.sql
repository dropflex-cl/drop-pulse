-- Evidencia como procedencia opcional, sin requisitos de uso del contenido.
-- Conserva propietario, permisos, CAS, idempotencia, archivos y decisiones explícitas.

-- Alias conservado para lectores anteriores: la procedencia no invalida etiquetas.
CREATE OR REPLACE FUNCTION public.pi_pack_evidence_stale(p_provenance jsonb, p_product_id uuid, p_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT false $function$;

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
 if p_action<>'reopen' and exists(select 1 from unnest(facts) id where not exists(select 1 from public.pi_facts f where f.id=id and f.product_id=p_product_id and f.user_id=owner_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
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
   not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p_product_id and f.user_id=owner_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind in ('creative','gallery') then
   selected_id:=(snap->'knowledge'->>'active_strategy_id')::uuid;
   if selected_id is null or p_content->>'strategy_id' is distinct from selected_id::text or
     jsonb_typeof(p_content->'angle_ids') is distinct from 'array'
     or jsonb_array_length(p_content->'angle_ids') not between 1 and 3
     or exists(select 1 from jsonb_array_elements_text(p_content->'angle_ids') a(id) where not exists(select 1 from public.pi_angles b where b.id=a.id::uuid and b.product_id=p_product_id and b.user_id=owner_id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
 end if;
 if p_kind='event' and not exists(select 1 from public.events where id=(p_content->>'event_id')::uuid and status='published') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind='tip' and (length(trim(p_content->>'text')) not between 1 and 140) then raise exception 'PI_VALIDATION_ERROR'; end if;
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
