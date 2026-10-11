-- Director editorial y render durable de Remotion. Los medios siguen en creative-media.
create table public.video_montages (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 script_id uuid not null,
 foreign key(script_id,product_id,user_id) references public.video_scripts(id,product_id,user_id) on delete cascade,
 idempotency_key uuid not null,
 source_script_hash text not null, source_shots_hash text not null, context_stamp text not null,
 status text not null default 'queued' check(status in ('queued','analyzing','ready','render_queued','rendering','succeeded','failed','cancelled')),
 revision bigint not null default 1, brief text not null default '' check(length(brief)<=1200),
 analysis jsonb, plan jsonb,
 lease_token uuid, heartbeat_at timestamptz, progress numeric not null default 0 check(progress between 0 and 1),
 error_message text, output_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,idempotency_key)
);
create unique index video_montage_active on public.video_montages(script_id) where status in ('queued','analyzing','ready','render_queued','rendering');
create index video_montage_queue on public.video_montages(status,created_at);
alter table public.video_montages enable row level security;
revoke all on public.video_montages from public,anon,authenticated;
grant select on public.video_montages to authenticated;
grant all on public.video_montages to service_role;
create policy video_montages_owner on public.video_montages for select to authenticated using(user_id=(select auth.uid()));

create table public.video_montage_workers(id uuid primary key, heartbeat_at timestamptz not null default now());
alter table public.video_montage_workers enable row level security;
revoke all on public.video_montage_workers from public,anon,authenticated;
grant all on public.video_montage_workers to service_role;

create function public.video_montage_current(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select s.superseded_at is null and s.approved_at is not null and p.pi_deleting_at is null
  and m.source_script_hash=public.pi_snapshot_hash(s.payload)
  and m.source_shots_hash=public.pi_ugc_shots_hash(s.id)
  and m.context_stamp=public.pi_ugc_context_stamp(p.id)
  from public.video_montages m join public.video_scripts s on s.id=m.script_id join public.products p on p.id=m.product_id
  where m.id=p_id),false)
$$;

-- El sondeo de la pantalla no descarga planes, transcripciones ni filas históricas.
create function public.video_montage_list(p_user_id uuid,p_product_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'script_id',m.script_id,'revision',m.revision,
  'status',m.status,'progress',m.progress,'error_message',m.error_message,'has_plan',m.plan is not null,
  'current',public.video_montage_current(m.id))),'[]'::jsonb)
 from (select distinct on(script_id) * from public.video_montages where user_id=p_user_id and product_id=p_product_id
  order by script_id,created_at desc,id desc) m
$$;
revoke all on function public.video_montage_list(uuid,uuid) from public,anon,authenticated;
grant execute on function public.video_montage_list(uuid,uuid) to service_role;

