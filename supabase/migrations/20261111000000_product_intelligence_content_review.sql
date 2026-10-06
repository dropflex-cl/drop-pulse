-- El consejo del chat requiere revisión humana antes de entrar a los mensajes operativos.
create function public.pi_tip_proposal() returns trigger language plpgsql set search_path='' as $$
begin
 if new.usage_tip->>'source'='mcp_chat' and new.usage_tip->>'status' is null then
   new.usage_tip:=new.usage_tip||jsonb_build_object('status','in_review');
 end if;
 return new;
end $$;
create trigger pi_tip_proposal before insert or update of usage_tip on public.products for each row execute function public.pi_tip_proposal();

create function public.pi_tip_usable(p_product_id uuid,p_owner_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p.usage_tip is not null and (p.usage_tip->>'source' is distinct from 'mcp_chat' or (p.usage_tip->>'status'='approved'
   and not exists(select 1 from jsonb_array_elements_text(p.usage_tip->'provenance'->'content'->'fact_ids') r(id) where
     not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p.id and f.user_id=p_owner_id
       and f.usage_status='approved' and f.verification_status='verified' and f.last_revision=(p.usage_tip->'reviewed_fact_revisions'->>r.id)::bigint)
     or exists(select 1 from public.pi_fact_evidence e where e.fact_id=r.id::uuid and e.product_id=p.id and e.relation='contradicts'))))
 from public.products p where p.id=p_product_id and p.user_id=p_owner_id
$$;
create function public.pi_review_tip(p_access jsonb,p_product_id uuid,p_etag text,p_stamp text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; tip jsonb; facts jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind' is distinct from 'merchant' or p_action not in ('approve','reopen') then raise exception 'PI_FORBIDDEN'; end if;
 select usage_tip into tip from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found or tip is null then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 state:=public.pi_content_state(p_product_id,owner_id,'tip'); snap:=public.pi_context_snapshot(p_product_id);
 if state->>'content_etag' is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if public.pi_snapshot_hash(jsonb_build_array(state,snap)) is distinct from p_stamp then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_action='approve' and tip->>'source'='mcp_chat' then
   if exists(select 1 from jsonb_array_elements_text(tip->'provenance'->'content'->'fact_ids') r(id) where
     not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p_product_id and f.user_id=owner_id and f.usage_status='approved' and f.verification_status='verified')
     or exists(select 1 from public.pi_fact_evidence e where e.fact_id=r.id::uuid and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
   select jsonb_object_agg(f.id::text,f.last_revision) into facts from public.pi_facts f where f.product_id=p_product_id and f.user_id=owner_id and tip->'provenance'->'content'->'fact_ids' ? f.id::text;
 end if;
 perform set_config('pi.explicit_context_commit','true',true);
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 update public.products set usage_tip=tip||jsonb_build_object('status',case when p_action='approve' then 'approved' else 'in_review' end,'reviewed_fact_revisions',facts),updated_at=now() where id=p_product_id;
 snap:=public.pi_context_snapshot(p_product_id);
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
 insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev+1,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,gen_random_uuid(),'usage_tip_'||p_action,p_access->>'actor_id',rev,rev+1,jsonb_build_object('before',tip,'status',p_action));
end $$;
create function public.pi_load_tip_review(p_access jsonb,p_product_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 state:=public.pi_load_content(p_access,p_product_id,'tip');
 return state||jsonb_build_object('usable',coalesce(public.pi_tip_usable(p_product_id,owner_id),false));
end $$;
revoke all on function public.pi_tip_proposal(),public.pi_tip_usable(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pi_review_tip(jsonb,uuid,text,text,text), public.pi_load_tip_review(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pi_review_tip(jsonb,uuid,text,text,text), public.pi_load_tip_review(jsonb,uuid) to service_role;
