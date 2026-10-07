# Dominio Product Intelligence

Implementación para el flujo desde chat, compartida por UI y MCP. El núcleo de dominio es puro; `repository.ts`/`service.ts`/`knowledge-service.ts` persisten contexto, precio, conocimiento y decisiones con RPC autorizada. Las tools de contenido guardan propuestas sin redacción pagada; las tools de ejecución explícita usan los renderizadores y proveedores conservados. No se reconstruye el análisis legacy. `test-fixtures.ts`, `oauth-test-fixtures.ts` y los `.test.ts` usan datos ficticios; no deben importarse desde runtime.

- `schemas.ts`: contratos canónicos Zod y tipos. `lib/types.ts` reexporta los tipos públicos. Los archivos en `docs/product-intelligence/contracts/generated/` se derivan con `npm run pi:contracts`; nunca se leen para ejecutar tools.
- `validation.ts`: parseo estricto, versión y presupuestos JSON/UTF-8/profundidad. Los adaptadores deben pasar por este parser antes de las funciones que reciben comandos tipados.
- `policy.ts`: principal confiable, scopes/grants/revocación/producto y CAS. El principal se construye desde bearer verificado; ningún campo del input lo define. El principal devuelto por authorizeTool tiene los scopes efectivos, incluida la intersección del grant.
- `graph.ts`: pertenencia, relaciones, evidencia, epistemología, prioridades, verify y restricciones. Fuente interna necesita autorización externa comprobada; guardar URL no la visita.
- `mutations.ts`: preparación pura de merge de análisis/research y patch. Clona el estado, asigna IDs de servidor y valida el grafo final. Un error deja intacto el estado recibido. Devuelve candidato/baseRevision; no confirma ni garantiza atomicidad en PostgreSQL.
- `strategy.ts`: cierre inmutable de una decisión concreta, incluidos deseos/JTBD/dolores referenciados, facts, fuentes y evidencia. No selecciona por prioridad, declara ganadores ni confirma eventos/punteros.
- `pricing.ts`: conversión monetaria exacta y adaptador a la calculadora existente. Supuestos/defaults/etiquetas aprobadas provienen de una lectura autorizada del servidor.
- `concurrency.ts`: hash canónico y validación/replay de un receipt ya autorizado. No persiste receipts ni locks.
- `generation.ts`: congela contexto autorizado sin lecturas latest, valida dependencias/stamps/assets y calcula hash. No crea jobs. Los workers aún deben comprobar providers, gasto, borrado, revocación, bytes/versiones de assets y el switch QA operativo.
- `context.ts`, `repository.ts`, `service.ts`: lectura/preparación/commit de contexto y precio, revisión/huella, receipt antes de CAS, autorización transaccional y recuperación histórica. `lib/pricing/store.ts` usa el mismo comando; `lib/data/product-intelligence.ts` es el loader UI. La migración de contexto es requisito antes de desplegar ese writer UI.
- `knowledge.ts`/`knowledge-service.ts`: grafo persistente, resultados/diff acotados y estrategia con versiones/eventos inmutables. SQL vuelve a comprobar verify/replay/CAS y el estado de borrado. `knowledge-context.ts`/`context-cursor.ts`: proyecciones, paginación total y cursor firmado con revisión fija y restricciones actuales. Ver ADR 010.
- `mcp.ts`: adaptador oficial SDK 1.32.0 por principal, discovery paginado y envelopes tipados. Runtime publica 29 tools y 29 contratos derivados. Landing usa save_landing_content y generate_gallery_images.

- `oauth.ts`, `oauth-store.ts` y `consent.ts`: bearer JWKS/audiencia/rol/sesiones exclusivas, grant vivo por petición y consentimiento/revocación con Supabase nativo. `consent-ticket.ts` vincula la decisión al usuario/cliente/autorización/recurso; UI bajo cookie merchant y Origin exacto.
- `http.ts`: transporte oficial WebStandardStreamableHTTP stateless, body acotado, scopes y aislamiento por request. `http-runtime.ts` monta metadata/autenticación y liga el ejecutor a la identidad firmada. MCP_ENABLED está apagado por defecto. UGC y galería tienen colas propias; los nombres de tools retiradas no forman parte del protocolo.

El deadline MCP comunica AbortSignal y limita la espera. No equivale a deshacer una transacción ya confirmada ni a detener un proveedor que aceptó un trabajo; la persistencia debe implementar receipt/outbox y reconciliación antes de habilitar generación.

Comprobaciones: `npx vitest run lib/product-intelligence`, `npm run pi:contracts`, `npm run typecheck`. Integración DB opt-in: `PI_LOCAL_TEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/product-intelligence/persistence.local.test.ts lib/product-intelligence/knowledge.local.test.ts`; guard exacto 127.0.0.1:55321, fixtures propios y limpieza. Los scripts OAuth comprueban Supabase/Next locales; la prueba UI usa discovery/lectura en la ruta Next real. No prueban host remoto ni costes externos. Estado global: [implementation-status.md](../../docs/product-intelligence/implementation-status.md).

- `landing-schemas.ts`/`landing-service.ts`: contrato derivado de los componentes Shopify y servicio común de lectura/ingestión final desde chat. Reutiliza copy_runs/page_components; sin generación. Migración de landing obligatoria antes de su loader UI. Ver [análisis](../../docs/product-intelligence/landing-content-mcp.md).

- `pack-labels-schemas.ts`/`pack-labels-service.ts`/`pack-labels-validation.ts`: consulta/ingestión del chat y revisión humana compartida con el editor. Duración referida a facts actuales, no-op/replay, CAS de etiquetas/precio, snapshots y supersession en pack_labels. Migración de etiquetas obligatoria antes de loader/editor. Ver [flujo](../../docs/product-intelligence/pack-labels-mcp.md).

- `content-schemas.ts`/`content-service.ts`: contratos, validadores de arte/texto, propuestas operativas, CAS/receipts y revisión del consejo; lecturas paginadas.
- `learning-schemas.ts`/`learning-service.ts`: métricas reales cacheadas de campañas, medición inmutable y aprendizajes citables como fuente interna; sin atribución inventada ni selección automática.
- `gallery-generation-*`, `lib/page-images/operations.ts`: render explícito, cola durable/claims/reautorización, cron y conciliación de respuesta ambigua.
- `lib/products/render-context.ts`: preflight de vigencia/base también para renders de UI; `lib/pipeline/product-data.ts` comparte el writer de contexto con MCP.

[Entrega de cierre y rollout](../../docs/product-intelligence/chat-content-and-learning.md), [ADR 016](../../docs/product-intelligence/adrs/016-chat-content-learning-and-render.md).
