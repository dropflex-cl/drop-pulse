-- Etiquetas del chat sobre pack_labels; aprobación humana y revisión/precio bajo el mismo lock.
alter table public.pack_labels add column source text not null default 'legacy' check(source in ('legacy','mcp_chat')),
 add column provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'), add column superseded_at timestamptz;
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels'));

create function public.pi_pack_evidence_stale(p_provenance jsonb,p_product_id uuid,p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from jsonb_array_elements_text(coalesce(p_provenance->'duration_fact_ids','[]'::jsonb)) requested(id)
   where not exists(select 1 from public.pi_facts f where f.id=requested.id::uuid and f.product_id=p_product_id and f.user_id=p_owner_id
     and f.verification_status='verified' and f.usage_status='approved'
     and f.last_revision=coalesce((p_provenance->'reviewed_fact_revisions'->>requested.id)::bigint,
       (select (v->>'last_revision')::bigint from jsonb_array_elements(p_provenance->'snapshot'->'knowledge'->'graph'->'Fact') v where v->>'id'=requested.id)))
     or exists(select 1 from public.pi_fact_evidence e where e.fact_id=requested.id::uuid and e.product_id=p_product_id and e.user_id=p_owner_id and e.relation='contradicts'))
$$;

create or replace function public.pi_operational_snapshot(p_product_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'catalog',jsonb_build_object('id',p.id,'title',p.title,'shopify_product_id',p.shopify_product_id,'currency',p.currency,'is_upsell',p.is_upsell),
   'context',(select jsonb_build_object('display_name',i.display_name,'category',i.category,'description',i.description,
     'supplier_text',i.supplier_text,'last_revision',i.last_revision,'base_reference_image_id',
     (select r.id from public.product_reference_images r where r.product_id = p.id and r.user_id = p.user_id and not r.excluded
       order by r.is_base desc,r.is_cover desc,r.position,r.id limit 1)) from public.pi_product_inputs i where i.product_id = p.id),
   'pricing',(select to_jsonb(r)-'created_at'-'updated_at'-'user_id'-'product_id' from public.product_pricing r where r.product_id = p.id and r.user_id = p.user_id),
   'settings',(select to_jsonb(s)-'user_id'-'updated_at'-'ai_cost_cap' from public.merchant_settings s where s.user_id = p.user_id),
   'numbers',(select o.numbers from public.onboarding o where o.user_id = p.user_id),
   'pack_labels',(select jsonb_build_object('status',l.status,'payload',l.payload,'prices',l.prices,'source',l.source,'currency',l.provenance->>'currency','evidence_stale',public.pi_pack_evidence_stale(l.provenance,l.product_id,l.user_id),'duration_fact_ids',coalesce(l.provenance->'duration_fact_ids','[]'::jsonb)) from public.pack_labels l
     where l.product_id = p.id and l.user_id = p.user_id and l.status <> 'rejected' and l.superseded_at is null order by l.created_at desc,l.id desc limit 1),
   'images',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'is_base',r.is_base,'is_cover',r.is_cover,'excluded',r.excluded,'position',r.position) order by r.position,r.id)
     from public.product_reference_images r where r.product_id = p.id and r.user_id = p.user_id),'[]'::jsonb)
 ) from public.products p where p.id = p_product_id;
$$;

create function public.pi_pack_labels_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('current',(select (to_jsonb(l)-'provenance')||jsonb_build_object('provenance',l.provenance-'snapshot','catalog_currency',(select currency from public.products where id=p_product_id and user_id=p_owner_id),'evidence_stale',public.pi_pack_evidence_stale(l.provenance,l.product_id,l.user_id))
   from public.pack_labels l where l.product_id=p_product_id and l.user_id=p_owner_id and l.superseded_at is null and l.status<>'rejected'
   order by l.created_at desc,l.id desc limit 1),
   'etag',public.pi_snapshot_hash(jsonb_build_array((select currency from public.products where id=p_product_id and user_id=p_owner_id),(select to_jsonb(p)-'created_at'-'updated_at'-'user_id'-'product_id' from public.product_pricing p where p.product_id=p_product_id and p.user_id=p_owner_id),coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.pack_labels l
     where l.product_id=p_product_id and l.user_id=p_owner_id and l.superseded_at is null),'[]'::jsonb))))
