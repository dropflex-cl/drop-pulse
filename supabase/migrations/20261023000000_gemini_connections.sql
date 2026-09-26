-- Clave de Gemini del comerciante, con el mismo mecanismo que Higgsfield (20261004000000_creatives.sql):
-- el secreto en Vault como 'gemini_token_<user>' y lo visible (últimos 4, estado) en gemini_connections.
-- Cada comerciante genera con su cuenta y su cuota de Google; la clave nunca sale del servidor.

create or replace function public.set_integration_token(p_kind text, p_user_id uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_id   uuid;
begin
  if p_kind not in ('shopify', 'shopify_refresh', 'meta', 'higgsfield', 'gemini') then raise exception 'kind inválido: %', p_kind; end if;
  v_name := p_kind || '_token_' || p_user_id::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_token, v_name, 'DropFlex: token de ' || p_kind);
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $$;

create or replace function public.delete_user_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where name in (
    'shopify_token_' || old.id::text, 'shopify_refresh_token_' || old.id::text, 'meta_token_' || old.id::text,
    'higgsfield_token_' || old.id::text, 'gemini_token_' || old.id::text
  );
  return old;
end $$;

-- Lo visible de la conexión (la clave nunca sale de Vault).
create table public.gemini_connections (
  user_id     uuid primary key references auth.users on delete cascade,
  key_hint    text not null,                     -- los últimos 4 caracteres, para reconocerla
  status      text not null default 'connected' check (status in ('connected', 'invalid')),
  last_error  text,                              -- en español, para la pantalla
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.gemini_connections enable row level security;
create policy "dueño lee" on public.gemini_connections for select using (user_id = (select auth.uid()));
