-- El chat escribe guion/plan; el motor existente solo renderiza y el comerciante decide.
alter table public.video_scripts
 add column source text not null default 'legacy' check(source in ('legacy','mcp_chat')),
 add column execution_key text,
 add column provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'),
 add column artifact_etag text not null default encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
drop index public.video_scripts_active;
create unique index video_scripts_active_legacy on public.video_scripts(product_id,angle_slot,format) where superseded_at is null and source='legacy';
create unique index video_scripts_active_execution on public.video_scripts(product_id,execution_key,format) where superseded_at is null and source='mcp_chat';
alter table public.video_scripts add constraint video_scripts_chat_execution check(source<>'mcp_chat' or execution_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');

alter table public.video_scripts add constraint video_scripts_identity unique(id,product_id,user_id);
create table public.pi_ugc_operations(
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, script_id uuid not null references public.video_scripts(id) on delete cascade,
 stage text not null check(stage in ('keyframes','clips')), status text not null default 'queued' check(status in ('queued','running','succeeded','failed','reconciling','cancelled')),
 access jsonb not null, input_hash text not null, context_stamp text not null, script_etag text not null,
 analysis_revision bigint not null, request_revision bigint not null, estimated_usd numeric not null check(estimated_usd>=0),
 status_revision bigint not null default 1,
 foreign key(script_id,product_id,user_id) references public.video_scripts(id,product_id,user_id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint pi_ugc_operations_identity unique(id,script_id,product_id,user_id)
);
alter table public.pi_ugc_operations enable row level security;
create policy pi_ugc_operations_owner on public.pi_ugc_operations for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pi_ugc_operations from anon,authenticated;
grant select on public.pi_ugc_operations to authenticated;
grant all on public.pi_ugc_operations to service_role;
create index pi_ugc_operations_queue on public.pi_ugc_operations(status,updated_at);
alter table public.video_shots add column operation_id uuid references public.pi_ugc_operations(id) on delete cascade;
create index video_shots_operation on public.video_shots(operation_id);
alter table public.video_shots add constraint video_shots_operation_identity foreign key(operation_id,script_id,product_id,user_id) references public.pi_ugc_operations(id,script_id,product_id,user_id) on delete cascade;
alter table public.ad_media add column ugc_provenance jsonb not null default '{}'::jsonb;

alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;
alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in
 ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy','save_landing_content','save_pack_labels','save_ugc_content','generate_ugc'));

create function public.pi_ugc_context_stamp(p_product_id uuid) returns text language sql stable security definer set search_path='' as $$
 select public.pi_snapshot_hash(jsonb_build_array(public.pi_context_snapshot(p_product_id),
  (select image_qa from public.products where id=p_product_id),
  coalesce((select jsonb_agg(to_jsonb(r)-'created_at'-'updated_at' order by r.id) from public.product_reference_images r where r.product_id=p_product_id),'[]'::jsonb)))
$$;
create function public.pi_ugc_state(p_product_id uuid,p_owner_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scripts',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at,v.id) from public.video_scripts v
   where v.product_id=p_product_id and v.user_id=p_owner_id and v.superseded_at is null),'[]'::jsonb),
   'ugc_etag',public.pi_snapshot_hash(coalesce((select jsonb_agg(jsonb_build_array(v.id,v.artifact_etag) order by v.id) from public.video_scripts v
   where v.product_id=p_product_id and v.user_id=p_owner_id and v.superseded_at is null),'[]'::jsonb)))
$$;
create function public.pi_ugc_operation_state(p_id uuid,p_owner_id uuid,p_product_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select (to_jsonb(o)-'access')||jsonb_build_object('shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id)
   from public.video_shots s where s.operation_id=o.id),'[]'::jsonb)) from public.pi_ugc_operations o where o.id=p_id and o.user_id=p_owner_id and o.product_id=p_product_id
$$;