$$;
create function public.pi_load_pack_labels(p_access jsonb,p_product_id uuid,p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; receipt public.pi_idempotency_records; scope text;
begin
 scope:=case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if p_key is not null and not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_pack_labels'
     and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return jsonb_build_object('replay',receipt.result);
   end if;
 end if;
 state:=public.pi_pack_labels_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 return jsonb_build_object('current',state->'current','snapshot',snap,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'pack_labels_etag',state->>'etag','stamp',public.pi_snapshot_hash(jsonb_build_array(state,snap)));
end $$;

create function public.pi_commit_pack_labels(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_action text,p_labels jsonb,p_fact_ids jsonb default '[]'::jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 row public.pack_labels; new_id uuid; request_id uuid:=gen_random_uuid(); pack_prices jsonb; target_status public.content_status;
 changed boolean; facts uuid[]; entry jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_action is distinct from 'propose' and p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
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
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from state->>'etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
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
 target_status:=case when p_action in ('approve','edit_approve') then 'approved'::public.content_status when p_action='propose' then 'generated'::public.content_status else 'in_review'::public.content_status end;
 if p_action in ('approve','reopen') and p_labels is distinct from row.payload then raise exception 'PI_VALIDATION_ERROR'; end if;
 changed:=case when p_action='propose' then row.source is distinct from 'mcp_chat' or public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id) or row.payload is distinct from p_labels or row.prices is distinct from pack_prices or coalesce(row.provenance->'duration_fact_ids','[]'::jsonb) is distinct from p_fact_ids or row.provenance->>'currency' is distinct from snap->'pricing'->>'currency'
   else (p_action<>'reopen' and row.source='mcp_chat' and row.provenance->>'currency' is distinct from snap->'pricing'->>'currency') or (p_action<>'reopen' and public.pi_pack_evidence_stale(row.provenance,p_product_id,owner_id)) or row.status is distinct from target_status or row.payload is distinct from p_labels or (p_action<>'reopen' and row.prices is distinct from pack_prices) end;
 if not changed then target_status:=row.status; end if;
 new_id:=row.id;
 if changed and not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   perform set_config('pi.pack_labels_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   if p_action='propose' then
     update public.pack_labels set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     new_id:=gen_random_uuid();
     insert into public.pack_labels(id,product_id,user_id,payload,prices,status,prompt_version,model,source,provenance)
       values(new_id,p_product_id,owner_id,p_labels,pack_prices,'generated',0,'chat','mcp_chat',jsonb_build_object('contract_version','1.0',
         'duration_fact_ids',p_fact_ids,'currency',snap->'pricing'->>'currency','analysis_revision',rev,'actor_id',p_access->>'actor_id','snapshot',snap));
   else
     update public.pack_labels set payload=p_labels,prices=case when p_action='reopen' then row.prices else pack_prices end,status=target_status,
       provenance=case when p_action in ('approve','edit_approve') then row.provenance||jsonb_build_object('currency',snap->'pricing'->>'currency','reviewed_fact_revisions',
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
   'status',target_status,'pack_labels_etag',state->>'etag','next_action','Revisa y acepta las etiquetas en Información base. Publica desde la etapa Publicar.'));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_pack_labels' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_pack_labels',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

-- Frena un writer legacy en vuelo y una decisión sobre filas reemplazadas; conserva cascadas.
create function public.pi_guard_pack_labels() returns trigger language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and (new.product_id,new.user_id) is distinct from (old.product_id,old.user_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select pi_deleting_at into deleting from public.products where id=new.product_id and user_id=new.user_id for update;
 if not found or deleting is not null then raise exception 'PI_NOT_FOUND'; end if;
 if current_setting('pi.pack_labels_commit',true) is distinct from 'true' then
   if new.source='mcp_chat' or (tg_op='UPDATE' and old.superseded_at is not null) or exists(select 1 from public.pack_labels where product_id=new.product_id and user_id=new.user_id and source='mcp_chat') then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 end if;
 return new;
end $$;
create trigger pi_pack_labels_guard before insert or update or delete on public.pack_labels for each row execute function public.pi_guard_pack_labels();
revoke all on function public.pi_pack_evidence_stale(jsonb,uuid,uuid),public.pi_pack_labels_state(uuid,uuid),public.pi_guard_pack_labels() from public,anon,authenticated,service_role;
revoke all on function public.pi_load_pack_labels(jsonb,uuid,text,text,boolean),public.pi_commit_pack_labels(jsonb,uuid,bigint,text,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_pack_labels(jsonb,uuid,text,text,boolean),public.pi_commit_pack_labels(jsonb,uuid,bigint,text,text,text,text,text,jsonb,jsonb,boolean) to service_role;
