# Historial de implementación (sustituido)

Este registro conserva decisiones y comprobaciones anteriores. No describe el runtime ni el esquema vigente. Para estado, pendientes y despliegue, consultar [estado actual](implementation-status.md), [contratos actuales](mcp-contracts.md) y [migración](migration-and-rollback.md). Los endpoints, contratos y conteos de aquí pueden estar retirados.

## Registro anterior: implementation-status.md

# Estado vigente: contenido y aprendizaje implementados

Completadas las tools de conceptos/dirección de arte/conversaciones, planes de galería, eventos, consejos WhatsApp, render de galería y performance/aprendizaje persistentes. Información base y navegación leen el contexto/selección canónicos; los estáticos conservan selectores de landing en Meta. **29 tools anunciadas, 30 contratos derivados**. [Recorrido, migraciones, límites y rollback](chat-content-and-learning.md), [ADR 016](adrs/016-chat-content-learning-and-render.md).

Verificación de cierre: **1.028 tests generales** aprobados, **94 transaccionales locales** aprobados (313 tests de PI contando sus unitarios), OAuth nativo con 20 checks y SDK MCP sobre Next real. Chromium comprueba **12 vistas** (consentimiento, Información base y consejo WhatsApp; 390/1280, claro/oscuro) sin fallos WCAG 2.1 AA ni desborde horizontal, con aprobación del consejo e aislamiento de token MCP en cookies. TypeScript, ESLint de los cambios, contratos Zod/Ajv, tokens y diff pasan. Build webpack finaliza con exit 0; persisten los cinco diagnósticos previos HANGING_PROMISE_REJECTION en Ads/onboarding. Capturas locales inspeccionadas; usuarios/clientes fixture eliminados.

Las nueve migraciones `20261109000000`–`20261117000000` quedaron aplicadas y verificadas en producción después del push de `8531956`: [registro](production-content-migrations-2026-10-06.md). Pendiente operacional: verificar despliegue app, configurar/verificar discovery OAuth/MCP público, aceptar desde ChatGPT y probar renders/publicación en ensayo. La comprobación pública actual devuelve 404. COD y atribución causal por ángulo/hook requieren una fuente comprobada adicional; no se inventan datos. No hubo gasto externo ni publicación durante esta entrega.

Los apartados siguientes conservan el historial de entregas anteriores; sus conteos y pendientes corresponden a cada entrega.

---

# Estado actual: retiro de writers pagados de texto

Retirados físicamente ejecución, prompts, arranque de corridas, acciones UI y scripts antiguos de redacción. POSTs de producto, textos de eventos y editor/activación de prompts responden 410 con sus permisos intactos. La UI conserva revisión/edición y consulta la estrategia seleccionada por el servicio PI compartido. Render de imágenes/video, cálculo de precios/packs, datos guardados y operación Shopify/Meta se conservan. Anthropic solo es requisito del QA visual opcional.

Verificación local: **1.023 tests aprobados**, 79 transaccionales opt-in omitidos (sin cambios SQL), TypeScript, ESLint de 57 archivos, contratos MCP/Ajv, tokens y diff pasan. Build Next webpack finaliza con exit 0 y mantiene los cinco diagnósticos previos HANGING_PROMISE_REJECTION en Ads/onboarding. Chromium comprueba 36 combinaciones de pantallas con fixtures (390/1280, claro/oscuro): ningún botón de writer pagado, sin desborde horizontal y sin otros errores React. Se observó un diagnóstico existente de hidratación en shipping-timeline por espacios diferentes en Intl.DateTimeFormat.formatRange entre Node y Chromium; ese componente no cambió. Capturas inspeccionadas. Usuarios temporales locales eliminados; sin gasto en proveedores ni llamadas a producción.

Esta entrega no requiere migraciones y no borra contenido/tablas. Validación local completada; despliegue pendiente de verificación. [Inventario, rollout y límites](legacy-text-retirement.md), [ADR 015](adrs/015-retire-paid-text-writers.md).

Faltan tools MCP de ingestión para conceptos estáticos/conversaciones creativas, planes de galería, textos de eventos y consejos de WhatsApp. Se conservan artefactos anteriores y defaults, sin fallback pagado. También queda adaptar toda la navegación y los datos base de las vistas conservadas al contexto PI canónico. Retirar los writers no equivale a completar esos adapters. Los siguientes apartados se conservan como historial.

---

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


---

## Registro anterior: implementation-backlog.md

# Estado vigente: contenido y aprendizaje implementados

Completadas las tools de conceptos/dirección de arte/conversaciones, planes de galería, eventos, consejos WhatsApp, render de galería y performance/aprendizaje persistentes. Información base y navegación leen el contexto/selección canónicos; los estáticos conservan selectores de landing en Meta. **29 tools anunciadas, 30 contratos derivados**. [Recorrido, migraciones, límites y rollback](chat-content-and-learning.md), [ADR 016](adrs/016-chat-content-learning-and-render.md).

Las nueve migraciones `20261109000000`–`20261117000000` quedaron aplicadas y verificadas en producción después del push de `8531956`: [registro](production-content-migrations-2026-10-06.md). Pendiente operacional: verificar despliegue app, configurar/verificar discovery OAuth/MCP público, aceptar desde ChatGPT y probar renders/publicación en ensayo. La comprobación pública actual devuelve 404. COD y atribución causal por ángulo/hook requieren una fuente comprobada adicional; no se inventan datos. No hubo gasto externo ni publicación durante esta entrega.

Los apartados siguientes conservan el historial de entregas anteriores; sus conteos y pendientes corresponden a cada entrega.

---

# Prioridad actual: completar cobertura de ingestión MCP

Retirados físicamente los writers pagados de texto y las acciones UI, con APIs antiguas autenticadas 410. Sin migraciones ni eliminación de contenido. [Inventario y límites](legacy-text-retirement.md), [ADR 015](adrs/015-retire-paid-text-writers.md).

Pendiente: get/save para conceptos estáticos/dirección de arte y conversaciones creativas, planes de galería, textos de eventos y consejos de WhatsApp. Reutilizar tablas/render/revisión existentes; agregar snapshots/CAS/receipts/audit y pruebas de aislamiento. Luego adaptar los datos base y el navegador de etapas al estado PI canónico sin proyectar análisis legacy y completar el piloto ChatGPT/Shopify/Meta. No reintroducir redacción pagada para cubrir estos huecos.

Los siguientes apartados son registros de entregas anteriores.

---

> UGC desde chat implementado: ingestión, revisión, cola durable, renders, conciliación, montaje y vínculos Shopify/Meta. [Estado y pasos de despliegue](ugc-chat-mcp.md). Los paquetes históricos siguientes no reflejan por sí solos el avance actual.

> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Landing por ángulo y hook completada localmente

Implementación y pruebas locales de arrays por componente, edición/revisión, medios por variante y selección URL en el template Shopify. [Contrato, despliegue y rollback](landing-variants-mcp.md), [ADR 013](adrs/013-component-landing-variants.md). Se mantienen once tools persistentes; get/save_landing_content usan contrato 1.1 con compatibilidad 1.0. Migración 20261107000000 aplicada solo en local. Producción sigue readonly.

El siguiente paso operacional es aplicar migraciones, desplegar app/MCP y actualizar/probar el tema en una tienda de prueba. El siguiente paquete de producto sigue siendo guiones y planificación UGC desde chat. Videos del carrusel, atribución por selector y host ChatGPT remoto siguen pendientes.

---

# Prioridad actual: guiones y conceptos desde chat

