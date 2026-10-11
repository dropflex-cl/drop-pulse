-- La aprobación no recupera descartados. Editar conserva visibilidad y deja historial.
-- RPC de representación y publicación; conserva permisos de service_role.

begin;

create or replace function public.pi_commit_landing_legacy(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from public.pi_snapshot_hash(state->'rows') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if jsonb_array_length(state->'active_runs')>0 then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 27
   or octet_length(p_entries::text)>262144 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not (e->>'component'=any(ids)) or jsonb_typeof(e->'content') not in ('object','array'))
   or (select count(distinct e->>'component') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   run_id:=gen_random_uuid();
   insert into public.copy_runs(id,product_id,user_id,status,input,payload,started_at,finished_at)
     values(run_id,p_product_id,owner_id,'succeeded',jsonb_build_object('source','mcp_chat','contract_version','1.1','analysis_revision',rev,
       'actor_id',p_access->>'actor_id','snapshot',snap),jsonb_build_object('entries',p_entries),now(),now());
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
   perform public.pi_validate_landing_variants(part->'content',p_product_id,owner_id);
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if not public.pi_landing_content_is_empty(part->'content') and part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   if not p_dry_run then
   update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,content,enabled,images,status,decided_at)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',existing.content,case when existing.status='rejected' then false else coalesce(existing.enabled,true) end,coalesce(existing.images,'[]'::jsonb),case when existing.status='rejected' then 'rejected'::public.content_status else 'approved'::public.content_status end,case when automatic then clock_timestamp() else null end);
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status',case when existing.status='rejected' then 'rejected' else 'approved' end));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action',case when automatic then 'Contenido aprobado automáticamente. Publicar es una acción aparte.' else 'Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