create function public.pi_load_ugc(p_access jsonb,p_product_id uuid,p_tool text default 'get_ugc_content',p_key text default null,p_hash text default null,p_dry_run boolean default false,p_operation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; scope text; receipt public.pi_idempotency_records; state jsonb; snap jsonb;
begin
 scope:=case when p_tool='save_ugc_content' then 'product_intelligence:write' when p_tool='generate_ugc' then 'ugc:generate' else 'product_intelligence:read' end;
 owner_id:=public.pi_authorize_context(p_access,scope);
 if p_tool='generate_ugc' then perform public.pi_authorize_context(p_access,'product_intelligence:read'); end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,scope);
 if p_key is not null and not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return jsonb_build_object('replay',receipt.result);
   end if;
 end if;
 state:=public.pi_ugc_state(p_product_id,owner_id); snap:=public.pi_context_snapshot(p_product_id);
 return state||jsonb_build_object('revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'operation_script',(select to_jsonb(v) from public.video_scripts v join public.pi_ugc_operations o on o.script_id=v.id where o.id=p_operation_id and o.user_id=owner_id and o.product_id=p_product_id),
   'stamp',public.pi_ugc_context_stamp(p_product_id),'snapshot',snap,'operation',public.pi_ugc_operation_state(p_operation_id,owner_id,p_product_id),
   'shots',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from public.video_shots s where s.product_id=p_product_id and s.user_id=owner_id and s.superseded_at is null),'[]'::jsonb));
end $$;

create function public.pi_commit_ugc(p_access jsonb,p_product_id uuid,p_command jsonb,p_prepared jsonb,p_stamp text,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 if (cmd->>'expected_revision')::bigint is distinct from rev or p_stamp is distinct from public.pi_ugc_context_stamp(p_product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
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
     update public.video_scripts set superseded_at=now_at,updated_at=now_at where id=script.id;
     update public.pi_ugc_operations set status='cancelled',updated_at=now_at where pi_ugc_operations.script_id=script.id and status in ('queued','running');
     script_id:=gen_random_uuid();
     insert into public.video_scripts(id,product_id,user_id,angle_slot,format,status,payload,input,source,execution_key,provenance,prompt_version,model,finished_at)
       values(script_id,p_product_id,owner_id,(cmd->>'angle_slot')::smallint,cmd->'content'->>'format','succeeded',p_prepared->'payload',p_prepared->'input',
         'mcp_chat',cmd->>'execution_key',jsonb_build_object('strategy_id',cmd->>'strategy_id','angle_id',cmd->>'angle_id','analysis_revision',rev,
         'landing_angle_id',cmd->>'landing_angle_id','landing_hook_id',cmd->>'landing_hook_id','hook',cmd->'hook','context_stamp',p_stamp,'actor_id',p_access->>'actor_id'),0,'chat',now_at);
     insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
     update public.product_intelligence set revision=rev+1,updated_at=now_at where product_id=p_product_id;
     rev:=rev+1;
     insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
     state:=public.pi_ugc_state(p_product_id,owner_id);
   end if;
   result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not dry,'dry_run',dry,'script_id',script_id,'ugc_etag',state->>'ugc_etag',
     'artifact_etag',(select artifact_etag from public.video_scripts where id=script_id),'status','in_review','next_action','Revisa y aprueba el guion en Creativos > Videos antes de generar.'));
 else
   select * into script from public.video_scripts where id=(cmd->>'script_id')::uuid and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
   if script.id is null then raise exception 'PI_NOT_FOUND'; end if;
   if cmd->>'expected_artifact_etag' is distinct from script.artifact_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   if script.source='mcp_chat' and script.provenance->>'context_stamp' is distinct from p_stamp then raise exception 'PI_REVISION_CONFLICT'; end if;
   if tool='review_ugc' then
     if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
     if cmd->>'action' not in ('approve','unapprove','edit') then raise exception 'PI_VALIDATION_ERROR'; end if;
     if cmd->>'action'='edit' then
       -- Se invalida el montaje completo: también puede cambiar la sincronización de B-roll/textos.
       update public.video_shots set superseded_at=now_at,updated_at=now_at where video_shots.script_id=script.id and kind<>'keyframe' and superseded_at is null;
       update public.video_scripts set payload=p_prepared->'payload',approved_at=null,edited_at=now_at,final_status=case when final_storage_path is null then null else 'in_review'::public.content_status end,updated_at=now_at where id=script.id;
     else
       update public.video_scripts set approved_at=case when cmd->>'action'='approve' then now_at else null end,
         final_status=case when cmd->>'action'='unapprove' and final_storage_path is not null then 'in_review'::public.content_status else final_status end,updated_at=now_at where id=script.id;
     end if;
     return jsonb_build_object('script_id',script.id);
   end if;
   if script.approved_at is null or script.status<>'succeeded' or cmd->>'stage' not in ('keyframes','clips') then raise exception 'PI_VALIDATION_ERROR'; end if;
   if exists(select 1 from public.video_shots where video_shots.script_id=script.id and render_status in ('queued','running') and superseded_at is null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if cmd->>'stage'='clips' and exists(select 1 from jsonb_array_elements(script.payload->'keyframes') k where not exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=k->>'key' and s.kind='keyframe' and s.render_status='succeeded' and s.status='approved' and s.superseded_at is null)) then raise exception 'PI_VALIDATION_ERROR'; end if;
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
end $$;