Landing y etiquetas de packs completadas localmente. Once tools anunciadas; [etiquetas y límites](pack-labels-mcp.md). Siguiente paquete: consulta/ingestión de guiones y planificación UGC, después conceptos/dirección de arte y prompts de anuncios. Imágenes permanecen con proveedores del SaaS; render de clips pendiente de aclaración de alcance. Continúan planes de imágenes, eventos, WhatsApp, retiro completo legacy y piloto ChatGPT remoto.

---

# Prioridad actual: todo el texto desde chat

La decisión actual y [ADR 011](adrs/011-chat-authored-store-content.md) sustituyen la estimación/suposición de writers finales pagados de abajo. Landing completada localmente con dos tools de ingestión/lectura; quedan adapters de guiones/planes/conceptos/packs/eventos/WhatsApp, ver [inventario y límites comprobados](landing-content-mcp.md). Imágenes permanecen con providers del SaaS. Render de clips pendiente de aclaración. Los jobs de escritura de texto ya no son el siguiente paquete.

---

# Backlog vigente: optimización desde chat

Dirección: [approach](approach-chat-first.md), [ADR 006](adrs/006-chat-first-optimization.md) y [plan de transición](migration-and-rollback.md). Sustituye las tareas de backfill/proyección del análisis anterior. El spec adjunto sigue aportando las garantías de las seis tools de conocimiento; el alcance se amplía con setup y generación UGC/landing solicitados por el usuario.

## Trabajo ya realizado

Auditoría estática y validación readonly de producción entregadas. La primera base de [dominio y adaptador SDK local](implementation-status.md) está implementada: tipos Zod, schemas derivados/Ajv 2020-12, grafo/permisos/revisión/replay, preparación de merge/patch, calculadora, cierre de estrategia y contexto congelado. Se descubre el catálogo de diez tools con Client/InMemoryTransport oficiales. OAuth/HTTP y grants se implementaron y probaron en Supabase/Next locales ([ADR 008](adrs/008-supabase-oauth-isolation.md)); las siete tools de conocimiento/setup operan con persistencia local ([ADR 010](adrs/010-persistent-knowledge-and-strategy.md)). Faltan cliente remoto real, workers y [casos de integración](contracts/domain-cases.md). No se modificó producción ni se desactivó el flujo vigente. Los formatos antiguos solo sirven para regresión de piezas/Meta, sin poblar el modelo nuevo.

## Primera entrega

Estimaciones de días de ingeniería, no calendario. Suposición: chat aporta contexto/brief y writers UGC/landing conservados redactan finales. Si se elige ingestión de guiones/textos terminados desde chat, ajustar contratos/adaptadores y estimación antes de implementar esa variante.

| Paquete | Trabajo | Aceptación | Dependencias | Esfuerzo |
|---|---|---|---|---|
| 1. Contratos y fixtures | Base local entregada: schemas desde dominio, preparación de mutaciones y snapshots, pruebas de invariantes/2020-12. Integración transaccional en paquete 3 | Grafo enviado desde chat, errores accionables, fuentes/hipótesis/selección separadas; ninguna llamada IA al guardar | ADR 006/007; dominio puede avanzar sin host | 3–5 días, estimación original del paquete |
| 2. Auth y spike MCP | SDK/HTTP/OAuth y siete tools persistentes comprobados localmente. Auth autorizado. Faltan hosted/host remoto y generación/status | Discovery, aislamiento de respuesta, read/write/verify/generate autorizados, revocación; cookies solo UI | Contrato; host/configuración hosted pendientes; sin permiso de escritura productiva | 3–6 días |
| 3. Persistencia y jobs | Contexto/grafo/research/patch/estrategia y cursores ya tienen persistencia local, FKs/RLS/RPC, CAS/receipts/audit/historia y cascadas. Pendientes outbox/generation_requests y provenance | Batch atómico, replay concurrente, snapshot exacto, delivery reintentable y cascadas | Contrato; PostgreSQL aislado | 5–8 días, estimación original |
| 4. Contexto y calculadora | Implementado localmente: setup/precio UI y MCP con writer único, proveedor/defaults, base, precisión, revisión, protección de pantalla vieja y etiquetas aprobadas vigentes. Pendiente propuesta de etiquetas desde chat | Costo proveedor requerido para cálculo; supuestos faltantes explícitos; pack recomendado correcto; precios no cambian Shopify al guardar | 1/3; servicios pricing actuales | 2–3 días, estimación original |
| 5. Landing y UGC directos | Reemplazar loaders legacy; writers/render/QA con contexto compacto; requests por etapa, status, outputs revisables | No fichas/avatares/rankings falsos; un ángulo válido para UGC; sin relecturas latest; reescritura parcial conserva aprobado | 1/3/4 | 6–10 días |
| 6. UI y Meta preservados | UI de contexto/revisión/publicación; retirar acciones/stages de análisis; adaptar adsContext/medios/stamps; mantener render creativo y operación Meta | Catálogo/Storage/Shopify intactos; campañas/budgets/engine/sync existentes funcionan; ninguna reconstrucción legacy como contexto | 3/5; design-system | 4–7 días |
| 7. Deprecación y piloto | Desactivar writers/endpoints antiguos, aislar jobs en vuelo, pruebas de coste/host/rollback y runbook | Nuevo chat recupera estado; guardar no cobra; replay no duplica job; no llamada product_data/strategy/ángulos/hooks en flujo nuevo | Todos; gates del plan | 2–4 días |

Total orientativo: **25–43 días de ingeniería**, más preparación/acceso a entorno aislado y esperas de proveedor/host. Retirar backfill elimina trabajo, pero incorporar generación y preservar Meta exige adaptadores/regresión. No equivale a promesa de entrega ni a ahorro porcentual de tokens.

## Pruebas que definen aceptación

| Caso | Resultado exigido |
|---|---|
| Contexto nuevo de producto antiguo | Conserva catálogo/pricing/assets, análisis/selección vacíos; no importa product_data/avatar/ranking viejo. |
| Precio proveedor y supuestos | Mismos resultados de la calculadora actual en UI y servidor; no salvar derivados del chat; defaults válidos y faltantes explícitos. |
| Cambia pricing | Packs recalculados, etiquetas/oferta dependiente stale, nueva revisión; Shopify/campañas no se modifican implícitamente. |
| Guardar análisis/research/estrategia | Cero llamadas a modelos o proveedores; IDs servidor y refs coherentes; unknown fields rechazados. |
| Merge/patch/dry_run/no-op | Omisión conserva, [] no borra, null solo nullable, batch todo o nada; dry_run no consume key; no-op no crea revisión. |
| Dos chats revision N | Un commit; otro conflicto explícito, sin perder ediciones. |
| Replay / misma key diferente contenido | Mismo receipt/job sin nueva corrida; cambio de payload rechaza. |
| Otro tenant/producto | Rechazo en tool, relaciones, fuente, asset, estrategia, job/cursor y RPC sin filtrar datos. |
| Verify/claims | Write no aprueba ni cambia contenido aprobado conservando verificación; revocar conserva historia y bloquea uso dependiente. |
| Lectura paginada/histórica | Revisión consistente, auxiliary snapshots con fecha, cursor autorizado; no atribución retrospectiva de performance. |
| Generación mínima | UGC usa un angle_id y snapshot válido sin exigir dos briefs legacy; landing no exige avatar aprobado anterior. |
| Job y edición simultáneos | Worker utiliza input congelado, output asociado a esa revisión y no sustituye material/selección más recientes. |
| Etapas pagadas | Guardar no arranca ninguna; script/keyframes/clips/images explícitos y con revisiones previas requeridas. Consulta de status no hace polling externo. |
| Respuesta ambigua de proveedor | Se concilia provider_request_id; sin retry ciego que pueda repetir gasto. La garantía externa se documenta por proveedor. |
| Meta regression | Media/upload, templates, campaign/adset/ad, launch, budgets, engine, insights y reglas existentes pasan; IDs preservados. |
| Piezas conservadas | PDP/UGC/assets ya existentes siguen visibles/revisables/publicables; provenance antigua unknown, no inventada. |
| Retirada | Ningún camino nuevo carga latestBrief/latestAvatars/approvedAngles ni dispara informe/extracción/agentes; APIs retiradas no producen nuevas corridas. |
| Borrado Shopify | Storage primero, pausa Meta, cascadas PI/jobs/audit/receipts; fallo de Storage y carrera con escritor permiten reintento seguro. |
| Cliente real | Nuevo chat reconstruye contexto; scopes, expiry/revocación, output/error MCP y diez tools verificadas con el host objetivo. |

