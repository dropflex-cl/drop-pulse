-- Contenido del chat en las entidades operativas existentes. Sin llamadas a modelos.
alter table public.event_copy add column provenance jsonb not null default '{}'::jsonb;
alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels','save_ugc_content','generate_ugc',
 'save_creative_content','save_gallery_content','save_event_content','save_usage_tip','save_product_learning'));

create function public.pi_content_state(p_product_id uuid,p_owner_id uuid,p_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current_rows jsonb;
begin
 case p_kind
 when 'creative' then select coalesce(jsonb_agg(to_jsonb(c) order by c.position,c.id),'[]'::jsonb) into current_rows
   from public.creative_concepts c where c.product_id=p_product_id and c.user_id=p_owner_id and c.superseded_at is null;
 when 'gallery' then select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.id),'[]'::jsonb) into current_rows
   from public.page_image_shots s where s.product_id=p_product_id and s.user_id=p_owner_id and s.superseded_at is null;
 when 'event' then select coalesce(jsonb_agg(to_jsonb(e) order by e.event_id),'[]'::jsonb) into current_rows
   from public.event_copy e where e.product_id=p_product_id and e.user_id=p_owner_id;
 when 'tip' then select usage_tip into current_rows from public.products where id=p_product_id and user_id=p_owner_id;
 else raise exception 'PI_VALIDATION_ERROR';
 end case;
 return jsonb_build_object('current',current_rows,'content_etag',public.pi_snapshot_hash(coalesce(current_rows,'null'::jsonb)));
end $$;