create function public.pi_video_etag() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.payload,new.approved_at,new.edited_at,new.superseded_at,new.final_storage_path,new.final_status,new.ad_media_id) is distinct from
   (old.payload,old.approved_at,old.edited_at,old.superseded_at,old.final_storage_path,old.final_status,old.ad_media_id) then
   new.artifact_etag:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
 end if;
 return new;
end $$;
create trigger pi_video_etag before update on public.video_scripts for each row execute function public.pi_video_etag();
create function public.pi_ugc_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.operation_id is not null then update public.pi_ugc_operations set status_revision=status_revision+1,updated_at=clock_timestamp() where id=new.operation_id; end if;
 return new;
end $$;
create trigger pi_ugc_progress after insert or update on public.video_shots for each row execute function public.pi_ugc_progress();

-- Marca persistente antes del submit. Si el proceso muere, se concilia; nunca se reenvía a ciegas.
create function public.pi_claim_ugc_shot(p_shot_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare shot public.video_shots; script public.video_scripts; op public.pi_ugc_operations;
begin
 select * into shot from public.video_shots where id=p_shot_id and superseded_at is null;
 if shot.id is null then return null; end if;
 perform 1 from public.products where id=shot.product_id and user_id=shot.user_id and pi_deleting_at is null for update;
 if not found then return null; end if;
 select * into script from public.video_scripts where id=shot.script_id and superseded_at is null;
 if script.id is null or script.approved_at is null then return null; end if;
 select * into op from public.pi_ugc_operations where id=shot.operation_id for update;
 if op.id is not null then
   if op.status in ('cancelled','failed') then return null; end if;
   begin
     perform public.pi_authorize_context(op.access,'ugc:generate');
     if op.context_stamp is distinct from public.pi_ugc_context_stamp(shot.product_id) or op.script_etag is distinct from script.artifact_etag then raise exception 'PI_REVISION_CONFLICT'; end if;
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
end $$;

revoke all on function public.pi_ugc_context_stamp(uuid),public.pi_ugc_state(uuid,uuid),public.pi_ugc_operation_state(uuid,uuid,uuid),public.pi_video_etag(),public.pi_ugc_progress() from public,anon,authenticated,service_role;
revoke all on function public.pi_load_ugc(jsonb,uuid,text,text,text,boolean,uuid),public.pi_commit_ugc(jsonb,uuid,jsonb,jsonb,text,text),public.pi_claim_ugc_shot(uuid) from public,anon,authenticated;
grant execute on function public.pi_load_ugc(jsonb,uuid,text,text,text,boolean,uuid),public.pi_commit_ugc(jsonb,uuid,jsonb,jsonb,text,text),public.pi_claim_ugc_shot(uuid) to service_role;

alter table public.video_scripts add column final_script_hash text,add column final_shots_hash text,add column final_operation_id uuid,add column final_operation_started_at timestamptz;
create function public.pi_ugc_shots_hash(p_script_id uuid) returns text language sql stable security definer set search_path='' as $$
 select public.pi_snapshot_hash(coalesce((select jsonb_agg(jsonb_build_array(s.id,s.key,s.storage_path,s.render_status,s.status) order by s.key) from public.video_shots s
   where s.script_id=p_script_id and s.superseded_at is null),'[]'::jsonb))
$$;
create function public.pi_guard_video() returns trigger language plpgsql security definer set search_path='' as $$
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
   if new.final_status='approved' then
     if new.approved_at is null or new.final_storage_path is null or new.final_script_hash is distinct from public.pi_snapshot_hash(new.payload)
       or new.final_shots_hash is distinct from public.pi_ugc_shots_hash(new.id) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   end if;
 end if;
 return new;
end $$;
create trigger pi_guard_video before insert or update on public.video_scripts for each row execute function public.pi_guard_video();
-- Referencias a videos reales: la landing no acepta el UUID de una pieza ajena o sin aprobar.
create function public.pi_guard_landing_ugc() returns trigger language plpgsql security definer set search_path='' as $$
declare content jsonb; requested_id text;
begin
 if new.component<>'ugc-slider' or not new.enabled then return new; end if;
 perform 1 from public.products where id=new.product_id and user_id=new.user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 for content in select value from jsonb_array_elements(case when jsonb_typeof(coalesce(new.content,new.proposal))='array' then coalesce(new.content,new.proposal) else jsonb_build_array(jsonb_build_object('content',coalesce(new.content,new.proposal))) end) loop
   for requested_id in select jsonb_array_elements_text(coalesce(content->'content'->'script_ids','[]'::jsonb)) loop
     if not exists(select 1 from public.video_scripts s where s.id=requested_id::uuid and s.product_id=new.product_id and s.user_id=new.user_id and s.superseded_at is null and s.approved_at is not null and s.final_status='approved' and s.final_storage_path is not null and (s.source<>'mcp_chat' or s.provenance->>'context_stamp'=public.pi_ugc_context_stamp(new.product_id))) then raise exception 'PI_INVALID_REFERENCE'; end if;
   end loop;
 end loop;
 return new;
end $$;
create trigger pi_guard_landing_ugc before insert or update on public.page_components for each row execute function public.pi_guard_landing_ugc();
revoke all on function public.pi_ugc_shots_hash(uuid),public.pi_guard_video(),public.pi_guard_landing_ugc() from public,anon,authenticated,service_role;

create function public.pi_claim_ugc_final(p_access jsonb,p_product_id uuid,p_script_id uuid,p_etag text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
   if script.approved_at is null or exists(select 1 from public.video_shots s where s.script_id=script.id and s.superseded_at is null and s.render_status in ('queued','running')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if script.source='mcp_chat' then
     if script.provenance->>'context_stamp' is distinct from public.pi_ugc_context_stamp(p_product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
     if exists(select 1 from jsonb_array_elements(script.payload->'keyframes') k where not exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=k->>'key' and s.kind='keyframe' and s.render_status='succeeded' and s.status='approved' and s.superseded_at is null))
       or exists(select 1 from jsonb_array_elements((script.payload->'a_roll')||(script.payload->'b_roll')) k where not exists(select 1 from public.video_shots s where s.script_id=script.id and s.key=k->>'key' and s.kind<>'keyframe' and s.render_status='succeeded' and s.storage_path is not null and s.superseded_at is null)) then raise exception 'PI_VALIDATION_ERROR'; end if;
     if p_access->>'final_action'='approve' and (script.final_script_hash is distinct from public.pi_snapshot_hash(script.payload) or script.final_shots_hash is distinct from public.pi_ugc_shots_hash(script.id)) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   end if;
 end if;
 perform set_config('pi.final_commit','true',true);
 update public.video_scripts set final_operation_id=gen_random_uuid(),final_operation_started_at=clock_timestamp() where id=p_script_id returning * into script;
 return to_jsonb(script);
end $$;
create function public.pi_complete_ugc_final(p_access jsonb,p_product_id uuid,p_script_id uuid,p_token uuid,p_patch jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; script public.video_scripts;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 if p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into script from public.video_scripts where id=p_script_id and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
 if script.id is null or script.final_operation_id is distinct from p_token then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 perform set_config('pi.final_commit','true',true);
 update public.video_scripts set
   final_storage_path=case when p_patch ? 'final_storage_path' then p_patch->>'final_storage_path' else final_storage_path end,
   final_width=case when p_patch ? 'final_width' then (p_patch->>'final_width')::int else final_width end,
   final_height=case when p_patch ? 'final_height' then (p_patch->>'final_height')::int else final_height end,
   final_duration_s=case when p_patch ? 'final_duration_s' then (p_patch->>'final_duration_s')::numeric else final_duration_s end,
   final_size_bytes=case when p_patch ? 'final_size_bytes' then (p_patch->>'final_size_bytes')::bigint else final_size_bytes end,
   final_status=case when p_patch ? 'final_status' then (p_patch->>'final_status')::public.content_status else final_status end,
   final_decided_at=case when p_patch ? 'final_decided_at' then (p_patch->>'final_decided_at')::timestamptz else final_decided_at end,
   ad_media_id=case when p_patch ? 'ad_media_id' then (p_patch->>'ad_media_id')::uuid else ad_media_id end,
   final_operation_id=null,final_operation_started_at=null,updated_at=clock_timestamp() where id=p_script_id;
end $$;
revoke all on function public.pi_claim_ugc_final(jsonb,uuid,uuid,text),public.pi_complete_ugc_final(jsonb,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pi_claim_ugc_final(jsonb,uuid,uuid,text),public.pi_complete_ugc_final(jsonb,uuid,uuid,uuid,jsonb) to service_role;

-- La revisión de imágenes comparte el bloqueo, CAS e invalidación de derivados.
create function public.pi_review_ugc_keyframes(p_access jsonb,p_product_id uuid,p_script_id uuid,p_etag text,p_action text,p_shot_id uuid default null,p_shot_updated_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
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
   update public.video_shots set superseded_at=clock_timestamp(),updated_at=clock_timestamp() where script_id=p_script_id and kind<>'keyframe' and superseded_at is null;
   update public.video_scripts set artifact_etag=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),
     final_status=case when final_storage_path is null then null else 'in_review'::public.content_status end,updated_at=clock_timestamp() where id=p_script_id;
 end if;
end $$;

create function public.pi_assert_ugc_publishable(p_access jsonb,p_product_id uuid,p_script_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; script public.video_scripts; requested uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 foreach requested in array p_script_ids loop
   select * into script from public.video_scripts where id=requested and product_id=p_product_id and user_id=owner_id and superseded_at is null;
   if script.id is null or script.approved_at is null or script.final_status is distinct from 'approved'::public.content_status or script.final_storage_path is null then raise exception 'PI_INVALID_REFERENCE'; end if;
   if script.source='mcp_chat' and (script.provenance->>'context_stamp' is distinct from public.pi_ugc_context_stamp(p_product_id) or script.final_script_hash is distinct from public.pi_snapshot_hash(script.payload) or script.final_shots_hash is distinct from public.pi_ugc_shots_hash(script.id)) then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 end loop;
end $$;
revoke all on function public.pi_review_ugc_keyframes(jsonb,uuid,uuid,text,text,uuid,timestamptz),public.pi_assert_ugc_publishable(jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.pi_review_ugc_keyframes(jsonb,uuid,uuid,text,text,uuid,timestamptz),public.pi_assert_ugc_publishable(jsonb,uuid,uuid[]) to service_role;

-- Conciliación explícita del comerciante: adjuntar el request_id o confirmar que no salió.
create function public.pi_reconcile_ugc_shot(p_access jsonb,p_product_id uuid,p_shot_id uuid,p_etag text,p_shot_updated_at timestamptz,p_request_id text,p_confirm_not_sent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; shot public.video_shots; script public.video_scripts;
begin
 owner_id:=public.pi_authorize_context(p_access,'ugc:generate');
 if p_access->>'actor_kind' is distinct from 'merchant' then raise exception 'PI_FORBIDDEN'; end if;
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into shot from public.video_shots where id=p_shot_id and product_id=p_product_id and user_id=owner_id and superseded_at is null for update;
 if shot.id is null or shot.error_code is distinct from 'dispatch_unknown' or shot.updated_at is distinct from p_shot_updated_at then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 select * into script from public.video_scripts where id=shot.script_id and superseded_at is null;
 if script.id is null or script.artifact_etag is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_request_id is null and not p_confirm_not_sent then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_request_id is not null and (p_request_id !~ '^[A-Za-z0-9_-]{1,128}$' or p_confirm_not_sent) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if p_request_id is not null and (script.approved_at is null or script.provenance->>'context_stamp' is distinct from public.pi_ugc_context_stamp(p_product_id)) then raise exception 'PI_REVISION_CONFLICT'; end if;
 update public.video_shots set hf_request_id=p_request_id,render_status=case when p_request_id is null then 'failed' else 'running' end,
   error_code=case when p_request_id is null then 'confirmed_not_sent' else null end,error_message=case when p_request_id is null then 'Confirmaste que no se envió. Puedes generar de nuevo.' else null end,
   submitted_at=case when p_request_id is null then submitted_at else clock_timestamp() end,finished_at=null,updated_at=clock_timestamp()-interval '30 seconds' where id=p_shot_id;
 update public.pi_ugc_operations set status=case when p_request_id is null then 'failed' else 'running' end,updated_at=clock_timestamp() where id=shot.operation_id;
end $$;
revoke all on function public.pi_reconcile_ugc_shot(jsonb,uuid,uuid,text,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.pi_reconcile_ugc_shot(jsonb,uuid,uuid,text,timestamptz,text,boolean) to service_role;
