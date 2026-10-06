-- OAuth nativo identifica al usuario y al cliente; los permisos de dominio son propios.
-- No dar este rol a authenticator: impedir SET ROLE también bloquea RPC legacy con EXECUTE público.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pi_mcp') then
    create role pi_mcp nologin noinherit;
  end if;
  if pg_has_role('authenticator', 'pi_mcp', 'MEMBER') then
    raise exception 'pi_mcp must not be available to PostgREST';
  end if;
  if exists(select 1 from pg_roles where rolname = 'pi_mcp' and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)) then
    raise exception 'pi_mcp must be an unprivileged NOLOGIN role';
  end if;
end $$;

create table public.pi_access_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.oauth_clients(id) on delete cascade,
  -- No existe en auth.sessions: evita reutilizar el bearer contra las APIs de cuenta de GoTrue.
  token_session_id uuid not null default gen_random_uuid() unique,
  resource_url text not null check (length(resource_url) between 1 and 2048),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 6 and
    scopes <@ array['product_intelligence:read','product_intelligence:write','product_intelligence:verify','landing:generate','ugc:generate','performance:read']::text[] and
    'product_intelligence:read' = any(scopes)
  ),
  authorization_id text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
-- Grant sobre el catálogo del comerciante, sin datos ligados a un producto individual.
alter table public.pi_access_grants enable row level security;
revoke all on public.pi_access_grants from public, anon, authenticated;
grant all on public.pi_access_grants to service_role;

