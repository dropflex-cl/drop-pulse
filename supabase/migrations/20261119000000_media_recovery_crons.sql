-- Supabase programa la recuperación; los workers siguen ejecutándose en Vercel.
-- Reutiliza los secretos de ads-sync-hourly: app_base_url y cron_secret.
-- cron_secret debe coincidir con CRON_SECRET de la app. No guardar su valor aquí.
-- Sin ambos secretos válidos no se encolan solicitudes HTTP.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ugc-recovery-every-5-minutes',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := rtrim(s.base, '/') || '/api/cron/ugc',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
    timeout_milliseconds := 10000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') as base,
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as secret
  ) s
  where nullif(btrim(s.base), '') is not null and length(s.secret) >= 16;
  $job$
);

select cron.schedule(
  'gallery-recovery-every-5-minutes',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := rtrim(s.base, '/') || '/api/cron/gallery',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
    timeout_milliseconds := 10000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') as base,
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as secret
  ) s
  where nullif(btrim(s.base), '') is not null and length(s.secret) >= 16;
  $job$
);
