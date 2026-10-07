-- Planificación persuasiva y ejecución. Sin IA, Storage nuevo ni migración de PDPs legacy.
alter table public.products add column pdp_persuasion_enabled boolean not null default false;
create table public.pi_persuasion_plans (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, user_id uuid not null,
 strategy_id uuid not null, angle_id uuid not null, landing_angle_id text not null check(landing_angle_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 revision bigint not null check(revision between 1 and 9007199254740991), etag text not null check(etag ~ '^[a-f0-9]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=60000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,product_id,user_id),
 foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
 foreign key(strategy_id,product_id,user_id) references public.pi_strategy_versions(id,product_id,user_id) on delete cascade,
 foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade
);
create index pi_persuasion_selection on public.pi_persuasion_plans(product_id,strategy_id,angle_id);
create table public.pi_landing_experiences (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, user_id uuid not null,
 persuasion_plan_id uuid not null, strategy_id uuid not null, angle_id uuid not null,
 landing_angle_id text not null, landing_hook_id text, experience_key text not null,
 status text not null check(status in ('draft','review','active','archived')), is_default boolean not null,
 revision bigint not null check(revision between 1 and 9007199254740991), etag text not null check(etag ~ '^[a-f0-9]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=60000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,product_id,user_id), unique(product_id,experience_key),
 foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
 foreign key(persuasion_plan_id,product_id,user_id) references public.pi_persuasion_plans(id,product_id,user_id) on delete cascade,
 foreign key(strategy_id,product_id,user_id) references public.pi_strategy_versions(id,product_id,user_id) on delete cascade,
 foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade,
 check(landing_angle_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 check(landing_hook_id is null or landing_hook_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 check(experience_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
);
create unique index pi_experience_active_route on public.pi_landing_experiences(product_id,landing_angle_id,coalesce(landing_hook_id,'')) where status='active';
create unique index pi_experience_active_default on public.pi_landing_experiences(product_id) where status='active' and is_default;
create table public.pi_pdp_revisions (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, user_id uuid not null,
 plan_id uuid, experience_id uuid, revision bigint not null, etag text not null, payload jsonb not null, issues jsonb not null,
 actor_id text not null, actor_kind text not null, created_at timestamptz not null default now(),
 check((plan_id is null) <> (experience_id is null)), unique(plan_id,revision), unique(experience_id,revision),
 foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
 foreign key(plan_id,product_id,user_id) references public.pi_persuasion_plans(id,product_id,user_id) on delete cascade,
 foreign key(experience_id,product_id,user_id) references public.pi_landing_experiences(id,product_id,user_id) on delete cascade
);
create trigger pi_pdp_history_immutable before update or delete on public.pi_pdp_revisions for each row execute function public.pi_immutable_context_history();
do $$ declare t text; begin
 foreach t in array array['pi_persuasion_plans','pi_landing_experiences','pi_pdp_revisions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels','save_ugc_content','generate_ugc',
 'save_creative_content','save_gallery_content','save_event_content','save_usage_tip','save_product_learning','generate_gallery_images','save_angle_persuasion_plan','save_landing_experience'));

create function public.pi_pdp_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',(select pdp_persuasion_enabled from public.products where id=p_product_id and user_id=p_owner_id),
  'snapshot',public.pi_context_snapshot(p_product_id),'landing',public.pi_landing_state(p_product_id,p_owner_id),
  'empty_etag',public.pi_snapshot_hash('null'::jsonb),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_persuasion_plans where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'experiences',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'etag',etag,'payload',payload) order by created_at desc,id)
    from public.pi_landing_experiences where product_id=p_product_id and user_id=p_owner_id),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('source',source,'id',id,'role',role,'slot',slot,'selected',selected)) order by source,id) from (
    select id,'reference'::text as source,'hero'::text as role,null::text as slot,null::boolean as selected from public.product_reference_images where product_id=p_product_id and user_id=p_owner_id and not excluded
    union all select id,'page_image','explanation',slot,(status='approved') from public.page_images where product_id=p_product_id and user_id=p_owner_id
     and source<>'reference' and render_status='succeeded' and status<>'rejected' and storage_path is not null
    union all select id,'ugc','demo',null::text,true from public.video_scripts where product_id=p_product_id and user_id=p_owner_id and superseded_at is null
     and final_status='approved' and approved_at is not null and final_storage_path is not null
  ) a),'[]'::jsonb))
$$;
create function public.pi_load_persuasion(p_access jsonb,p_product_id uuid,p_strategy_id uuid default null,p_tool text default null,
 p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; scope text;
begin
 scope:=case when p_tool is null then 'product_intelligence:read' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if p_tool is not null and p_tool not in ('save_angle_persuasion_plan','save_landing_experience') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not (select pdp_persuasion_enabled from public.products where id=p_product_id) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_tool is not null and not p_dry_run then
  select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
  if found then
   if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
   perform public.pi_authorize_context(p_access,'product_intelligence:read');
   return jsonb_build_object('replay',receipt.result);
  end if;
 end if;
 state:=public.pi_pdp_state(p_product_id,owner_id);
 if jsonb_array_length(state->'assets')>500 then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 return (state-'snapshot')||jsonb_build_object('knowledge',public.pi_load_knowledge(p_access,p_product_id,p_strategy_id=>p_strategy_id),
  'planning_stamp',public.pi_snapshot_hash(state));
end $$;

-- Los validadores semánticos corren en el servicio; SQL revalida identidad, autorización,
-- dependencias, stamp, budgets y transiciones bajo el mismo lock de producto.
create function public.pi_commit_persuasion(p_access jsonb,p_product_id uuid,p_tool text,p_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
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
 if p_payload->>'status' in ('approved','active') and p_access->>'actor_kind'<>'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 if jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections') not between 1 and 9
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
    or (select count(*) from jsonb_array_elements(p_payload->'sections') s where s->>'kind'='support')>least(2,(p_payload->'attention_budget'->>'max_support_sections')::int)
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
revoke all on function public.pi_pdp_state(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pi_load_persuasion(jsonb,uuid,uuid,text,text,text,boolean),public.pi_commit_persuasion(jsonb,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_persuasion(jsonb,uuid,uuid,text,text,text,boolean),public.pi_commit_persuasion(jsonb,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb,boolean) to service_role;
