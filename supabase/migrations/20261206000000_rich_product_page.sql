-- PDP completa: componentes visibles por defecto. Se conservan las decisiones explícitas de apagar.
-- Sin cambiar las autorizaciones de publicación ni la aprobación del contenido.
alter table public.page_components alter column enabled set default true;

create or replace function public.pi_landing_content_is_empty(p_content jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case jsonb_typeof(p_content)
 when 'object' then p_content=jsonb_build_object('state','empty')
 when 'array' then jsonb_array_length(p_content)>0 and not exists(select 1 from jsonb_array_elements(p_content) v where v->'content' is distinct from jsonb_build_object('state','empty'))
 else false end
$$;
revoke all on function public.pi_landing_content_is_empty(jsonb) from public,anon,authenticated;
grant execute on function public.pi_landing_content_is_empty(jsonb) to service_role;
create or replace function public.pi_commit_persuasion(p_access jsonb,p_product_id uuid,p_tool text,p_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_payload jsonb,p_issues jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; old_payload jsonb; old_etag text; old_rev bigint;
 new_id uuid; new_rev bigint; new_etag text; rev bigint; strategy_id uuid; angle_id uuid; plan public.pi_persuasion_plans; result jsonb;
 request_id uuid:=gen_random_uuid(); ref jsonb; section jsonb; row public.page_components; target jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null and pdp_persuasion_enabled for update;
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
 if p_payload->>'status' in ('review','approved','active') and exists(select 1 from jsonb_array_elements(p_issues) i where i->>'severity'='error') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_payload->>'status' in ('approved','active') and p_access->>'actor_kind'<>'merchant' and not (public.pi_shopify_automation_active(p_access,p_product_id) and strategy_id=(select active_strategy_id from public.product_intelligence where product_id=p_product_id)) then raise exception 'PI_FORBIDDEN'; end if;
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
    and ((e.landing_angle_id=p_payload->>'landing_angle_id' and coalesce(e.landing_hook_id,'')=coalesce(p_payload->>'landing_hook_id','')) or (e.is_default and (p_payload->>'is_default')::boolean))) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
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
 automatic:=public.pi_shopify_automation_active(p_access,p_product_id);
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
   if not p_dry_run then
     select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
   update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,enabled,images,status,decided_at)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',coalesce(existing.enabled,true),coalesce(existing.images,'[]'::jsonb),case when automatic then 'approved'::public.content_status else 'generated'::public.content_status end,case when automatic then clock_timestamp() else null end);
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status',case when automatic then 'approved' else 'generated' end));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action',case when automatic then 'Contenido aprobado automáticamente. Completa imágenes y experiencias; publica con publish_product.' else 'Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.' end));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;