-- Solo el servidor autenticado llama estas operaciones. Las identidades nunca vienen del navegador.
create function public.video_montage_action(p_user_id uuid,p_product_id uuid,p_script_id uuid,p_action text,
 p_etag text default null,p_id uuid default null,p_revision bigint default null,p_plan jsonb default null,
 p_brief text default '',p_key uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.video_scripts; m public.video_montages;
begin
 perform public.pi_authorize_context(jsonb_build_object('user_id',p_user_id,'actor_id',p_user_id,'actor_kind','merchant','scopes',jsonb_build_array('product_intelligence:write')),'product_intelligence:write');
 perform 1 from public.products where id=p_product_id and user_id=p_user_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 select * into s from public.video_scripts where id=p_script_id and product_id=p_product_id and user_id=p_user_id and superseded_at is null for update;
 if s.id is null then raise exception 'PI_NOT_FOUND'; end if;
 if s.artifact_etag is distinct from p_etag then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_action='create' then
  if p_key is null or length(p_brief)>1200 then raise exception 'PI_VALIDATION_ERROR'; end if;
  select * into m from public.video_montages where user_id=p_user_id and idempotency_key=p_key;
  if m.id is not null then
   if m.script_id<>p_script_id or m.brief<>p_brief then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
   return to_jsonb(m);
  end if;
  if s.approved_at is null or s.status<>'succeeded' then raise exception 'PI_VALIDATION_ERROR'; end if;
  if s.source='mcp_chat' and s.provenance->>'context_stamp' is distinct from public.pi_ugc_context_stamp(p_product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
  if exists(select 1 from public.video_shots where script_id=s.id and superseded_at is null and render_status in ('queued','running'))
   or exists(select 1 from jsonb_array_elements((s.payload->'a_roll')||(s.payload->'b_roll')) k where not exists(
    select 1 from public.video_shots v where v.script_id=s.id and v.key=k->>'key' and v.kind<>'keyframe' and v.render_status='succeeded' and v.superseded_at is null and v.storage_path is not null)) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
  if exists(select 1 from public.video_montages where script_id=s.id and status in ('queued','analyzing','render_queued','rendering')) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
  -- Reemplazar una propuesta requiere otra acción explícita; el MP4 aprobado se conserva hasta exportar.
  update public.video_montages set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where script_id=s.id and status='ready';
  if (select count(*) from public.video_montages where user_id=p_user_id and created_at>now()-interval '24 hours')>=20 then raise exception 'PI_RATE_LIMITED'; end if;
  insert into public.video_montages(product_id,user_id,script_id,idempotency_key,source_script_hash,source_shots_hash,context_stamp,brief)
   values(p_product_id,p_user_id,p_script_id,p_key,public.pi_snapshot_hash(s.payload),public.pi_ugc_shots_hash(s.id),public.pi_ugc_context_stamp(p_product_id),p_brief) returning * into m;
 else
  select * into m from public.video_montages where id=p_id and script_id=p_script_id and user_id=p_user_id for update;
  if m.id is null then raise exception 'PI_NOT_FOUND'; end if;
  if m.revision is distinct from p_revision then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
  if p_action='cancel' then
   update public.video_montages set status='cancelled',lease_token=null,revision=revision+1,updated_at=clock_timestamp() where id=m.id returning * into m;
  else
   if not public.video_montage_current(m.id) then raise exception 'PI_REVISION_CONFLICT'; end if;
   if m.status<>'ready' and not (p_action='render' and m.status='failed' and m.plan is not null) then raise exception 'PI_GENERATION_IN_PROGRESS'; end if;
   if p_action='edit' then
    if jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>65536 then raise exception 'PI_VALIDATION_ERROR'; end if;
    update public.video_montages set plan=p_plan,revision=revision+1,updated_at=clock_timestamp() where id=m.id returning * into m;
   elsif p_action='render' then
    update public.video_montages set status='render_queued',progress=0,error_message=null,lease_token=null,revision=revision+1,updated_at=clock_timestamp() where id=m.id returning * into m;
   else raise exception 'PI_VALIDATION_ERROR'; end if;
  end if;
 end if;
 return to_jsonb(m);
end $$;

create function public.video_montage_work(p_id uuid,p_action text,p_token uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.video_montages; s public.video_scripts; access jsonb; claimed jsonb; old_path text; old_ad uuid;
begin
 -- Orden común con las operaciones del producto: producto, guion, montaje.
 select * into m from public.video_montages where id=p_id;
 if m.id is null then return null; end if;
 perform 1 from public.products where id=m.product_id and user_id=m.user_id and pi_deleting_at is null for update;
 if not found then return null; end if;
 select * into s from public.video_scripts where id=m.script_id for update;
 select * into m from public.video_montages where id=p_id for update;
 if not public.video_montage_current(m.id) then
  update public.video_montages set status='cancelled',lease_token=null,error_message='El guion, los clips o el producto cambiaron. Propón otra edición.',revision=revision+1,updated_at=clock_timestamp() where id=m.id;
  return null;
 end if;
 if p_action='claim' then
  if m.status not in ('queued','render_queued') then return null; end if;
  update public.video_montages set status=case when status='queued' then 'analyzing' else 'rendering' end,lease_token=gen_random_uuid(),heartbeat_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=m.id returning * into m;
  return to_jsonb(m);
 end if;
 if m.lease_token is distinct from p_token or m.status not in ('analyzing','rendering') then return null; end if;
 if p_action='heartbeat' then
  update public.video_montages set heartbeat_at=clock_timestamp(),progress=greatest(progress,least(1,greatest(0,coalesce((p_data->>'progress')::numeric,0)))) where id=m.id;
 elsif p_action='fail' then
  update public.video_montages set status='failed',error_message=left(p_data->>'error',500),lease_token=null,revision=revision+1,updated_at=clock_timestamp() where id=m.id;
 elsif p_action='plan' and m.status='analyzing' then
  if jsonb_typeof(p_data->'plan') is distinct from 'object' or jsonb_typeof(p_data->'analysis') is distinct from 'object' then raise exception 'PI_VALIDATION_ERROR'; end if;
  update public.video_montages set plan=p_data->'plan',analysis=p_data->'analysis',status='ready',progress=1,lease_token=null,revision=revision+1,updated_at=clock_timestamp() where id=m.id;
 elsif p_action='complete' and m.status='rendering' then
  if p_data->>'path' is distinct from m.user_id::text||'/'||m.product_id::text||'/video-final-'||m.script_id::text||'-montage-'||m.id::text||'.mp4'
   or coalesce((p_data->>'size')::bigint,0) not between 1 and 104857600 or coalesce((p_data->>'duration')::numeric,0) not between 10 and 60
   or (p_data->>'width')::int is distinct from 720 or (p_data->>'height')::int is distinct from 1280 then raise exception 'PI_VALIDATION_ERROR'; end if;
  old_path:=s.final_storage_path; old_ad:=s.ad_media_id;
  access:=jsonb_build_object('user_id',m.user_id,'actor_id',m.user_id,'actor_kind','merchant','scopes',jsonb_build_array('product_intelligence:write'),'final_action','upload');
  claimed:=public.pi_claim_ugc_final(access,m.product_id,m.script_id,s.artifact_etag);
  perform public.pi_complete_ugc_final(access,m.product_id,m.script_id,(claimed->>'final_operation_id')::uuid,
   jsonb_build_object('final_storage_path',p_data->>'path','final_width',720,'final_height',1280,'final_duration_s',(p_data->>'duration')::numeric,
    'final_size_bytes',(p_data->>'size')::bigint,'final_status','in_review','final_decided_at',null,'ad_media_id',null));
  update public.video_montages set output_path=p_data->>'path',status='succeeded',progress=1,lease_token=null,revision=revision+1,updated_at=clock_timestamp() where id=m.id;
  return jsonb_build_object('old_path',old_path,'old_ad_media_id',old_ad);
 else raise exception 'PI_VALIDATION_ERROR'; end if;
 return jsonb_build_object('applied',true);
end $$;

create function public.video_montage_expire() returns void language plpgsql security definer set search_path='' as $$
begin
 update public.video_montages set status='failed',lease_token=null,revision=revision+1,updated_at=clock_timestamp(),
  error_message='El montaje se interrumpió. Revisa la propuesta o pide otra edición.'
 where status in ('analyzing','rendering') and heartbeat_at<clock_timestamp()-interval '3 minutes';
 delete from public.video_montage_workers where heartbeat_at<clock_timestamp()-interval '1 day';
end $$;
revoke all on function public.video_montage_expire() from public,anon,authenticated;
grant execute on function public.video_montage_expire() to service_role;

revoke all on function public.video_montage_current(uuid),public.video_montage_action(uuid,uuid,uuid,text,text,uuid,bigint,jsonb,text,uuid),public.video_montage_work(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.video_montage_current(uuid),public.video_montage_action(uuid,uuid,uuid,text,text,uuid,bigint,jsonb,text,uuid),public.video_montage_work(uuid,text,uuid,jsonb) to service_role;
update storage.buckets set allowed_mime_types=array(select distinct unnest(allowed_mime_types||array['audio/wav'])) where id='creative-media' and allowed_mime_types is not null;
