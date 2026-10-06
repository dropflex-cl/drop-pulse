# Cambio de autenticación MCP

Estado: autorizado, implementado y probado localmente. Fecha: 2026-10-06. Decisión técnica: [ADR 008](adrs/008-supabase-oauth-isolation.md).

## Autorización y alcance

[AGENTS.md](../../AGENTS.md) protege proxy.ts, lib/supabase/* y supabase.auth.*. Se preparó el cambio concreto, se pidió permiso y el usuario respondió «Si, te doy autorización, continúa». El permiso cubre consentimiento/revocación nativos y las defensas necesarias para que el bearer delegado no autorice una sesión SaaS. La restricción de producción readonly permanece vigente.

- Excepciones **exactas** en proxy: /api/mcp, /.well-known/oauth-protected-resource, /.well-known/oauth-protected-resource/api/mcp. Las APIs de consentimiento/revocación siguen protegidas por cookie. Ninguna excepción por prefijo MCP/well-known.
- getClaims() y refresco SSR se conservan. Proxy, AuthGate y sessionUser distinguen sesión merchant de JWT delegado; el acceso UI no se deriva solo de tener un sub firmado.
- Consentimiento en /oauth/consent, administración en /oauth/connections, enlace desde Ajustes solo cuando MCP esté configurado. UI lee por lib/data/oauth.ts.
- Supabase OAuth nativo local habilitado, hook de token y grants/RPC en migración aditiva. Recurso, issuer, JWKS y orígenes se toman de configuración explícita.
- Metadata pública solo expone URLs y scopes OAuth de identidad. Bearer verifica firma, expiración, audiencia/rol/claims específicos y grant/sesión/consentimiento vigentes. Un JWT SaaS normal o cookie sola no autorizan MCP.
- Transporte oficial HTTP JSON stateless y contratos probados con cliente SDK; /api/mcp conecta las siete tools persistentes de contexto/conocimiento/estrategia. Las tres de generación/status no se anuncian ni ejecutan. Ver ADR 009/010 y estado de implementación.

## Verificación completada

Login y refresh SaaS mantienen sus claims. Sin cookie + bearer real puede alcanzar el gate MCP; cookie con bearer delegado no autoriza UI/API SaaS. Metadata no redirige; otras rutas conservan 401 JSON o login con next. Revocación niega JWT aún vigente y refresh; scopes de escritura/generación/métricas no se deducen de lectura. Dos actores concurrentes conservan respuesta/principal. La pantalla real pasó WCAG del contenido en cuatro combinaciones móvil/escritorio y claro/oscuro.

La prueba real encontró que rol/audiencia no bastaban contra PUT /auth/v1/user; se implementó y comprobó la separación de sesión descrita en ADR 008. Esto debe repetirse con Auth hosted antes de activar un piloto.

## Lo que falta

Ejecutor y persistencia transaccionales PI, comprobación de grant dentro de cada acceso/replay/worker, host remoto objetivo, configuración/asymmetric signing keys del proyecto hosted y deploy/región. El permiso al código auth no habilita configuraciones, migraciones ni escrituras productivas. Ver [estado](implementation-status.md) y [runbook OAuth](oauth-runbook.md).
