# ADR 008 — OAuth nativo Supabase con permisos y sesión aislados

Estado: implementado y probado en Supabase/Next locales; producción readonly, host remoto pendiente. Fecha: 2026-10-06.

## Decisión

Usar el servidor OAuth 2.1 de Supabase, PKCE S256, cliente público registrado manualmente y refresh nativo. Conservar Auth del SaaS. No construir un authorization server ni registrar usuarios paralelos. La autorización del usuario «Si, te doy autorización, continúa» permite los cambios necesarios de proxy y auth; no autoriza escrituras productivas.

Supabase no admite los scopes de dominio personalizados del spec. La metadata anuncia `email` y `offline_access`, comprobados en discovery local. Los seis permisos de `PI_SCOPES` se eligen explícitamente en `/oauth/consent` y se guardan en `pi_access_grants`; únicamente lectura comienza seleccionada. Generar y verificar son permisos separados de escribir. No hay permisos de publicar o iniciar campañas en este grant. V1 abarca el catálogo del comerciante por 30 días; restricción por producto queda para una ampliación explícita.

El grant se prepara inactivo, se llama a `approveAuthorization` y se activa solo si la autorización nativa está aprobada y coincide en usuario, cliente y `resource`. Cada código OAuth requiere el recurso canónico `/api/mcp`. Un fallo intermedio no concede acceso; no se afirma atomicidad entre Supabase Auth y las llamadas de aplicación. Un ticket HMAC de 10 minutos vincula usuario/cliente/autorización/recurso, y POST/DELETE exigen Origin de la app. Un consentimiento nativo anterior no reactiva un grant local vencido o revocado. Ampliar permisos requiere revocar y conectar otra vez.

## Tres fronteras necesarias

1. El JWT MCP tiene audiencia exclusiva, `role = pi_mcp`, `client_id`, scopes propios y versión del grant. JOSE verifica ES256/RS256, JWKS e issuer configurados, expiry y audiencia única. El dueño proviene del `sub` firmado, nunca de email ni argumentos de tool.
2. `pi_mcp` es NOLOGIN, sin privilegios y **no se concede a authenticator**. REST/RPC/Storage no pueden asumirlo. Las RPC nuevas revocan EXECUTE público/anon/authenticated y solo permiten service_role; el hook únicamente permite supabase_auth_admin.
3. En GoTrue local **v2.197.0**, una prueba real de `PUT /auth/v1/user` aceptó el JWT con audiencia/rol dedicados mientras conservaba una sesión Auth normal. Cambiar audiencia/rol fue insuficiente. El hook conserva el dueño pero coloca un identificador de delegación propio en `session_id`, inexistente en `auth.sessions`; la sesión OAuth real viaja en `pi_auth_session_id`. El servidor comprueba ambas contra grant y sesión real. Esto mantiene refresh nativo y hace que Auth rechace el bearer como sesión de cuenta. No crear una sesión Auth con el identificador de delegación. Se eliminan user_metadata/app_metadata y teléfono del token MCP; el correo se informa en consentimiento.

La última separación se sustenta además en [maybeLoadUserOrSession de la versión probada](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go): exige una sesión existente para el `session_id` del JWT. Es una integración deliberada con un hook documentado, pero requiere repetir las pruebas contra la versión del proyecto hosted antes del piloto. Este token es exclusivo del resource server MCP; no anunciar que funciona con Supabase APIs, OIDC/userinfo o RLS directo.

Todas las puertas de sesión del SaaS (`proxy`, `sessionUser`, `AuthGate` y consentimiento) exigen claims de comerciante: rol/audiencia authenticated, usuario no anónimo y ausencia de client_id/claim de sesión delegada. Un token MCP colocado manualmente en una cookie no obtiene permisos de UI/API mediante el cliente administrativo del servidor.

## Revocación y ejecución

Cada petición comprueba grant vigente, versión, usuario no eliminado/bloqueado, cliente no eliminado, sesión OAuth del mismo usuario/cliente y consentimiento nativo no revocado. Los scopes efectivos intersectan token y grant. Una petición previa no autoriza las siguientes. La revocación local ocurre antes de limpiar sesiones/refresh en Supabase y corta el acceso incluso si esa limpieza falla. La UI refresca el estado también en ese caso.

El ejecutor futuro debe repetir la comprobación bajo su transacción, incluidos replay/cursor y cada paso pagado. El adaptador HTTP no sustituye esa comprobación. `http.ts` usa WebStandardStreamableHTTPServerTransport oficial por request, JSON, sin SSE, origen/Host configurados y body de máximo 256 KiB. El deadline del ejecutor no promete rollback de un commit.

## Evidencia y límites

- `scripts/pi-oauth-local.ts`: discovery mediante SDK oficial, dos usuarios ficticios, PKCE correcto e incorrecto, consentimiento/RPC, token real/JWKS, refresh, revocación, aislamiento de dueño y rechazo de REST/RPC/Storage/Auth. El refresh genérico no convierte la sesión en authenticated. Limpieza solo de sus fixtures.
- `scripts/pi-oauth-ui-local.ts`: login existente, consentimiento real, solo lectura por defecto, cuatro capturas móvil/escritorio claro/oscuro, WCAG del contenido, revocación y JWT delegado metido en cookie. El endpoint autenticado devuelve 503 por falta de ejecutor persistente.
- Tests unitarios verifican claims inválidos, scope ausente, errores seguros, consentimiento fallido, CSRF, revocación, transporte SDK y dos actores concurrentes.
- La migración completa también se comprobó en una transacción local terminada en rollback, con RLS/ACL/roles. La base conserva su usuario previo; no hubo reset ni escrituras productivas.

`MCP_ENABLED` está apagado por defecto. El HTTP de aplicación está montado pero permanece cerrado a operaciones hasta conectar el DomainExecutor transaccional. DCR sigue deshabilitado. No se verificó ChatGPT/Codex remoto, Vercel ni OAuth hosted. Supabase OAuth permanece beta; ver [documentación MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) y [seguridad de tokens](https://supabase.com/docs/guides/auth/oauth-server/token-security).
