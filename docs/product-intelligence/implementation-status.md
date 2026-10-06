> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Estado actual: UGC desde el chat

Implementados get/save_ugc_content, generación de keyframes/clips, consulta de operaciones y paquete de montaje. UI/MCP comparten cola, revisión y CAS. Guiones del chat conservan versiones por ejecución; el writer de texto pagado se retiró. Shopify publica videos finales aprobados por variante y Meta incorpora sus selectores al destino. [Flujo, contrato y rollout](ugc-chat-mcp.md), [ADR 014](adrs/014-chat-authored-ugc-and-durable-render.md).

Hay 16 tools habilitadas en runtime y 17 pares de schemas derivados. Migración 20261108000000 validada completa en una transacción local terminada en ROLLBACK y funciones/reglas comprobadas con fixtures propios. Posteriormente, por autorización explícita, quedó aplicada y verificada en producción después del push de `bca07b0`: [registro y evidencia](production-ugc-migration-2026-10-06.md). Se preservaron Auth, región, datos locales y archivos preexistentes sin seguimiento.

Verificación: 1.045 tests habituales y 79 transaccionales locales (14 nuevos UGC), incluido OAuth nativo/SDK HTTP. Typecheck, ESLint de cambios, contratos, tokens y diff pasan. Chromium comprueba 19 componentes × 8 URL × móvil/escritorio, selección/orden de videos y fallback sin JS. Theme Check: cero errores y 42 warnings existentes. Build webpack termina correctamente y mantiene los cinco diagnósticos previos HANGING_PROMISE_REJECTION en rutas ads/onboarding.

Pendiente operacional: verificar despliegue app/cron, actualizar tema y aceptar el flujo con ChatGPT, proveedor y tienda de ensayo. El montaje se conserva local por decisión de arquitectura. No se gastaron créditos ni se publicaron productos/campañas durante las pruebas. Ver pasos y límites en el runbook UGC.

---

# Estado actual: landing por ángulo y hook

Implementación y pruebas locales de arrays por componente, edición/revisión, medios por variante y selección URL en el template Shopify. [Contrato, despliegue y rollback](landing-variants-mcp.md), [ADR 013](adrs/013-component-landing-variants.md). Se mantienen once tools persistentes; get/save_landing_content usan contrato 1.1 con compatibilidad 1.0. Migración 20261107000000 aplicada solo en local. Producción sigue readonly.

Verificación final: 1.034 tests habituales aprobados y 65 transaccionales en Supabase local, ejecutados secuencialmente. Typecheck, ESLint de archivos tocados, contratos, tokens UI, sincronización de copias y build Next webpack pasan. Shopify Theme Check: cero errores, 43 warnings (incluye documentación de parámetros y ajustes existentes). Chromium valida 19 bloques × 8 URLs × móvil/escritorio, imágenes por selector, FAQ, IDs únicos, navegación y default sin JS. El build mantiene los cinco diagnósticos previos HANGING_PROMISE_REJECTION en ads/onboarding. Sin publicación hosted ni consumo de proveedores.

El siguiente paso operacional es aplicar migraciones, desplegar app/MCP y actualizar/probar el tema en una tienda de prueba. El siguiente paquete de producto sigue siendo guiones y planificación UGC desde chat. Videos del carrusel, atribución por selector y host ChatGPT remoto siguen pendientes.

---

# Estado actual: etiquetas de packs desde chat

Se agregan `get_pack_labels` y `save_pack_labels`: **once tools persistentes anunciadas localmente**, catorce pares de contratos con tres de ejecución todavía cerrados. [ADR 012](adrs/012-chat-authored-pack-labels.md) y [flujo/límites](pack-labels-mcp.md).

Se reutiliza pack_labels y su editor/publicador. Chat escribe; MCP guarda una propuesta con snapshot, CAS, receipt y audit. La UI decide con etag de etiquetas/precio y transacción compartida. Duración requiere facts revisados; precio/moneda o respaldo stale impiden consumo en contexto, prompts, preview y publicación. Se retira la generación independiente «Otras etiquetas», sin llamar IA. Los writers de estrategia legacy no pueden reemplazar propuestas MCP.

