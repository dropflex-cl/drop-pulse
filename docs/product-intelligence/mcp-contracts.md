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