create or replace function public.pi_review_landing(p_access jsonb,p_product_id uuid,p_component text,p_id uuid,p_updated_at timestamptz,p_stamp text,p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
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
 if public.pi_snapshot_hash(jsonb_build_array(state,snap)) is distinct from p_stamp then raise exception 'PI_REVISION_CONFLICT'; end if;
 pending_content:=case when p_patch ? 'content' then p_patch->'content' else coalesce(row.content,row.proposal) end;
 approving:=coalesce((p_patch->>'approve')::boolean,false) or p_patch ? 'content' or p_patch ? 'images' or p_patch->>'enabled'='true';
 if approving then perform public.pi_validate_landing_variants(pending_content,p_product_id,owner_id); end if;
 update public.page_components set
   content=case when p_patch ? 'content' then case when pending_content=proposal then null else pending_content end else page_components.content end,
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
end $$;

-- Selección manual de portada/galería. La validación visual permanece en pi_commit_visual;
-- las filas nativas son una proyección, nunca una copia paralela del archivo.
create or replace function public.pi_set_product_gallery(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,p_key text,p_hash text,p_records jsonb,p_native jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 result:=public.pi_commit_visual(p_access,p_product_id,'review_visual_record',p_expected_revision,p_etag,p_stamp,p_key,p_hash,p_records,false,null);
 perform set_config('pi.visual_projection','true',true);
 update public.page_images set status='generated',position=null,decided_at=null,updated_at=clock_timestamp() where product_id=p_product_id and user_id=owner_id and slot in ('cover','gallery') and status='approved' and visual_binding_id is null;
 for item in select value from jsonb_array_elements(p_native) loop
  update public.page_images set slot=item->>'slot',status='approved',position=(item->>'position')::int,decided_at=clock_timestamp(),updated_at=clock_timestamp() where id=(item->>'id')::uuid and product_id=p_product_id and user_id=owner_id;
 end loop;
 perform set_config('pi.visual_projection','false',true);
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,gen_random_uuid(),'select_product_images',p_access->>'actor_id',p_expected_revision,(result->>'revision')::bigint,jsonb_build_object('before',before_state,'native',p_native));
 return result;
end $$;
revoke all on function public.pi_set_product_gallery(jsonb,uuid,bigint,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pi_set_product_gallery(jsonb,uuid,bigint,text,text,text,text,jsonb,jsonb) to service_role;

create or replace function public.pi_claim_product_publication(p_access jsonb,p_product_id uuid,p_shop text) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 if exists(select 1 from public.product_publications where product_id=p_product_id and user_id=owner_id and status='publishing' and updated_at>clock_timestamp()-interval '10 minutes') then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
 insert into public.product_publications(product_id,user_id,shop_domain,status,error_message,started_at,updated_at)
 values(p_product_id,owner_id,p_shop,'publishing',null,clock_timestamp(),clock_timestamp())
 on conflict(product_id) do update set status='publishing',error_message=null,started_at=clock_timestamp(),updated_at=clock_timestamp();
end $$;
revoke all on function public.pi_claim_product_publication(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pi_claim_product_publication(jsonb,uuid,text) to service_role;

-- Promoción de variante principal sin rutas ambiguas ni pérdida de historia.
create or replace function public.pi_commit_persuasion(p_access jsonb,p_product_id uuid,p_tool text,p_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_payload jsonb,p_issues jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(state) then raise exception 'PI_REVISION_CONFLICT'; end if;
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
 if old_payload is not null and (old_payload->>'strategy_id',old_payload->>'angle_id',old_payload->>'landing_angle_id') is distinct from
   (p_payload->>'strategy_id',p_payload->>'angle_id',p_payload->>'landing_angle_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if not exists(select 1 from public.pi_strategy_versions v where v.id=strategy_id and v.product_id=p_product_id and v.user_id=owner_id
   and exists(select 1 from jsonb_array_elements(v.snapshot->'angles') a where a->>'id'=angle_id::text))
   or not exists(select 1 from public.pi_angles a where a.id=angle_id and a.product_id=p_product_id and a.user_id=owner_id and a.lifecycle='active') then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_payload->>'status' in ('draft','review') then
  p_payload:=jsonb_set(p_payload,'{status}',to_jsonb(case when p_tool='save_angle_persuasion_plan' then 'approved'::text else 'active'::text end));
 end if;
 if p_payload->>'status' in ('review','approved','active') and exists(select 1 from jsonb_array_elements(p_issues) i where i->>'severity'='error') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_payload->>'status' in ('approved','active') and p_access->>'actor_kind'<>'merchant' and not (strategy_id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)) then raise exception 'PI_FORBIDDEN'; end if;
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
  if exists(select 1 from public.pi_landing_experiences where persuasion_plan_id=p_id and status='active') then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='primary')>least(7,(p_payload->'attention_budget'->>'max_primary_sections')::int)
    or (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='support')>least(26,(p_payload->'attention_budget'->>'max_support_sections')::int)
    or jsonb_array_length(p_payload->'beliefs') not between 4 and 7 or p_payload->>'status' not in ('draft','review','approved','archived') then raise exception 'PI_VALIDATION_ERROR'; end if;
 else
  select * into plan from public.pi_persuasion_plans where id=(p_payload->>'persuasion_plan_id')::uuid and product_id=p_product_id and user_id=owner_id;
  if not found or (plan.strategy_id,plan.angle_id,plan.landing_angle_id,plan.revision) is distinct from
    (strategy_id,angle_id,p_payload->>'landing_angle_id',(p_payload->>'plan_revision')::bigint) then raise exception 'PI_INVALID_REFERENCE'; end if;
  if p_payload->>'status'='active' and plan.payload->>'status'<>'approved' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_payload->>'status'='active' and exists(select 1 from public.pi_landing_experiences e where e.product_id=p_product_id and e.id is distinct from p_id and e.status='active'
    and (e.landing_angle_id=p_payload->>'landing_angle_id' and coalesce(e.landing_hook_id,'')=coalesce(p_payload->>'landing_hook_id',''))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  for section in select value from jsonb_array_elements(p_payload->'sections') where value->>'enabled'='true' loop
   if not exists(select 1 from jsonb_array_elements(plan.payload->'sections') s where s->>'section_key'=section->>'section_key' and s->>'primary_job'=section->>'persuasion_job') then raise exception 'PI_INVALID_REFERENCE'; end if;
   select * into row from public.page_components where product_id=p_product_id and user_id=owner_id and component=section->>'component' and superseded_at is null;
   target:=coalesce(row.content,row.proposal);
   if jsonb_typeof(target)='array' then select value into target from jsonb_array_elements(target) v where v->>'key'=section->>'content_variant_key';
   elsif section->>'content_variant_key'<>'default' then target:=null; end if;
   if p_payload->>'status'='active' and (target is null or not row.enabled or row.status not in ('approved','published')) then raise exception 'PI_INVALID_REFERENCE'; end if;
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
   on conflict(id) do update set revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
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
   on conflict(id) do update set persuasion_plan_id=excluded.persuasion_plan_id,landing_hook_id=excluded.landing_hook_id,experience_key=excluded.experience_key,status=excluded.status,
    is_default=excluded.is_default,revision=excluded.revision,etag=excluded.etag,payload=excluded.payload,updated_at=clock_timestamp();
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
end $$;


COMMIT;