create function public.pi_prepare_oauth_grant(p_user_id uuid, p_client_id uuid, p_authorization_id text, p_resource_url text, p_scopes text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- resource viene del authorize request y debe coincidir con la configuración del servidor.
  if not exists (
    select 1 from auth.oauth_authorizations a join auth.oauth_clients c on c.id = a.client_id
    where a.authorization_id = p_authorization_id and a.client_id = p_client_id
      and a.user_id = p_user_id and a.status = 'pending' and a.expires_at > now()
      and a.resource = p_resource_url and c.deleted_at is null
  ) then raise exception 'Invalid OAuth authorization' using errcode = '42501'; end if;
  insert into public.pi_access_grants(user_id,client_id,resource_url,scopes,authorization_id,expires_at)
    values(p_user_id,p_client_id,p_resource_url,p_scopes,p_authorization_id,now() + interval '30 days')
  on conflict(user_id,client_id) do update set
    resource_url = excluded.resource_url, scopes = excluded.scopes, authorization_id = excluded.authorization_id,
    version = public.pi_access_grants.version + 1, active = false, revoked_at = null,
    expires_at = excluded.expires_at, updated_at = now();
end $$;

create function public.pi_activate_oauth_grant(p_user_id uuid, p_client_id uuid, p_authorization_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pi_access_grants g set active = true, updated_at = now()
  where g.user_id = p_user_id and g.client_id = p_client_id and g.authorization_id = p_authorization_id
    and g.revoked_at is null and g.expires_at > now() and exists (
      select 1 from auth.oauth_authorizations a where a.authorization_id = p_authorization_id
        and a.client_id = g.client_id and a.user_id = g.user_id and a.resource = g.resource_url and a.status = 'approved'
    );
  if not found then raise exception 'Invalid OAuth authorization' using errcode = '42501'; end if;
end $$;

create function public.pi_revoke_oauth_grant(p_user_id uuid, p_client_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.pi_access_grants set active = false, revoked_at = now(), version = version + 1, updated_at = now()
  where user_id = p_user_id and client_id = p_client_id;
$$;

create function public.pi_check_oauth_grant(p_user_id uuid, p_client_id uuid, p_session_id uuid, p_token_session_id uuid, p_version integer, p_resource_url text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id',g.user_id,'client_id',g.client_id,'scopes',g.scopes,'expires_at',g.expires_at,'version',g.version)
  from public.pi_access_grants g
  join auth.users u on u.id = g.user_id
  join auth.oauth_clients c on c.id = g.client_id
  join auth.sessions s on s.id = p_session_id and s.user_id = g.user_id and s.oauth_client_id = g.client_id
  where g.user_id = p_user_id and g.client_id = p_client_id and g.version = p_version
    and g.token_session_id = p_token_session_id
    and not exists(select 1 from auth.sessions other_session where other_session.id = g.token_session_id)
    and g.resource_url = p_resource_url and g.active and g.revoked_at is null and g.expires_at > now()
    and u.deleted_at is null and coalesce(u.banned_until <= now(),true) and not coalesce(u.is_anonymous,false)
    and c.deleted_at is null and coalesce(s.not_after > now(),true)
    and exists (select 1 from auth.oauth_consents o where o.user_id = g.user_id and o.client_id = g.client_id and o.revoked_at is null);
$$;

create function public.pi_list_oauth_grants(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select g.client_id,c.client_name,g.scopes,g.expires_at,g.active,g.revoked_at
    from public.pi_access_grants g join auth.oauth_clients c on c.id = g.client_id
    where g.user_id = p_user_id and c.deleted_at is null order by g.updated_at desc limit 100
  ) t;
$$;

create function public.pi_oauth_authorization_context(p_user_id uuid, p_authorization_id text, p_resource_url text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('client_id',a.client_id,'redirect_uri',a.redirect_uri,'status',a.status,
    'has_active_grant',exists(select 1 from public.pi_access_grants g where g.user_id = p_user_id
      and g.client_id = a.client_id and g.resource_url = p_resource_url and g.active
      and g.revoked_at is null and g.expires_at > now()))
  from auth.oauth_authorizations a join auth.oauth_clients c on c.id = a.client_id
  where a.authorization_id = p_authorization_id and a.user_id = p_user_id
    and a.resource = p_resource_url and a.expires_at > now() and c.deleted_at is null;
$$;

create function public.pi_custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event->'claims';
  client_text text := coalesce(event->>'client_id',event->'claims'->>'client_id',
    (select oauth_client_id::text from auth.sessions where id = (event->'claims'->>'session_id')::uuid));
  g public.pi_access_grants;
begin
  -- El login y refresh propios del SaaS conservan sus claims originales.
  if client_text is null then return event; end if;
  select * into g from public.pi_access_grants
    where user_id = (event->>'user_id')::uuid and client_id = client_text::uuid
      and active and revoked_at is null and expires_at > now()
      and exists(select 1 from auth.oauth_consents o where o.user_id = (event->>'user_id')::uuid and o.client_id = client_text::uuid and o.revoked_at is null);
  if not found then raise exception 'MCP consent is required' using errcode = '42501'; end if;
  if claims->>'sub' <> g.user_id::text or not exists (
    select 1 from auth.sessions where id = (claims->>'session_id')::uuid and user_id = g.user_id and oauth_client_id = g.client_id
  ) then raise exception 'Invalid MCP session binding' using errcode = '42501'; end if;
  if exists(select 1 from auth.sessions where id = g.token_session_id) then
    raise exception 'Invalid MCP session binding' using errcode = '42501';
  end if;
  claims := (claims - 'user_metadata' - 'app_metadata') || jsonb_build_object(
    'aud',g.resource_url,'role','pi_mcp','client_id',g.client_id,
    'phone','',
    'session_id',g.token_session_id,'pi_auth_session_id',claims->'session_id',
    'pi_scopes',g.scopes,'pi_grant_version',g.version,
    'exp',least((claims->>'exp')::bigint,extract(epoch from g.expires_at)::bigint)
  );
  return jsonb_set(event,'{claims}',claims);
end $$;

revoke all on function public.pi_prepare_oauth_grant(uuid,uuid,text,text,text[]) from public, anon, authenticated;
revoke all on function public.pi_activate_oauth_grant(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.pi_revoke_oauth_grant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.pi_check_oauth_grant(uuid,uuid,uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.pi_list_oauth_grants(uuid) from public, anon, authenticated;
revoke all on function public.pi_oauth_authorization_context(uuid,text,text) from public, anon, authenticated;
revoke all on function public.pi_custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.pi_prepare_oauth_grant(uuid,uuid,text,text,text[]) to service_role;
grant execute on function public.pi_activate_oauth_grant(uuid,uuid,text) to service_role;
grant execute on function public.pi_revoke_oauth_grant(uuid,uuid) to service_role;
grant execute on function public.pi_check_oauth_grant(uuid,uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.pi_list_oauth_grants(uuid) to service_role;
grant execute on function public.pi_oauth_authorization_context(uuid,text,text) to service_role;
grant execute on function public.pi_custom_access_token_hook(jsonb) to supabase_auth_admin;
