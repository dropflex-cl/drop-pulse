-- Texto escrito en chat → componentes existentes. Sin IA, jobs, archivos ni publicación.
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content'));

create function public.pi_landing_state(p_product_id uuid,p_owner_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.page_components c
   where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',coalesce(r.body_edited,case when r.use_translation then coalesce(r.body_translated,r.body_original) else coalesce(r.body_original,r.body_translated) end,''),'rating',r.rating) order by r.id)
     from (select * from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0 order by position,id limit 30) r),'[]'::jsonb),
   'review_count',(select count(*) from public.product_reviews where product_id=p_product_id and user_id=p_owner_id and status in ('approved','published') and length(trim(coalesce(body_edited,case when use_translation then coalesce(body_translated,body_original) else coalesce(body_original,body_translated) end,'')))>0),
   'active_runs',coalesce((select jsonb_agg(id order by id) from public.copy_runs where product_id=p_product_id and user_id=p_owner_id and status in ('queued','running')),'[]'::jsonb))
$$;

create function public.pi_load_landing(p_access jsonb,p_product_id uuid,p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
   'context_stale',exists(select 1 from public.page_components c join public.copy_runs r on r.id=c.run_id
     where c.product_id=p_product_id and c.user_id=owner_id and c.superseded_at is null and r.input->>'source'='mcp_chat'
       and public.pi_snapshot_hash(r.input->'snapshot') is distinct from public.pi_snapshot_hash(snap)),
   'landing_etag',public.pi_snapshot_hash(state->'rows'),'stamp',public.pi_snapshot_hash(jsonb_build_array(state,snap)));
end $$;

create function public.pi_commit_landing(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_entries jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; state jsonb; snap jsonb; rev bigint; receipt public.pi_idempotency_records; result jsonb;
 run_id uuid; request_id uuid:=gen_random_uuid(); part jsonb; existing public.page_components; component_id uuid; items jsonb:='[]'::jsonb;
 ids text[]:=array['listing','review-stars','benefit-usps','inventory','shipping-timeline','benefit-double-box','gif-strip','review-slider',
 'ugc-slider','pain-block','stats-with-image','scrolling-benefits','image-with-benefits','insta-story','review-wall','comparison-table','faq-and-text'];
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
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
 if snap->'pricing'='null'::jsonb or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 17
   or octet_length(p_entries::text)>262144 or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not (e->>'component'=any(ids)) or jsonb_typeof(e->'content') is distinct from 'object')
   or (select count(distinct e->>'component') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   run_id:=gen_random_uuid();
   insert into public.copy_runs(id,product_id,user_id,status,input,payload,started_at,finished_at)
     values(run_id,p_product_id,owner_id,'succeeded',jsonb_build_object('source','mcp_chat','contract_version','1.0','analysis_revision',rev,
       'actor_id',p_access->>'actor_id','snapshot',snap),jsonb_build_object('entries',p_entries),now(),now());
 end if;
 for part in select value from jsonb_array_elements(p_entries) loop
   if part->>'component' in ('review-stars','review-slider') and (state->>'review_count')::int<3 then raise exception 'PI_INVALID_REFERENCE'; end if;
   if part->>'component'='review-wall' and (state->>'review_count')::int<4 then raise exception 'PI_INVALID_REFERENCE'; end if;
   component_id:=null;
   if not p_dry_run then
     select * into existing from public.page_components where product_id=p_product_id and user_id=owner_id and component=part->>'component' and superseded_at is null;
     update public.page_components set superseded_at=now(),updated_at=now() where id=existing.id;
     component_id:=gen_random_uuid();
     insert into public.page_components(id,product_id,user_id,run_id,component,position,proposal,enabled,images,status)
       values(component_id,p_product_id,owner_id,run_id,part->>'component',array_position(ids,part->>'component')-1,
         part->'content',part->>'component'='listing',coalesce(existing.images,'[]'::jsonb),'generated');
   end if;
   items:=items||jsonb_build_array(jsonb_build_object('component',part->>'component','id',component_id,'status','generated'));
 end loop;
 state:=public.pi_landing_state(p_product_id,owner_id);
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object(
   'applied',not p_dry_run,'dry_run',p_dry_run,'run_id',run_id,'landing_etag',public.pi_snapshot_hash(state->'rows'),'components',items,
   'next_action','Revisa, edita y aprueba el contenido en Página del producto. Publica desde la etapa Publicar.'));
 if p_dry_run then return result; end if;
 insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
 insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
   values(p_product_id,owner_id,request_id,'save_landing_content',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev,items);
 delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and (expires_at<=now() or (tool='save_landing_content' and idempotency_key=p_key));
 insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
   values(p_product_id,owner_id,'save_landing_content',p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 return result;
end $$;

-- Las escrituras UI/legacy también participan del mismo lock y respetan el borrado.
create function public.pi_serialize_page_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_product_id uuid; target_owner_id uuid; deleting timestamptz;
begin
 if tg_op='DELETE' then target_product_id:=old.product_id; target_owner_id:=old.user_id; else target_product_id:=new.product_id; target_owner_id:=new.user_id; end if;
 if tg_op='UPDATE' and (new.product_id,new.user_id) is distinct from (old.product_id,old.user_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 select p.pi_deleting_at into deleting from public.products p where p.id=target_product_id and p.user_id=target_owner_id for update;
 if tg_op='DELETE' then return old; end if;
 if not found or deleting is not null then raise exception 'PI_NOT_FOUND'; end if;
 if tg_table_name='copy_runs' then
   if new.status in ('queued','running') and coalesce(new.input->>'source','')<>'mcp_chat' then
     if exists(select 1 from public.page_components c join public.copy_runs r on r.id=c.run_id
       where c.product_id=target_product_id and c.user_id=target_owner_id and c.superseded_at is null and r.input->>'source'='mcp_chat') then
       raise exception 'PI_VALIDATION_ERROR';
     end if;
   end if;
 end if;
 return new;
end $$;
create trigger pi_page_write_lock before insert or update or delete on public.page_components for each row execute function public.pi_serialize_page_write();
create trigger pi_copy_run_write_lock before insert or update or delete on public.copy_runs for each row execute function public.pi_serialize_page_write();
revoke all on function public.pi_landing_state(uuid,uuid),public.pi_serialize_page_write() from public,anon,authenticated,service_role;
revoke all on function public.pi_load_landing(jsonb,uuid,text,text,boolean),public.pi_commit_landing(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_landing(jsonb,uuid,text,text,boolean),public.pi_commit_landing(jsonb,uuid,bigint,text,text,text,text,jsonb,boolean) to service_role;