create function public.pi_load_content(p_access jsonb,p_product_id uuid,p_kind text,p_key text default null,p_hash text default null,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; receipt public.pi_idempotency_records; tool_name text; scope text;
begin
 tool_name:=case p_kind when 'tip' then 'save_usage_tip' else 'save_'||p_kind||'_content' end;
 scope:=case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if p_key is not null and not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return jsonb_build_object('replay',receipt.result);
   end if;
 end if;
 state:=public.pi_content_state(p_product_id,owner_id,p_kind);
 return state||jsonb_build_object('revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'stamp',public.pi_snapshot_hash(jsonb_build_array(state,public.pi_context_snapshot(p_product_id))));
end $$;

create function public.pi_commit_content(p_access jsonb,p_product_id uuid,p_kind text,p_expected_revision bigint,p_etag text,p_stamp text,
 p_key text,p_hash text,p_content jsonb,p_input jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; state jsonb; snap jsonb; after_snap jsonb; rev bigint; receipt public.pi_idempotency_records; tool_name text;
 result jsonb; request_id uuid:=gen_random_uuid(); run_id uuid; artifact_id uuid; ids jsonb:='[]'; item jsonb; payload jsonb; n integer:=0; angle_slot integer; selected_id uuid;
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
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_etag is distinct from state->>'content_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_stamp is distinct from public.pi_snapshot_hash(jsonb_build_array(state,snap)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>65536 or jsonb_typeof(p_input) is distinct from 'object'
   or snap->'pricing'='null'::jsonb or snap->'catalog'->>'currency' is distinct from snap->'pricing'->>'currency' then raise exception 'PI_VALIDATION_ERROR'; end if;
 if jsonb_typeof(p_content->'fact_ids') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(p_content->'fact_ids') r(id) where
   not exists(select 1 from public.pi_facts f where f.id=r.id::uuid and f.product_id=p_product_id and f.user_id=owner_id and f.usage_status='approved' and f.verification_status='verified')
   or exists(select 1 from public.pi_fact_evidence e where e.fact_id=r.id::uuid and e.product_id=p_product_id and e.relation='contradicts')) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_kind in ('creative','gallery') then
   selected_id:=(snap->'knowledge'->>'active_strategy_id')::uuid;
   if selected_id is null or p_content->>'strategy_id' is distinct from selected_id::text or
     p_input->'strategy_snapshot' is distinct from snap->'knowledge'->'strategy'->'snapshot' or jsonb_typeof(p_content->'angle_ids') is distinct from 'array'
     or jsonb_array_length(p_content->'angle_ids') not between 1 and 3
     or exists(select 1 from jsonb_array_elements_text(p_content->'angle_ids') a(id) where not exists(select 1 from jsonb_array_elements(p_input->'strategy_snapshot'->'angles') b where b->>'id'=a.id)) then raise exception 'PI_INVALID_REFERENCE'; end if;
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
     update public.creative_concepts set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     insert into public.creative_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content,0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'concepts') loop
       n:=n+1;
       select ordinality::int into angle_slot from jsonb_array_elements_text(p_content->'angle_ids') with ordinality where value=item->>'angle_id';
       if angle_slot is null then raise exception 'PI_INVALID_REFERENCE'; end if;
       payload:=item||jsonb_build_object('angle',angle_slot,'preset_id',null,'preset',null,'product_look',p_content->'product_look','kit',p_content->'kit',
         'source','mcp_chat','sales_angle','offer','angle_name',(select a->>'name' from jsonb_array_elements(p_input->'strategy_snapshot'->'angles') a where a->>'id'=item->>'angle_id'),
         'provenance',jsonb_build_object('strategy_id',selected_id,'angle_id',item->>'angle_id','fact_ids',p_content->'fact_ids','analysis_revision',rev,'dramatization',item->>'family'='whatsapp_chat'));
       insert into public.creative_concepts(product_id,user_id,run_id,position,angle_slot,family,payload) values(p_product_id,owner_id,run_id,n,angle_slot,item->>'family',payload) returning id into artifact_id;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='gallery' then
     update public.page_image_shots set superseded_at=now(),updated_at=now() where product_id=p_product_id and user_id=owner_id and superseded_at is null;
     insert into public.page_image_runs(product_id,user_id,status,input,payload,prompt_version,model,started_at,finished_at)
       values(p_product_id,owner_id,'succeeded',p_input,p_content->'plan',0,'chat',now(),now()) returning id into run_id;
     for item in select value from jsonb_array_elements(p_content->'plan'->'shots') loop
       n:=n+1;
       payload:=item||jsonb_build_object('product_look',p_content->'plan'->'product_look','kit',p_content->'plan'->'kit','props_forbidden',p_content->'plan'->'props_forbidden',
         'world',p_content->'plan'->'visual_world','pairs',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'text' else null end,
         'angle',case when item->>'slot'='benefit' then p_content->'plan'->'benefits'->((item->>'benefit')::int-1)->'angle' else null end,'source','mcp_chat');
       insert into public.page_image_shots(product_id,user_id,run_id,slot,position,payload) values(p_product_id,owner_id,run_id,
         case when item->>'slot'='benefit' then 'benefit-'||(item->>'benefit') else item->>'slot' end,n,payload) returning id into artifact_id;
       ids:=ids||jsonb_build_array(artifact_id);
     end loop;
   elsif p_kind='event' then
     insert into public.event_copy(product_id,user_id,event_id,status,proposal,content,model,prompt_version,provenance)
       values(p_product_id,owner_id,(p_content->>'event_id')::uuid,'generated',p_content->'content',null,'chat',0,p_input)
       on conflict(product_id,event_id) do update set status='generated',proposal=excluded.proposal,content=null,model='chat',prompt_version=0,provenance=excluded.provenance,decided_at=null,updated_at=now() returning id into artifact_id;
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
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not p_dry_run,'dry_run',p_dry_run,'content_etag',state->>'content_etag','artifact_ids',ids,'next_action','Revisa la propuesta en DropFlex. Generar y publicar requieren acciones separadas.'));
 if not p_dry_run then
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=tool_name and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,tool_name,p_key,p_hash,array['product_intelligence:write'],result,rev,request_id);
 end if;
 return result;
end $$;
revoke all on function public.pi_content_state(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.pi_load_content(jsonb,uuid,text,text,text,boolean), public.pi_commit_content(jsonb,uuid,text,bigint,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_content(jsonb,uuid,text,text,text,boolean), public.pi_commit_content(jsonb,uuid,text,bigint,text,text,text,text,jsonb,jsonb,boolean) to service_role;

create function public.pi_load_ui_knowledge(p_access jsonb,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'; id uuid;
begin
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'PI_VALIDATION_ERROR'; end if;
 foreach id in array p_ids loop
   result:=result||jsonb_build_array(jsonb_build_object('product_id',id,'read',public.pi_load_knowledge(p_access,id)));
 end loop;
 return result;
end $$;
revoke all on function public.pi_load_ui_knowledge(jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.pi_load_ui_knowledge(jsonb,uuid[]) to service_role;