Fixture principal: cuatro personas/varios ángulos enviados desde chat, facts no verificados, fuentes reales referenciadas, lenguaje synthetic, precio calculado y selección explícita. Generación con proveedores mock en pruebas aisladas, sin gastar créditos productivos. Fixtures adicionales de campañas y piezas antiguas sin provenance canónica y de jobs legacy en vuelo. No reconstruir contenidos sensibles productivos para estas pruebas.

## Trabajo posterior

- Ingestión de guiones/textos terminados desde chat si se elige esa frontera: validación/encaje/render sin reescribirlos; no silently fallback a redacción pagada.
- PDPVersion completo, operaciones de publicación con readback y retención de assets publicados; reusar publicador actual.
- Experimentos/learning con regla, ventana y source, y COD desde una fuente comprobada; compras Meta no equivalen a cobrado/entregado.
- Cleanup físico de tablas/campos de análisis retirado solo después de verificar que no rompe piezas/jobs/Meta conservados. No es requisito para habilitar el modelo MCP.

No reintroducir generación de análisis como fallback para resolver missing_fields o acelerar migración. El chat corrige el contexto; el SaaS valida, persiste y ejecuta las salidas conservadas.


---

## Registro anterior: migration-and-rollback.md

# Transición, deprecación y rollback

Plan vigente según [ADR 006](adrs/006-chat-first-optimization.md). Sustituye el backfill semántico y las proyecciones a fichas/avatares/rankings de la propuesta anterior. **No se ejecutaron migraciones, deprecación de código ni escrituras en producción.** La migración de grants OAuth sí se aplicó y comprobó en Supabase local; ver [ADR 008](adrs/008-supabase-oauth-isolation.md) y [rollback OAuth](oauth-runbook.md#rollback-operativo).

Las migraciones de contexto y conocimiento también están aplicadas y probadas solo en local. Conocimiento agrega grafo/estrategia/cursores; no incluye jobs ni retirada del pipeline. [ADR 010](adrs/010-persistent-knowledge-and-strategy.md). Antes de desplegar código, aplicar OAuth/contexto/conocimiento: Precio y packs de UI depende de la RPC aun con MCP apagado. Para rollback, restaurar el writer y contrato UI de precio anteriores antes de retirar funciones/triggers. Mantener tablas/historia; no usar un reset ni borrar precios para revertir código. [ADR 009](adrs/009-persistent-product-context.md).

## 1. Qué entra al sistema nuevo

Catálogo, dueños, conexiones, mercado, políticas, pricing guardado, referencias/assets, componentes/UGC existentes, publicaciones, medios/campañas/métricas Meta y costes se conservan con sus IDs. No reinicializar ni cambiar precios/publicaciones/configuración de campañas por crear el agregado MCP.

Análisis anterior no se importa: product_data/fichas, avatares, rankings/desarrollos, informes/extracciones, diferenciador/hipótesis y hooks generados quedan fuera del nuevo contexto. No pi_legacy_links, no candidatos bootstrap ni job IA de completar. La revisión 0 representa ausencia de conocimiento nuevo; el primer setup/guardado explícito produce la primera revisión. Los datos operativos retenidos se incluyen con procedencia/fecha, sin tratar su coexistencia como una nueva selección de marketing.

[Producción readonly](production-validation.md) ya comprobó ocho productos, 52 tablas, 36 versiones de migración, formatos y metadatos Storage. Un solo dueño no verifica aislamiento. No hace falta exportar payloads productivos: recrear fixtures sintéticas de dos tenants, contextos nuevos, precios válidos/incompletos y piezas/campañas antiguas conservadas. Probar PostgreSQL, grants/RLS y recuperación en entorno aislado.

## 2. Gates de implementación

| Gate | Entrega | Comprobación antes de avanzar |
|---|---|---|
| A — Contrato | Schemas de conocimiento, setup, GenerationContext y jobs; política de coste; spike OAuth/SDK/host | Inputs/outputs tipados; pricing reutiliza fórmulas actuales; contenido incompleto devuelve faltantes sin IA; host autentica y descubre tools. |
| B — Persistencia | Tablas aditivas, RPCs, FKs compuestas, CAS, receipts, revisiones/audit, outbox y requests de generación | Dos tenants, conflicto entre chats, replay concurrente, rollback total, revocación y cascadas; ninguna table nueva duplica catálogo/pricing/assets/Meta. |
| C — Consumidores | Loaders directos de landing, UGC, imágenes y Meta; provenance en runs/medios | Ningún job nuevo lee/latest el análisis antiguo ni escribe proyecciones legacy; inputs congelados; stages no dependen de allApproved legacy. |
| D — Retirada | Acciones/UI/endpoints de análisis anterior desactivados, paths de generación revisados, runbook | No nuevas llamadas product_data/strategy/ángulos/hooks; UI conserva calculadora, revisión de piezas y publicación; Meta sigue operativo. |
| E — Piloto | Contexto nuevo desde chat y dos salidas revisables, prueba de coste/replay | Guardar no genera ni cobra; UGC/landing se inician expresamente; no doble cargo interno por replay; piezas llevan revisión exacta. |

Las migraciones solo se preparan después del contrato y se prueban aisladas. Antes del piloto, repetir los diagnósticos readonly pertinentes porque producción puede cambiar. Indexar/agregar constraints con estimación de locks; no corregir filas ni borrar assets silenciosamente.

## 3. Retirar dependencias en el orden correcto

1. Implementar dominio/contratos y nuevos loaders detrás de flags de despliegue. La UI operacional puede seguir mostrando piezas existentes; MCP de escritura/generación permanece deshabilitado hasta que sus garantías estén verificadas.
2. Reusar PricingSection y calculadora, integrando el guardado del plan/stamp con revisión del contexto. Conservar defaults/supuestos y las etiquetas ya aprobadas como configuración comercial; retirar generación de etiquetas ligada al cliente ideal. Etiquetas nuevas vienen del chat y se revisan en el componente actual.
3. Adaptar loadContext/runCopy y startScript/runScript a GenerationContext inmutable. Reusar writers/validadores/render existentes sin consultar UUIDs de ficha/avatar/brief viejo. Imágenes/creativos vinculados a estas salidas consumen el mismo snapshot; brief creativo viene del chat, no de una evaluación autónoma anterior.
4. Adaptar adsContext, hooks, stamps y relación de medios a ángulos canónicos. Conservar IDs de campaña/adset/ad, launch, reglas/engine, budgets, sync y métricas. Las piezas antiguas sin angle_id canónico mantienen metadata operativa; no reatribuirlas por slot/título/fecha.
5. Cambiar loaders `lib/data`, estados de Hoy/lista y navegación. Contexto/precios incompletos producen un motivo claro; no exigir aprobación de avatar/ranking ni dos ángulos para un UGC. Rutas antiguas de optimización redirigen a contexto o devuelven error de deprecación cuando corresponda; las rutas operativas Meta/Shopify se conservan.
6. Desactivar creación/confirmación de análisis anterior y las acciones equivalentes en UI. No borrar tablas todavía: primero probar que no quedan consumidores nuevos ni jobs en vuelo que dependan de ellas.

No se hace dual write a conocimiento viejo y nuevo. Las escrituras UI de setup/precio/assets o revisión de piezas siguen sus reglas; las del análisis/estrategia ocurren por MCP. Un callback tardío guarda su salida histórica asociada al input original y no reemplaza selección/output más reciente. El piloto requiere cierre controlado o aislamiento explícito de jobs legacy pendientes; no cortar ni reiniciar jobs de Meta como parte de la retirada de análisis.

## 4. Rollback

| Momento | Acción | Preservación |
|---|---|---|
| Flags apagadas / tablas aditivas | Revertir handlers/loaders nuevos | Datos y operación anteriores permanecen; no DROP en rollback operativo. |
| Contexto nuevo, sin ejecución | Deshabilitar MCP writes si hay fallo; mantener reads y UI operacional | Conservar todas las revisiones aceptadas; no convertirlas a avatar/ficha ni volver a ejecutarlas en mega prompt. |
| Generación nueva aceptada | Suspender nuevos pedidos, conciliar jobs/provider_request_id y aplicar forward fix | Outputs/snapshots/receipts se preservan; no reintentar a ciegas una operación pagada ambigua. |
| Publicación/campaña externa | Usar operaciones existentes y revisión del comerciante para restauración específica | Revertir DB/código no revierte Shopify, gasto ni campañas Meta. No launch/publicación automática por rollback. |

Si un rollback de deploy necesita loaders anteriores, las piezas viejas pueden seguir siendo visibles, pero no usar sus análisis como sustituto del contexto nuevo. No bajar revisiones, limpiar receipts ni reactivar automáticamente agentes de análisis. Backup restaurado requiere conciliar solicitudes aceptadas y jobs posteriores al punto de recuperación.

Cleanup físico del análisis deprecado es una tarea posterior: comprobar FKs de piezas/campañas/jobs y columnas legacy aún necesarias, definir retención/export autorizado si se requiere, y solo entonces preparar eliminación. Los datos de Meta y los assets/PDP/UGC conservados no son candidatos a limpieza del análisis.

El borrado de producto por Shopify mantiene su obligación completa: pausa Meta, Storage primero, después cascadas de todas las tablas nuevas, revisiones, receipts, solicitudes, outbox y contextos. Serializar eliminación y escritura para que no se creen hijos durante limpieza de Storage; probar reintento tras fallo sin modificar el orden requerido.

## 5. Medir la transición

Medir request_id/actor/tool/revisión/operation_id, conflictos, replays, missing_fields, p50/p95, bytes y outbox. Por generación: llamadas por paso, tokens/coste registrados, proveedor visual, intentos y resultados parciales. No registrar tokens de auth ni payloads completos.

Comparar cargas equivalentes antes/después: guardar contexto no llama IA, seleccionar no genera, y una generación solo ejecuta pasos solicitados. El presupuesto limita tokens/reintentos y permite estimar gasto; no anunciar un tope externo exacto sin soporte del proveedor. SLO de tools: 15 s máximo para crear/leer requests y p95 propuesto <2 s en operaciones habituales; los workers de generación se miden aparte.

Expandir piloto por cohortes solo tras regresión de calculadora, revisión/publicación, media/campañas/engine Meta y recuperación de contexto desde un chat nuevo. El volumen actual sirve como evidencia de formatos, no prueba escala.

## Migración UGC 20261108000000

Extiende guiones/tomas/medios, conserva versiones por ejecución y agrega pi_ugc_operations. Instalación completa validada en transacción local con rollback, sin reset. Posteriormente aplicada y verificada en producción el 2026-10-06, después del push del commit funcional: [registro](production-ugc-migration-2026-10-06.md). Verificar despliegue app/cron y actualizar tema Shopify. Rollback funcional conserva tablas, historia y lectores/revisión compatibles, desactiva nuevas generaciones y concilia trabajos externos. [Detalle](ugc-chat-mcp.md#despliegue-y-rollback).

## Entrega de cierre: migraciones 09–17

Nueve migraciones aditivas, verificadas primero en local y posteriormente aplicadas en producción por autorización explícita ([registro](production-content-migrations-2026-10-06.md)): contenido, aprendizaje, revisión del consejo, guards de render, operaciones de galería, claim/snapshot, procedencia estática, referencias de aprendizaje y preflight de despacho. Aplicarlas en orden antes de los nuevos loaders. No hay backfill ni borrado de datos históricos. [Runbook y rollback seguro](chat-content-and-learning.md#despliegue-y-rollback).

El rollback operacional conserva esquema/assets, deshabilita MCP/cron nuevos y concilia lo ya enviado; no reactiva la redacción pagada. Las versiones anteriores de despliegue/migraciones productivas documentadas arriba no incluyen esta entrega.


---

## Registro anterior: legacy-text-retirement.md

# Retiro de redacción pagada del servidor

Fecha: 2026-10-06. Implementación local; sin despliegue ni cambios en producción en esta entrega. [ADR 015](adrs/015-retire-paid-text-writers.md).

## Frontera vigente

El chat escribe análisis, estrategias, guiones, textos y prompts de medios. El SaaS valida, guarda y permite revisar/publicar. Los proveedores del comerciante siguen renderizando imágenes y video. Anthropic queda exclusivamente para la revisión visual opcional de imágenes; no se necesita su clave cuando esa revisión está apagada.

## Código retirado físicamente

- Writers y arranque de corridas de estrategia/extracción, identificación de producto, landing, conceptos/dirección de arte de anuncios, conversaciones creativas de WhatsApp, director de galería, etiquetas de packs, textos de eventos y consejo de uso.
- Prompts de esos writers, streaming de texto del adaptador Claude, proyección automática de estrategias en fichas/avatares/ángulos/ganchos y funciones de inserción legacy huérfanas.
- Editor y activación de prompts en Ajustes, cliente UI de las acciones anteriores y scripts `eval-models.ts` / `spike-strategy.ts` que ejecutaban los writers.
- Botones de redacción/reintento en pantallas y escritura oculta de landing al continuar desde Imágenes.

Los guiones UGC ya habían pasado a chat. Esta entrega conserva sus rutas de render, revisión, conciliación y montaje.

## Compatibilidad HTTP

Los POST antiguos autentican y verifican propiedad antes de devolver `410 Gone`: `/api/products/[id]/strategy`, `/strategy/confirm`, `/product-data`, `/copy`, `/creatives`, `/creatives/chat`, `/page-images`, `/whatsapp/tip`, `/pack-labels` y `/videos`. Conservan 401 sin sesión y 404 para un producto ajeno; no crean trabajos ni llaman a proveedores.

`POST /api/events/[slug]/copy` valida sesión, evento y producto y responde 410. PUT y activación de prompts requieren administrador y responden 410; GET de prompts conserva únicamente el historial para administradores. Los GET de producto, edición manual, decisiones y renders continúan funcionando.

## Capacidades conservadas

Catálogo/sincronización, Auth/OAuth, Storage y optimización de archivos, cálculo de precios/packs, edición y aprobación de contenido guardado, importación de reseñas, publicación Shopify, campañas/medios/operación Meta. No se eliminan filas, buckets, tablas ni migraciones históricas. Los tipos/esquemas usados para leer contenidos antiguos y sus costos se mantienen.

`lib/ai/claude.ts` conserva `generateStructured` porque las tres revisiones visuales aún lo usan: `runQa` en `lib/pipeline/creatives.ts`, `runQa` en `lib/pipeline/page-images.ts` y QA de keyframes en `lib/pipeline/video.ts`. Se conserva `@anthropic-ai/sdk` por esos tres callers y por la validación de la clave del comerciante. El mapa de versiones activas solo contiene estos pasos QA.

La pantalla de estrategia consulta `get_product_strategy` mediante el servicio compartido. El informe anterior queda para consulta; no puede disparar una nueva extracción ni confirmación legacy. Seleccionar una estrategia no prueba que sea ganadora.

## Cobertura MCP y límites

El runtime mantiene sus 16 tools anunciadas. Esta entrega no agrega tools ni nuevas tablas.

| Contenido | Estado |
|---|---|
| Contexto/precio, research, análisis y estrategia | Lectura/escritura MCP existentes |
| Landing y variantes URL | get/save_landing_content existentes; UI revisa y publica |
| Etiquetas de packs | get/save_pack_labels existentes; UI decide |
| Guiones/planificación UGC | get/save_ugc_content y ejecución de medios existentes |
| Conceptos estáticos, dirección de arte y conversaciones creativas | Writer pagado retirado. Falta ingestión/lectura MCP; se editan/renderizan conceptos ya guardados |
| Plan de imágenes de galería | Director retirado. Falta ingestión MCP; se renderizan tomas guardadas o se suben/eligen imágenes |
| Textos de eventos y consejos de uso WhatsApp | Writer retirado. Faltan tools de ingestión; se conservan textos ya guardados y mensajes deterministas/defaults |

Preparar esos últimos materiales en el chat todavía no los persiste en el SaaS. No hay fallback a redacción pagada. Los mensajes operativos de WhatsApp se forman con plantillas y datos reales, sin llamadas a un modelo.

El navegador de etapas conserva parte del vocabulario y estados históricos; adaptar toda la navegación al ciclo MCP y retirar físicamente tablas legacy son trabajos separados. No se convierte una selección PI en ángulos legacy para desbloquear generadores antiguos.

## Rollout y rollback

No requiere migración. Desplegar el código contra la base PI ya migrada. Verificar 410 de APIs antiguas con un producto de ensayo, revisión de una landing conservada y render con QA apagado/encendido; no disparar proveedores pagados como comprobación de despliegue sin un ensayo autorizado.

Una invocación del despliegue anterior que ya haya empezado puede terminar con su código anterior. Evitar nuevos inicios durante el cambio y esperar a que termine su ventana de función (hasta 300 s). El nuevo código no reanuda writers antiguos; la conciliación y expiración de renders conservan su operación. No se afirma cancelación remota de invocaciones previas.

Rollback: volver al despliegue anterior recupera las acciones pagadas; no ejecutar jobs de texto como parte del rollback. Los datos/artefactos no se borraron. Las protecciones SQL existentes contra sobrescribir contenidos MCP siguen vigentes. Cualquier DROP o purga futura requiere otra auditoría de lectores, publicación, Meta y borrado de productos.

## Verificación

Pruebas HTTP de rechazo sin creación de trabajos/proveedores, sesión/propiedad y acceso admin; política estática de callers que permite únicamente los tres QA visuales; tests de renders que exigen Anthropic solo con QA activo; suite habitual, TypeScript, lint de cambios, tokens UI y contratos MCP. Sin invocaciones pagadas ni escrituras productivas. Resultados: 1.023 tests aprobados; TypeScript, ESLint de 57 archivos, contratos, tokens y diff pasan. Build webpack exitoso con los cinco diagnósticos de prerender previos. Chromium verificó 36 combinaciones móvil/escritorio claro/oscuro sin botones de redacción pagada ni desborde. Se conserva un diagnóstico previo de hidratación en la vista previa shipping-timeline (espacios de Intl.formatRange entre Node y Chromium). Ver implementation-status.md.


---

## Registro anterior: mcp-contracts.md

# Contratos MCP: conocimiento, setup y ejecución

Estado: contrato `1.0` previo al despliegue, 2026-10-06. Continúa la auditoría y [ADR 006](adrs/006-chat-first-optimization.md). Tipos/schemas y base de dominio implementados, con adaptador SDK local; faltan servicios persistentes, HTTP/OAuth, migraciones y deprecación. Los [schemas publicados](contracts/README.md) se generan desde TypeScript y se comprueban con los ejemplos.

## 1. Fronteras y transporte

El chat entrega investigación, hipótesis, relaciones y decisiones. Guardarlas no hace fetch de fuentes, llamadas a IA, generación de assets ni publicaciones. El catálogo identifica el producto y conserva Shopify; MCP no crea productos. Los generadores conservados redactan los finales desde ese contexto, supuesto vigente que puede cambiar si el chat entrega las piezas terminadas.

Cada tool recibe un objeto estricto. UUIDs minúsculos identifican recursos ya existentes; `product_id` es el UUID de `products`, no el ID numérico de Shopify. No se reciben `tenant_id`, `user_id`, actor, claves de proveedor, SQL, buckets ni paths de Storage. El backend obtiene `Principal` del mecanismo autenticado, autoriza producto y cada referencia, y llama al mismo dominio que la UI. Un recurso ajeno devuelve `NOT_FOUND` sin datos del dueño.

`schemas.json#/$defs/<tool>Input` y `...Output` conservan el borrador de diseño; `contracts/generated/<tool>.input.json` y `.output.json` provienen del dominio y son la fuente publicada. Raíces objeto con ramas y `$defs` locales completos. Éxito o error se entrega en `structuredContent`, con JSON textual equivalente; error de dominio lleva `isError=true`. Los errores de protocolo siguen el SDK oficial. Discovery se pagina bajo 128 KiB; la respuesta de tool cuenta también la duplicación textual.

| Tool | Scope obligatorio | Efecto |
|---|---|---|
| `get_product_context` | `product_intelligence:read`; `performance:read` además si se solicita performance | Lectura consistente de catálogo/setup/conocimiento y resúmenes operativos. |
| `save_product_context` | `product_intelligence:write` | Merge de datos básicos y cálculo/versionado de pricing. |
| `save_product_analysis` | `product_intelligence:write` | Upsert de hipótesis/grafo/oferta; no selecciona. |
| `patch_product_analysis` | `product_intelligence:write` | Batch tipado todo o nada. |
| `save_research` | `product_intelligence:write`; `product_intelligence:verify` para revisión sensible | Fuentes, facts y evidencia. |
| `set_product_strategy` | `product_intelligence:write` | Crear draft, seleccionar nueva versión o archivar versión. |
| `get_product_strategy` | `product_intelligence:read` | Snapshot y restricciones vigentes para usarlo. |
| `generate_landing` | `product_intelligence:read` + `landing:generate` | Job de contenido **o** imágenes, una etapa por llamada. |
| `generate_ugc` | `product_intelligence:read` + `ugc:generate` | Job de guion, imágenes clave **o** clips. |
| `get_generation_status` | `product_intelligence:read` | Leer progreso/output/costo registrado. No sondea proveedores. |

Las annotations de [tools.json](contracts/tools.json) describen efectos; los permisos se verifican en el servicio y en la persistencia. Generar no concede publicar ni lanzar Meta. La UI conserva esas acciones y decisiones.

## 2. Escrituras, IDs y concurrencia

Toda mutación recibe `schema_version="1.0"`, `expected_revision`, `idempotency_key` y `product_id`; `dry_run=false` por defecto. Revisión 0 representa conocimiento vacío, incluso en un producto con análisis antiguo. Las herramientas de conocimiento/setup crean una revisión solo si cambia contenido o selección. Los jobs conservan la revisión de conocimiento y tienen `status_revision` propia.

Un item nuevo lleva `client_ref` única en toda la llamada; uno existente lleva `id`, nunca ambos. En creación se exigen los campos mínimos de la entidad; en actualización, al menos un campo además del ID. Las relaciones en escritura usan un objeto cerrado `{"id":"…"}` o `{"client_ref":"persona_1"}`. Los nombres terminan en `_ref` o `_refs`; las respuestas persistidas utilizan `_id`/`_ids`. Así no se confunde una clave temporal con un UUID. Esta concreción sustituye la ambigüedad de strings locales del spec, conservando su semántica.

Las referencias locales se resuelven sobre toda la llamada, independientemente del orden de arrays. No pueden apuntar a recursos de una llamada anterior ni cruzar tipo, producto o dueño. El servidor devuelve `id_map`; el modelo no asigna IDs nuevos. IDs/client_refs repetidos y operaciones contradictorias sobre una entidad se rechazan, sin regla de «último gana».

- Omisión conserva el dato. Array vacío conserva las entidades de una colección de upsert; en un campo relacional de una entidad significa sustituir sus relaciones por ninguna, solo si el estado final sigue siendo válido.
- `null` limpia únicamente campos nullable. Campos requeridos no nullable no se pueden vaciar. Las relaciones de un item se sustituyen completas cuando se envían; no se fusionan por posición.
- La creación aplica defaults del dominio: `lifecycle=active`, opcionales nullable a null, `evidence=[]` para hipótesis. No completa contenido ausente con IA. Las respuestas full explicitan estos campos.
- Una mutación no-op conserva revisión y obtiene recibo, sin evento de cambio. `dry_run` valida CAS/grafo y devuelve diff/preview con `applied=false`, sin crear IDs durables, consumir key, guardar recibo ni despachar tareas. La solicitud real debe revalidar.

Orden transaccional: autorización → lock producto/head → recibo → CAS → resolución de referencias → validación de grafo final → escritura/snapshot/audit/receipt/outbox → commit. El recibo se busca antes de comparar revisión: mismo key/hash devuelve el resultado original, aunque el producto haya avanzado; otra intención con esa key devuelve `IDEMPOTENCY_KEY_REUSED`. El replay vuelve a autorizar todos los scopes sensibles y el producto. Retención de recibos: 30 días; no prometer deduplicación indefinida de jobs que no incrementan revisión.

Hash canónico: normalizar defaults declarados, serializar objetos con claves ordenadas y números JSON finitos; conservar orden de operaciones, prioridades y listas cuya posición importe. Las relaciones tratadas como conjuntos se ordenan por referencia al normalizar, con duplicados rechazados. Conservar diferencia entre omisión, null y [] cuando difiera su efecto. Incluir tool, producto, versión, expected_revision y contenido semántico; excluir `idempotency_key`, `dry_run`, request_id y campos de transporte. El mismo dry-run puede convertirse en escritura con la misma key porque no hay recibo previo.

Conflicto exige releer, reconciliar y enviar intención revisada con otra key. `retryable=true` solo habilita reintentar fallos transitorios de la misma intención/key; no convierte un conflicto en overwrite. Un cliente que perdió respuesta después del commit consulta/repite la misma solicitud antes de crear otra.

## 3. Recuperación: `get_product_context`

Defaults: `view=summary`, `page_size=50`, `include_archived=false`; include de facts, research, personas, JTBD, pains, desires, objections, angles, language, offer y strategy, más resúmenes PDP/assets. Performance es opt-in y nunca una serie completa implícita. Catálogo, contexto básico, mercado, policies y plan calculado se devuelven en `product`; la selección no se deduce de prioridades.

`blocks` es una lista tipada de bloques solicitados. `summary` utiliza conteos/resúmenes y campos completos necesarios de selección, sin inventar hallazgos. `full` entrega registros completos paginados. `items=[]` en summary no significa colección vacía: `count` declara su tamaño; `truncated/next_cursor` declaran material pendiente. El bloque strategy usa su campo `strategy`; `items=[]` allí es deliberado. El bloque research agrupa sources/evidence_links; facts se entregan en su bloque propio. Las respuestas full normalizan todos los campos declarados y nunca devuelven claves de la DB por accidente.

Orden de lectura: bloques en el orden de include, entidades por prioridad/ID cuando tienen prioridad y por ID estable cuando no. `page_size` limita **items totales de la página**, además del presupuesto de bytes. El cursor fija actor/dueño/producto/revisión/include/view/filtros/posición, y vence a los 15 minutos. Repetirlo autoriza la lectura sin mezclar revisiones; los parámetros deben coincidir. `CURSOR_EXPIRED` exige reiniciar y `CURSOR_INVALID` no revela el recurso. Si ni un registro cabe, `RESPONSE_TOO_LARGE` explica el bloqueo; no corta un campo ni una relación silenciosamente.

`at_revision` recupera inteligencia y setup del snapshot. `current_revision` y `current_usage_restrictions` indican estado vigente separado; un fact aprobado en el pasado puede estar prohibido hoy. PDP/assets/performance auxiliares llevan `as_of` y disponibilidad. Sin snapshot/provenance histórica, `availability=unknown`, items vacíos y warning `HISTORICAL_EXECUTION_UNKNOWN`, nunca estado vivo atribuido a la revisión pasada. Una lectura actual congela esos resúmenes en su contexto de paginación.

Performance resumen identifica en su texto fuente, ventana y fecha disponible, con `provenance=unknown` cuando no hay atribución canónica. V1 no expone cifras estructuradas nuevas ni escribe learnings: los DTOs métricos y la relación a experimentos necesitan el contrato posterior. Datos Meta actuales no se convierten en pedidos COD entregados.

## 4. Setup: `save_product_context`

Enviar `context`, `pricing` o ambos; objetos vacíos se rechazan. Contexto: display_name, categoría, descripción, texto del proveedor y base_reference_image_id. Primera creación necesita display_name y descripción; puede guardarse incompleta comercialmente. No modifica título/descripción de Shopify. La imagen elegida debe ser referencia del producto; elegir una excluida la vuelve a usar mediante la regla existente. Null solicita el fallback de `pickBase`, no deja sin base si existe una imagen utilizable.

La moneda proviene del catálogo/mercado guardado y no se cambia con esta tool. El DTO de pricing usa enteros en unidad menor: costo, envío, CPA, venta y tachado; tasas y descuento siguen porcentajes, como el formulario actual. `currency_scale` se devuelve desde una escala monetaria validada; no es argumento. Ejemplo: CLP 7000 = $7.000; moneda con escala 2 y valor 7000 = 70,00 unidades mayores. No usar el factor monetario específico de Meta.

Dos modos explícitos:

- `recommended`: cambia inputs enviados, mantiene supuestos omitidos válidos y recalcula venta/tachado sugeridos con `suggestPrices`. Elegir este modo autoriza reemplazar un precio manual por el sugerido. No acepta venta/tachado enviados como derivados.
- `manual`: exige `sale_price_minor` y `compare_at_price_minor` (null sin tachado); el resto modifica los inputs y recalcula con `buildPricingPlan`. Solo esos dos montos efectivos los decide el comerciante/chat.

En primer cálculo el costo del proveedor es obligatorio. Omisiones usan inputs guardados, luego defaults de `pricingDefaults`/onboarding donde corresponda. Se devuelve warning con los supuestos aplicados; falta de envío/CPA para monedas sin default es `VALIDATION_ERROR` con `missing_fields`. Tasas >0 y ≤100, descuento 0–95, envío/CPA ≥0 y tachado > venta cuando existe, según `validatePricingForm`. No se inventan promedios de operación.

El servidor convierte exactamente los importes de entrada, llama a la calculadora existente y construye el snapshot. Los campos `*_minor` cobrables son safe integers; la conversión desde numeric rechaza precisión incompatible. Ganancia, CPA máximo y precio promedio por unidad pueden tener fracciones y se devuelven como `*_decimal` en **unidad mayor**, sin redondearlos para simular importes cobrables. Margen/BEROAS son ratios. El algoritmo comercial conserva su redondeo actual; el nuevo DTO no cambia fórmulas.

Precio/contexto/base cambian revisión por el writer compartido. Cambiar pricing invalida ofertas y etiquetas dependientes; estas quedan stale hasta nueva revisión/selección. Guardar no publica precios ni altera campañas. `product_pricing` sigue siendo la tabla operativa: la implementación deberá integrar su escritura en la transacción común, no llamar un upsert separado después del commit PI.

## 5. Research: `save_research`

Arrays independientes `sources`, `facts`, `evidence_links` de hasta 100 items; al menos uno presente. Nuevos registros completos, existentes parciales. Cada source exige exactamente URL HTTPS **o** internal_ref autorizada, además de tipo/título/fecha/excerpt; la pareja no seleccionada es null. Guardar URL no la visita. Internal refs son una unión cerrada de reseña, referencia, nota o asset; cada resolver debe demostrar existencia/permiso antes de habilitar ese tipo. Ninguna ficha/avatar/ranking antiguo se resuelve como fuente implícita.

Cada fact guarda key, statement, value JSON acotado, unidad nullable, verification_status, usage_status y reason. El value admite JSON auxiliar con profundidad máxima 5 y 8 KiB; las relaciones viven en tablas/refs, no escondidas dentro de ese JSON. Key no garantiza unicidad; afirmaciones alternativas tienen IDs propios y advertencia de posible duplicado.

Write ordinario crea `unverified/pending`. Verificar/aprobar/disputar/rechazar/prohibir, cambiar contenido de un fact ya revisado o cambiar la fuente/respaldo que conserva su aprobación requiere verify. Además, un cambio revisado incluye el fact afectado y `reason` explícita en el mismo batch; no hereda silenciosamente el motivo anterior. Crear un fact directamente verified/approved requiere ese scope, evidencia supports revisable y razón no vacía. No basta con que el chat diga «verificado»: la persistencia debe confirmar revisión/actor/hash exacto de contenido y evidencia junto al cambio (aún pendiente). La suficiencia de la prueba requiere decisión autorizada, no inferencia automática del servidor.

Evidence_link une fact/source con fragmento y relación supports/contradicts/contextualizes. Un enlace contradice no se descarta: write puede aportar contradicción nueva y el dominio bloquea uso dependiente mientras se resuelve, sin otorgar al actor permiso para aprobar. `verified` y `approved` son estados distintos; disputed/rejected no puede quedar aprobado utilizable. El claim usable debe estar verified + approved y no tener disputa pendiente; verificar que un proveedor dice algo no demuestra automáticamente su eficacia.

Revocar/disputar marca `needs_review` en dependencias y salidas conservando snapshots. No borra ni reescribe resultados históricos, ni hace rollback externo automático de publicaciones.

## 6. Análisis: `save_product_analysis` y `patch_product_analysis`

Save exige `analysis` con al menos una colección nombrada: personas, jtbd, pains, desires, objections, angles o customer_language. `offer` y methodological_notes son opcionales. Es merge/upsert; [] no borra. Notas metodológicas se guardan en metadata del agregado/revisión, no como facts. No importa análisis legacy ni ejecuta generación para completar campos.

Todos los campos y tipos están enumerados en los schemas. Persona representa segmento; JTBD/pain/desire/objection/angle llevan persona_ref. Cada angle requiere JTBD y pain de **esa misma persona**; objection/angle pueden referir facts. `epistemic_status=hypothesis` puede no tener evidencia; observed necesita evidencia y validated además validation_note con procedimiento/fundamento. Frecuencia/severidad distinguen observación de valoración subjetiva. Generation_guidance contiene mensaje, apertura, delivery, hooks y notas; no hay JSON libre de instrucciones ni slots legacy.

Lenguaje synthetic no se presenta como voz observada ni reseña. `origin=observed` exige source_ref y fragmento trazable; `customer_quote` exige observed. Un script synthetic guardado es material auxiliar para el writer V1, no ingestión automática de un guion final ni aprobación de sus afirmaciones.

Offer recibe nombre/headline, prioridad y recipes de 1/2/3 unidades. No acepta currency, precio de pack, ganancias ni condiciones inventadas: se materializa desde pricing/policies autorizados, con stamps. Recipe units no se repiten. Sin precio puede persistirse como oferta incompleta, con financial_snapshot/precios null y readiness=false. `label_proposal` es propuesta del chat, no etiqueta aprobada; solo approved y no stale llegan como `approved_label` al generador. Etiquetas con duración/beneficio comprobable requieren respaldo. La UI mantiene revisión de etiquetas y no debe llamar al antiguo avatar para generarlas.

Patch acepta 1–50 operaciones cerradas: create, update, archive, restore, reprioritize. Entidades: persona, jtbd, pain, desire, objection, angle, customer_language, offer. Reprioritize excluye language; exige **todos** los IDs activos del conjunto y `persona_id` correspondiente (null para personas/ofertas). Prioridades son contiguas; create/update desplazan el conjunto determinísticamente. No hay JSON Patch arbitrario ni borrado físico.

Validar el grafo final permite archivar juntas dependencias que ya no se usarán. Una entidad activa no puede quedar referenciando una archivada. Archivar dependencia de selección activa devuelve `DEPENDENCY_IN_USE`; como patch no sustituye estrategias, antes se debe seleccionar otra o archivar la selección explícitamente. Una relación inválida revierte todo el batch.

## 7. Estrategia: `set_product_strategy` y `get_product_strategy`

Create_draft/select reciben IDs existentes: persona, JTBD, pain, angle principal, secundarios ordenados, positioning, offer_id nullable, rationale y based_on_revision. Todos pertenecen al producto; JTBD/pain principales forman parte del angle principal y corresponden a su persona. V1 tiene una persona por decisión: secundarios pertenecen a ella, aunque usen otros JTBD/dolores. El snapshot incluye `related_jtbd`, `related_pains` y `desires` completos, además de principales, para cerrar todas las referencias. El análisis admite varias personas; una decisión multipersona necesitará ampliar el snapshot. `based_on_revision=expected_revision=revisión actual`; no seleccionar entidades archivadas ni material con restricciones que la selección pretenda autorizar.

Select crea versión inmutable y evento, sustituye selección activa y supersede la anterior en una transacción. Si base=N, `analysis_revision=N`, `selection_revision=N+1`. La selección misma no genera stale; cambios posteriores de contenido/configuración sí. Un draft no habilita generación. Archive recibe strategy_id/reason; archivar la activa limpia puntero, sin elegir otra por prioridad. No se editan snapshots ni se selecciona un draft viejo saltándose la revisión actual: se crea nueva selección reproducible.

Sin oferta válida se puede seleccionar para seguir trabajando: warning `OFFER_NOT_READY` y readiness=false. Una versión seleccionada es una hipótesis elegida, nunca winner. Estado experimental y learning quedan fuera de las diez tools.

Get sin strategy_id usa selección activa; si no existe, `data=null` y `NO_SELECTED_STRATEGY`. `include=core` devuelve la decisión y cierre mínimo de facts/fuentes/evidencia; `execution` agrega objeciones/lenguaje/guidance necesarios. El DTO declara include; arrays auxiliares vacíos en core indican proyección, no ausencia de esos registros en persistencia. `current_revision`, stale, needs_review y readiness son comprobados hoy y no alteran el snapshot.

## 8. Generación y status

Contrato completo de snapshot/adaptadores: [generation-context.md](generation-context.md). Cada solicitud de generación tiene key, CAS del conocimiento y etapa explícita. Devuelve operation_id queued o preview de dry_run; knowledge revision no cambia por aceptar el job. Receipt/request/input congelado/outbox se confirman juntos antes de dispatch. El worker usa lease y registra costo con el mecanismo existente, también fallos cobrados. Responde antes de 15 segundos; los proveedores corren fuera del request/lock.

`generate_landing`:

- `content`: strategy_id y target `missing|all|only`; only exige component_ids validados contra el catálogo actual y listing. Exige portada + mínimo actual de galería elegida. Missing conserva aprobado; all/only crean propuestas nuevas sin cambiar automáticamente la revisión/página publicada. Reusar argumento compatible para reescritura parcial; no releer inteligencia latest.
- `images`: strategy_id, provider explícito y plans con slot/posición/prompt/fact_ids. El chat aporta la dirección visual, sin un director que repita análisis. Solo cover/gallery/benefit-1..3; no GIF generado. Identidades de slot/posición no se repiten; límites y prerequisites actuales se aplican. La llamada genera **solo** las tomas pedidas, nunca completa automáticamente portada/galería ni arranca contenido.

`generate_ugc`:

- `script`: strategy_id, angle_id de la selección congelada y format `ugc|mascot`; un solo angle válido alcanza. El writer y el planner finales conservados pueden llamar IA; la tool no llama ficha/avatar/ángulos/ganchos. No exige proveedor de video solo por redactar guion; exige Anthropic del comerciante para los pasos textuales.
- `keyframes`: script_id, expected_artifact_etag y shot_keys explícitas. Exige guion revisado/aprobado y conserva su contexto. Un keyframe dependiente incluye en la solicitud las bases que faltan o usa las ya aprobadas; no genera dependencias ocultas.
- `clips`: mismos campos; exige imágenes clave aprobadas para las tomas elegidas. No genera imágenes clave, no monta el video automáticamente ni lo publica.

Artifact_etag SHA-256 identifica contenido editado, contexto, plan y decisiones relevantes de guion/tomas. Se compara atómicamente al crear el pedido; cambios invalidan con `ARTIFACT_CONFLICT`. Los outputs/lecturas de status proporcionan el etag actualizado. Las aprobaciones permanecen en UI; una continuación no sustituye la estrategia de su guion por la activa nueva. Si su contexto/precio o claims quedaron bloqueados, requiere revisar/regenerar: no hay flag para ignorarlo.

Segunda key para el mismo trabajo mientras está activo devuelve `GENERATION_IN_PROGRESS` con operation_id; no crea otra corrida. El replay de la misma key obtiene recibo original. Regenerar tras finalizar usa key nueva y conserva outputs anteriores hasta revisión/retención. Si no hay trabajo pendiente porque lo pedido ya está listo/aprobado, devuelve `EXECUTION_NOT_READY` con razón y siguiente acción, sin cobrar ni inventar un job. La recuperación interna de errores transitorios no es una nueva intención del chat.

Get_status necesita product_id/operation_id, page_size/cursor opcionales. Respuesta: status/status_revision, provenance, outputs paginados, artifact_etag, rutas de revisión, next_actions, costo registrado/estimado con fecha y error eventual. La paginación fija snapshot de estado por 15 minutos; nueva lectura sin cursor obtiene progreso actual. `succeeded` significa que terminó la etapa, no que la pieza fue aprobada/publicada. Clips completos llevan a paquete de montaje local y subida final, según la capacidad existente; no se promete render final hospedado.

Ante submit externo ambiguo, job pasa a reconciling. Con provider_request_id se consulta desde worker/webhook; si no se puede demostrar aceptación/no aceptación, no se reenvía ciegamente. `PROVIDER_RECONCILIATION_REQUIRED` requiere resolución explícita. La transacción garantiza dedupe interno; no promete exactamente un cobro externo sin garantía del proveedor.

## 9. Límites, errores y verificación

Máximos iniciales: input 256 KiB UTF-8; output 128 KiB; texto/value 8 KiB; colección por llamada 100; patch 50; generación visual 10 plans y video 20 shot_keys además de topes actuales de proveedor/negocio. MaxLength del schema cuenta caracteres; se aplica también el límite de bytes. Rechazar exceso antes de logs/persistencia. No equivale a limitar a 100 entidades totales del producto; snapshot demasiado grande para un contexto de ejecución devuelve error accionable y requiere reducir selección, sin truncar su prueba.

Errores tienen code, message en español, retryable y details cerrado. Details señala campos/refs/índice/revisión faltantes, sin payloads ajenos ni tokens. Códigos específicos incluyen ARTIFACT_CONFLICT, CURSOR_EXPIRED, EXECUTION_NOT_READY, INTEGRATION_NOT_CONNECTED, GENERATION_IN_PROGRESS y PROVIDER_RECONCILIATION_REQUIRED. Rate limit devuelve retry_after_seconds. Un error posterior del worker se entrega dentro de status como fallo operacional, no como fallo oculto de la lectura exitosa.

Los [ejemplos](contracts/examples.json) cubren cuatro personas/ocho ángulos, research inicialmente no verificado, revisión sensible, selección, dry_run y jobs por etapa. Son datos ficticios; aprobaciones UI/credenciales y estados del escenario son precondiciones, no acciones ejecutadas. La [matriz de dominio](contracts/domain-cases.md) distingue pruebas puras y gates de servicios/DB/host.

Verificación con `npm run pi:contracts`: exportación desde Zod y validación Ajv 8 draft 2020-12 completa de diseño/generated, ejemplos/rechazos, bytes y concordancia de pricing. Las pruebas PI comprueban dominio puro y SDK con Client/InMemoryTransport oficiales. Persistencia, OAuth, HTTP, proveedores y host real siguen pendientes; no se declaran probados por estas comprobaciones.

## Ampliación vigente: contenido, galería y aprendizaje

El runtime anuncia 29 tools con 30 pares de schemas. Se añadieron get/save_creative_content, get/save_gallery_content, get/save_event_content, get/save_usage_tip, generate_gallery_images/get_gallery_generation_status y get_product_performance/get_product_learning/save_product_learning. `generate_landing` conserva únicamente el contrato histórico cerrado.

Las tools de contenido incluyen contrato JSON y paginación en la lectura; mutaciones requieren revisión/etag/key y aceptan dry_run. Aprendizaje exige revisión y etag de medición. Render de galería exige permiso landing:generate, proveedor y límite de estimación. [Recorrido y límites](chat-content-and-learning.md). Fuente ejecutable: `lib/product-intelligence/*-schemas.ts`; exports de `contracts/generated/` con `npm run pi:contracts`.