Verificación final: 1.025 tests habituales aprobados y 61 pruebas DB locales adicionales, con OAuth nativo/SDK HTTP. Typecheck, lint de archivos tocados, contratos, valores UI y build Next webpack pasan. El build conserva los cinco diagnósticos previos HANGING_PROMISE_REJECTION de cookies en onboarding/ads. La migración completa también se compiló desde su estado previo en una transacción con rollback y checks de ACL. No hubo consumo de proveedores ni publicación.

La migración 20261106000000 está aplicada solo localmente. Aplicar las cinco migraciones antes del código, incluso con MCP apagado. Pendientes: guiones/conceptos/plans/eventos/WhatsApp, retiro completo legacy, videos en landing, render/jobs y conexión de ChatGPT remoto. Producción permanece readonly. Las entregas previas se conservan debajo como historial.

---

# Estado actual: contenido final de landing desde chat

La última decisión del comerciante cambia la frontera de ejecución: la escritura se hace en el chat. [ADR 011](adrs/011-chat-authored-store-content.md) y [análisis de componentes/tools](landing-content-mcp.md) sustituyen la suposición anterior de conservar redacción final de landing/UGC en proveedores del servidor.

Implementadas y anunciadas localmente **nueve tools**: las siete de conocimiento/setup más `get_landing_content` y `save_landing_content`. La nueva vertical reutiliza los 16 componentes y ficha, `copy_runs`/`page_components`, validadores y publicador Shopify. Guarda propuestas con snapshot, audit, receipt y CAS; no llama IA, crea imágenes, aprueba ni publica. La UI permite revisión sin pipeline legacy, avisa cambios de contexto y bloquea reescritura backend de páginas de chat.

Verificación de esta entrega: 1.014 tests habituales pasan, 47 opt-in omitidos en esa corrida; 47 pruebas DB locales pasan secuencialmente, incluidas nueve nuevas de landing y roundtrip OAuth nativo + SDK HTTP de escritura/lectura/replay. Typecheck, ESLint de archivos tocados, valores UI y compilación Next webpack pasan. Build conserva los cinco diagnósticos previos HANGING_PROMISE_REJECTION de cookies en rutas de onboarding/ads. No hubo consumo de proveedores, publicación, despliegue ni escrituras en producción.

La migración 20261105000000 está aplicada solo en local. Aplicar las cuatro migraciones antes de este código. Pendientes: demás textos/guiones/plans por ingestión MCP, bindings de videos en landing, retiro completo legacy, restores atómicos, jobs/render de imágenes/video y validación de chat/host remoto. `ugc_videos` no tiene writer en el publicador actual; contenido de texto no equivale a videos publicados. La permanencia del render de clips quedó como aclaración de alcance. El estado previo se conserva abajo como registro histórico.

---

# Estado de implementación

Fecha: 2026-10-06. Dirección aceptada: optimización desde chat; [ADR 006](adrs/006-chat-first-optimization.md). Código: [dominio](../../lib/product-intelligence/README.md).

## Implementado y comprobado localmente

