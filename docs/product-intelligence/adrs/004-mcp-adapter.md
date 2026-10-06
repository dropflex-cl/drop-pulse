# ADR 004 — Adaptador MCP y gate de runtime

Estado: SDK/HTTP/OAuth y ejecutor de contexto/conocimiento/estrategia implementados y probados localmente; resto de tools/deploy/host pendientes. Fecha: 2026-10-06.

Actualización de alcance: [ADR 006](006-chat-first-optimization.md) amplía las seis tools de conocimiento con setup, generación y consulta de jobs. Las referencias de protocolo/auth y el gate de SDK siguen aplicando; discovery debe comprobar el conjunto ampliado autorizado. Requests de generación responden con operación, sin esperar render en una llamada MCP.

## Decisión de protocolo

Fijar referencia de contrato **MCP 2025-11-25**, schemas JSON 2020-12 y las diez tools de ADR 006. El adapter local traduce inputs a comandos del dominio y responde con structuredContent y representación JSON textual consistente. Errores de negocio usan isError/envelope tipado; errores de protocolo usan JSON-RPC. Referencia: [especificación de tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). Schemas generados desde tipos Zod compartidos y comprobados con Ajv 8 draft 2020-12 y Client oficial.

Annotations: reads readOnlyHint=true; writes readOnlyHint=false e idempotentHint=true bajo clave válida; archive/revocación se declaran según su efecto. Son metadatos del host, no sustituyen permisos, transacción ni confirmación de negocio. Timeout/rate limit y errores accionables pertenecen al servidor.

Preferir Streamable HTTP con respuesta JSON y estado de negocio persistente. En V1 no se necesitan notificaciones SSE ni historial de sesión en memoria; GET puede responder 405 cuando no haya stream. Validar Origin conforme al transporte y headers/métodos; el bearer valida autorización independientemente de Origin. Referencia: [transportes MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Propuesta de entrada `app/api/mcp/route.ts` Node.js y metadata de autorización, delegando a `lib/product-intelligence/`. Crear instancia/transport de servidor por request según API de la versión elegida; no compartir singleton conectado entre clientes. Pruebas de aislamiento deben demostrar que ninguna respuesta/evento llega a otro actor. Mantener services independientes del framework para mover solo el adapter si el spike del hosting falla. No crear un SaaS o catálogo paralelo.

## SDK y riesgo comprobado

Se instaló y fijó **@modelcontextprotocol/sdk 1.32.0** en package.json/lockfile, Node >=18, disponible en npm. Referencia primaria: [SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk). La inicialización local negocia la versión del SDK; Client/InMemoryTransport oficiales prueban discovery, llamadas, errores, aislamiento de principal y deadline.

La [alerta de audience validation GHSA-rvq5-wwqv-78pq](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-rvq5-wwqv-78pq) publicada el 2026-10-05 indica versiones afectadas desde 1.6.0 hasta antes de 1.32.0. Además de la release parcheada, exige configurar/verificar la audiencia del recurso; actualizar por sí solo no demuestra autorización correcta. La disponibilidad npm/pin sí se comprobó durante implementación. El verificador OAuth y expectedResource se implementaron y probaron por JWT/JWKS real local; ver ADR 008. Las pruebas en memoria por sí solas no autentican bearer.

Se usa la API oficial `Server` con request schemas oficiales. La API de alto nivel `McpServer` de esta versión omite unions raíz al normalizarlas como object schemas; esto afecta set_strategy/generate y salidas de éxito/error. El adapter publica raíces objeto con ramas completas y `$defs`, sin construir un protocolo artesanal. Discovery pagina las diez tools dentro de 128 KiB; también mide el resultado completo de callTool, incluido el texto duplicado. Las pruebas comprueban ambos límites.

La [alerta de aislamiento de transport GHSA-345p-7cg4-v4c7](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-345p-7cg4-v4c7) refuerza la decisión de no compartir un servidor conectado entre clientes. El spike incluye concurrencia entre dos tenants; no basta con listar tools en uno.

## Gate de implementación

1. Pin/Node/init/discovery/envelopes/aislamiento local comprobados con SDK 1.32.0. Audience/resource, HTTP, revocación y verificador real local comprobados; falta ejecutor transaccional.
2. Next/Vercel: bundling, ejecución Node, requests simultáneos, timeout de 15 s, límites por bytes, CORS/Origin y respuestas JSON/MCP verificadas en preview de región esperada. La configuración `gru1` es declarada; el deploy real no se midió.
3. Host objetivo: discovery de las diez tools, autorización, lectura/escritura, generación asincrónica, revocación y recuperación en un chat nuevo. No presuponer transferencia de imágenes del chat.

Si falla hosting, evaluar un gateway Node que importe los mismos services/contratos y acceda a la misma RPC autorizada; justificar operación/despliegue adicional antes de adoptarlo. No desarrollar un protocolo MCP artesanal para evitar el gate del SDK.

El [plan de auth](../auth-change-plan.md) registra la autorización recibida y la excepción de proxy implementada, junto con aislamiento de cookie delegada. No hay deploy ni cambios productivos; el runtime local conecta las siete tools de conocimiento/setup al ejecutor persistente y conserva cerradas generación/status. [ADR 009](009-persistent-product-context.md) y [ADR 010](010-persistent-knowledge-and-strategy.md). El [estado de implementación](../implementation-status.md) registra pruebas y límites; el build no certifica hosting MCP.