- Diez pares de contratos Zod, tipos públicos compartidos y 21 artefactos JSON Schema derivados. Ajv 8 valida draft 2020-12 completo, junto con 17 requests, 16 responses, 20 rechazos y límites UTF-8/pricing. La fuente de runtime es TypeScript.
- Políticas de dueño/producto, grants/scopes efectivos, verify, revisión/etag, hash canónico y replay sobre receipts proporcionados. Referencias locales tipadas e IDs asignados por servidor.
- Preparación pura de merge de análisis/research y patch create/update/archive/restore/reprioritize: omisión conserva, [] no borra, no-op conserva revisión, dry-run no entrega IDs durables. Se valida el grafo final sin mutar el original. Cambiar contenido/respaldo revisado exige verify y revisión explícita del fact con motivo; audit/hash de esa revisión ya se confirman con la persistencia de conocimiento.
- Calculadora compartida con conversiones exactas de moneda, costo proveedor y supuestos explícitos; precios derivados del servidor y etiquetas aprobadas distintas de propuestas.
- Constructor de snapshot de estrategia y contexto congelado de generación. Se valida cierre de deseos/JTBD/dolores, evidencia y revisión vigente de todas las dependencias; base primero y guards de oferta/precio/policies/claims/assets. Una estrategia seleccionada no prueba que sea ganadora.
- SDK MCP oficial **1.32.0**, fijado en lockfile. Client + InMemoryTransport y StreamableHTTPClientTransport prueban inicialización, diez tools, schemas raíz con unions, páginas discovery de máximo 128 KiB, structuredContent/texto idénticos, isError, scopes, dos actores concurrentes y deadline/cancelación al ejecutor.
- OAuth nativo Supabase local: consentimiento y revocación reales, grants/RPC con RLS/ACL, JWKS/ES256 y audiencia/rol/sesión exclusivos. PKCE, refresh, revocación y rechazo de REST/RPC/Storage/Auth comprobados con dos usuarios ficticios. Login y refresh del SaaS mantienen sus claims; cookies delegadas no autorizan UI/API. [ADR 008](adrs/008-supabase-oauth-isolation.md).
- Pantallas de consentimiento/conexiones y enlace condicional desde Ajustes. Cuatro capturas móvil/escritorio claro/oscuro inspeccionadas; axe del contenido WCAG sin violaciones. UI de consentimiento solo activa lectura por defecto. Las APIs OAuth se mantienen bajo cookie y Origin exacto.
- Primera vertical persistente: `get_product_context` y `save_product_context` operan con catálogo/precio existentes, inputs explícitos, CAS, receipts, snapshots históricos y audit atómicos en Supabase local. El writer de Precio y packs de la UI llama al mismo servicio. Los cambios operacionales generan revisión; historia/audit son inmutables. Base de imagen compartida, etiquetas aprobadas vigentes, sin conversión monetaria implícita ni IA/publicación. [ADR 009](adrs/009-persistent-product-context.md).

- Conocimiento y estrategia persistentes: tablas por entidad y puentes con FKs producto/dueño/persona, RLS y escritura exclusivamente por RPC. Research/análisis/patch confirman grafo/revisión/audit/receipt juntos. Verify se comprueba en dominio y SQL; metadata de revisión y replay reautorizado. Versiones de estrategia y eventos inmutables, selección/archivo/no-op, restricciones actuales separadas de historia y stale por dependencias/contexto. Cursores firmados fijan revisión y parámetros; full/summary con presupuesto total de items/bytes. [ADR 010](adrs/010-persistent-knowledge-and-strategy.md).

Estas funciones no hacen llamadas de generación al guardar, ni acceden a producción. La preparación de un candidato en memoria no se presenta como un commit atómico de base de datos.

## Frontera pendiente

El endpoint Next y la metadata están montados: sin `MCP_ENABLED=true` devuelven 404. Con OAuth configurado, el runtime anuncia **siete tools**: get/save_product_context, save_product_analysis, patch_product_analysis, save_research, set/get_product_strategy. Las tres tools de generación/status siguen cerradas con EXECUTION_NOT_READY y no se anuncian. Los diez contratos continúan como objetivo completo.

Faltan outbox/jobs/provenance y adapters de ejecución landing/UGC/Meta; luego revisión/publicación UI y retirada del pipeline de análisis viejo. PDP/assets/performance aún devuelven unknown. Fuentes internas admiten imágenes de referencia/reseñas comprobadas; asset/merchant_note requieren registro canónico futuro. La UI dispone del loader común, pero sus pantallas de revisión todavía no consumen análisis nuevo. No se confirma conexión de un chat remoto del usuario.

El siguiente paquete conecta GenerationContext a los generadores conservados con requests durables y etapas explícitas de coste. Las tres migraciones están aplicadas solo en local. Hosted/host remoto/deploy conservan sus gates. Auth ya tiene autorización de código; producción continúa readonly. Aplicar migraciones antes de desplegar código; la UI de precio depende de la RPC de contexto aun con MCP apagado. [Runbook](oauth-runbook.md).

## Ajustes del contrato durante implementación

Antes del primer despliegue, el snapshot agrega `related_jtbd`, `related_pains` y `desires`, porque los ángulos pueden referir varias entidades y deben reconstruirse sin latest. V1 mantiene una persona por decisión; secundarios corresponden a esa persona, aunque usen JTBD/dolores diferentes. El análisis completo puede guardar múltiples personas. Una estrategia de ejecución que mezcle personas necesitará ampliar el snapshot explícitamente.

El SDK de alto nivel McpServer 1.32.0 omite unions raíz en discovery al normalizarlas como object schemas. Se usa la API oficial Server y se publican schemas objeto con ramas completas y `$defs` locales, comprobados con el cliente oficial y Ajv 2020-12. La paginación es necesaria porque el catálogo completo supera 128 KiB.

## Verificación

Resultados actuales: **1.007 pruebas aprobadas en 83 suites**; las dos suites DB opt-in suman **38 pruebas adicionales** aprobadas contra Supabase local. PI tiene 192 pruebas habituales más 38 transaccionales. `npm run typecheck`, lint de archivos añadidos/modificados y `npm run check:valores` aprobados. `npm run pi:contracts` exporta 21 schemas y valida todos los ejemplos con Ajv 2020-12.

Pruebas reales locales: `scripts/pi-oauth-local.ts` conserva sus 20 comprobaciones. `scripts/pi-oauth-ui-local.ts` verifica cuatro combinaciones visuales/WCAG, consentimiento/revocación, cookie delegada y discovery paginado de las siete tools contra `next start` del build final. Además guarda precio por la API Next real, comprueba 409 de pantalla vieja, recupera ese precio por MCP y rechaza escritura con grant de solo lectura. Las suites DB prueban SDK HTTP con OAuth nativo, contexto y research persistentes, grafo/patch, estrategias, cursores, CAS, rollback y restricciones de uso. No se llamó a proveedores de generación ni se gastaron créditos.

El build final `npx next build --webpack` terminó con exit 0, compilación y TypeScript aprobados. Mantiene los diagnósticos preexistentes `HANGING_PROMISE_REJECTION` de cookies durante prerender en `/api/ads/interests`, `/api/ads/regions`, `/api/onboarding/generation`, `/api/onboarding/shopify/products` y `/api/onboarding/state`; no se considera un build sin diagnósticos. OAuth conserva contenido dinámico por petición y metadata como handler dinámico. No se confirma deploy ni host remoto. El lint global tenía 139 errores y 3 warnings en 34 archivos preexistentes de assets del tema; esta entrega verifica lint de sus archivos, sin modificar el tema ni afirmar limpieza global. La alternativa webpack conserva el workaround del problema previo de puertos de Turbopack.

Las migraciones OAuth, contexto y conocimiento están aplicadas solo en local. Se compilaron completas en transacciones terminadas en rollback con checks de RLS/ACL. GoTrue local es v2.197.0. Los fixtures de pruebas se borraron: un usuario previo, cero clientes OAuth vivos, grants, cabezas, revisiones y receipts PI. No se ejecutó reset. Se detuvo la preview iniciada para probar el build. Generación/host remoto conservan sus gates. Producción sigue readonly, sin migraciones/configuración/deprecación/escrituras.

Las nueve entradas de npm audit ya existían con las mismas versiones en el lockfile anterior (toolchain y dependencias transitivas). No se aplicó audit fix ni una actualización de toolchain ajena al alcance. El pin del SDK no sustituye audience validation ni guards de autenticación.
