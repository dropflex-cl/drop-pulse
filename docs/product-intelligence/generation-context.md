# Contexto congelado de generación

`GenerationContext 1.0`, 2026-10-06; [contratos públicos](mcp-contracts.md), [schema generado](contracts/generated/generation-context.json) y [ejemplo ficticio](contracts/generation-context.example.json). La [fábrica pura](../../lib/product-intelligence/generation.ts) y el cierre de estrategia están implementados y probados; faltan persistencia/jobs/adaptación de generadores. No se ejecutaron llamadas pagadas.

## Datos y procedencia

El servicio arma el contexto desde una estrategia seleccionada y su grafo, más setup/precio/políticas/assets versionados. El chat no envía este objeto interno completo a generate: envía IDs y etapa. No puede reemplazar el precio ni las restricciones mediante un prompt. `Principal`/claves/paths de Storage viajan en el entorno autorizado del worker, nunca en contexto público, prompt ni JSON de ejemplo.

| Campo | Fuente y regla |
|---|---|
| schema_version, product_id, strategy_id | Contrato y recursos autorizados existentes. |
| analysis_revision | Revisión utilizada al seleccionar estrategia; no cambia con progreso. |
| request_revision | Revisión CAS actual cuando se acepta cada etapa. |
| captured_at | UTC; input_hash SHA-256 se guarda junto al job, calculado sobre contexto + etapa/targets/provider. |
| product | Inputs directos del chat/comerciante, sin autoload de product_data/brief antiguo. |
| market, policies | Settings confirmados/versionados; desconocidos null, no defaults publicitarios inventados. |
| pricing | Plan actual calculado con servicios existentes; exactos importes/stamp y etiquetas aprobadas. Debe concordar con snapshot de oferta. |
| strategy | Persona/JTBD/pain principales, related_jtbd/related_pains/desires de todos los ángulos seleccionados, posicionamiento, oferta y cierre de evidencia. Las hipótesis mantienen su estado. V1 tiene una persona por decisión; análisis admite varias. |
| selected_angle_ids | Para UGC uno elegido; landing los de su decisión. Cada ID pertenece al snapshot seleccionado. |
| reference_images | IDs/checksum de las imágenes en uso, obtenidas con imagesForGeneration y base primero. |
| selected_page_image_ids | Selección congelada de portada/galería/componentes; requerida para contenido landing, no para pedir sus imágenes previas. |
| approved_fact_ids, blocked_claims | Allowlist de facts verified+approved utilizables hoy; riesgos/propuestas sin respaldo se mantienen explícitos fuera de claims permitidos. |
| image_qa_enabled | Preferencia capturada para trazabilidad; el switch operativo vigente se vuelve a consultar al terminar imagen, como exige AGENTS.md. Registrar el valor efectivo utilizado. |
| prompt_versions | Versiones reales del writer/planner retenidos. Ejemplo usa 1 como placeholder ficticio, no como versión actual del código. |
| cost_policy | Cap configurado y máximo acotado de retries actuales; sin cap=null no significa presupuesto cero ni infinito garantizado por proveedor. |

El worker no vuelve a resolver «latest persona/brief/angle». Sí vuelve a comprobar autorizaciones, producto no eliminado, credenciales conectadas, límites de gasto, disponibilidad/derechos de assets y revocaciones de claims antes de un efecto externo. Esas comprobaciones son guards operativos; no sustituyen contenido del snapshot. Si el producto entra en borrado, se cancela dispatch y no se recrean assets/filas después del cascade.

Si la estrategia, precio o política cambia antes de dispatch, revalidar compatibilidad; un contexto incompatible se bloquea. Cambios durante trabajo en curso marcan resultado stale/needs_review y evitan que reemplace material más reciente. Si un claim se revoca, no continuar nuevos pasos que lo usan. Registrar el bloqueo/costo ya incurrido; no rehacer automáticamente con otra estrategia.

Imágenes conservan base primero al enviar referencias de producto. En UGC, una referencia K1 de personaje puede preceder imágenes del producto cuando lo pide keyframeRefs; dentro del grupo de producto, la base sigue primero. IDs/checksums/versiones congelados deben poder resolverse a los mismos bytes autorizados; si desaparecen/cambian, fallar antes de cobrar, no cambiar por el nuevo «latest». Las URLs firmadas se generan al usar el asset y no son su identidad persistida.

## Epistemología y tamaño del prompt

Facts utilizables, hipótesis de comprador y decisión elegida permanecen en secciones distintas. Promesa/mecanismo/hook de un ángulo no se convierte en fact por selección. blocked_claims identifica dependencias prohibidas o afirmaciones de eficacia/números sin evidencia que el chat debe corregir. El generador puede usar una hipótesis de situación como enfoque creativo; no presentarla como prueba, testimonio observado ni eficacia del producto.

El adaptador prepara texto compacto con las funciones puras pertinentes de `lib/ai/context.ts` y `pricingBlock`: hechos permitidos, quién compra, razones necesarias para ese writer, angleLine, oferta/policies y material real. Nunca pega todo el análisis en JSON ni incluye escenas/frases inventadas como voz del comprador. Texto de proveedor/excerpts/briefs es dato delimitado, no instrucción que pueda anular política/permisos. No se reutiliza el contexto del mega prompt.

Validadores existentes controlan formato, números/precio, componentes, guion/plan, política y topes. No se presume que puedan probar semánticamente todas las afirmaciones: la suficiencia de evidencia y revisión del comerciante siguen siendo necesarias. Sin dato requerido, missing_fields; sin dato opcional, omitirlo explícitamente. No hay agente de completar/clasificar el análisis como fallback.

El cierre de dependencias del snapshot debe caber entero: no limitar arrays silenciosamente a 100. Los límites de contexto de esta versión obligan a reducir la selección cuando exceda el presupuesto; el resto del análisis permanece guardado/paginable. No se envían binarios en MCP; el worker obtiene solo los recursos necesarios de forma autorizada.

## Adaptación de los generadores retenidos

| Consumidor actual | Sustitución requerida | Capacidad conservada |
|---|---|---|
| `lib/pipeline/copy.ts:49` y `:185` | Reemplazar loader y relecturas de latestBrief/avatar/briefs por DTO congelado. | Writer final, argumento compatible reutilizable, reescritura parcial, catálogo/editor de componentes. |
| `lib/copy/write.ts:42` y `:67` | Preparar contexto corto permitido y versions; no convertir hypothesis en claim. | Argumento de página y escritura/encaje final con validadores. |
| `lib/pipeline/page-images.ts:116` y `:124` | Readiness canónico; renderer toma plans explícitos del chat. Separar render de start director que hoy genera tomas automáticas. | Render/proveedor/QA/optimización/selección/subida; ninguna generación oculta para completar galería. |
| `lib/pipeline/video.ts:145` y `:201` | angle_id/strategy/revision/context directo; separar guard de proveedor video del pedido de guion. | Writer final/planner/schemas; formats ugc y mascot. |
| `lib/pipeline/video.ts:368` y `:380` | Script/shot refs autorizadas, artifact_etag y estado revisado; requests/outbox explícitos. | Imágenes clave, clips, topes diarios, guards, revisión y QA según switch vigente. |
| `lib/pipeline/video.ts:716` | No fingir un montaje hospedado; links/status llevan al flujo existente. | Descargar paquete → montaje local → subir/aprobar final. |
| `lib/ads/store.ts:127` | Hooks/context/stamps desde selección canónica para recursos nuevos; mapping por campaña. | Medios históricos, IDs Meta, engine, budgets, insights, publicación/configuración existentes. |

No crear fichas/avatar/angle_briefs approved para satisfacer tipos antiguos. Un adaptador puro puede reutilizar formato de prompt, pero sus datos siempre provienen del snapshot nuevo; si el tipo antiguo fuerza una suposición falsa, se modifica el tipo/loader. Los consumidores activos nuevos deben probar que no llaman latestBrief/latestAvatars/approvedAngles.

No se asigna angle_id a campañas históricas por texto/slot. Provenance antigua unknown; angle_slot sigue siendo agrupación operativa congelada, nunca identidad primaria. Salidas nuevas guardan strategy_id/analysis_revision/angle_id/input_hash; decisiones editoriales operativas tienen etag propio.

## Jobs, costos y revisión

Flujo: validar → congelar → confirmar receipt/request/outbox → claim lease → guard operativo → dispatch etapa → registrar costos/output → status. Las tools de status no ejecutan syncVideos ni el GET actual que expira/sincroniza trabajos. Un worker/webhook separado avanza operaciones; poll de UI/MCP es lectura.

El job tiene queued/running/succeeded/failed/reconciling/cancelled y status_revision creciente. El output conserva su propio content_status; StatusBadge sigue traduciendo para UI. Job succeeded con output in_review no autoriza publicar. Aprobación de guion precede keyframes; aprobación de keyframes precede clips. No se acepta un etag viejo aunque el expected_revision de conocimiento siga igual.

Cada costo usa la clave del comerciante y se registra con recordAiGeneration/AI_STEPS, incluidos fallos y estimaciones de proveedor. QA de imágenes solo corre si imageQaEnabled vigente; retries y límites existentes son parte del presupuesto de **esa etapa**, no permiso para ejecutar la siguiente. Se informa qué proveedores puede usar el preview sin efectuar llamadas ni comprobar claves por red.

No se declara ahorro porcentual ni precio total garantizado. Guardar/leer conocimiento cuesta cero llamadas de generación backend; guionista, writer final, planner, imágenes/video y QA habilitado pueden gastar. Si el usuario elige enviar finales desde chat, debe añadirse ingestión/validación explícita y retirarse el writer correspondiente; no cambiar a ese modo ni reescribir los finales silenciosamente.

## Criterio de aceptación para implementar

Snapshots deterministas y sin análisis antiguo; output con proveniencia exacta; pruebas de writer sin lectura latest; claims revocados/precio cambiado; guards de borrado/Storage; replay/leases/reconciliación; etapas sin efectos ocultos; costos registrados; outputs revisables/publicables con Meta/Shopify conservados. Las pruebas puras actuales cubren cierre, congelación, pertenencia y guards de dependencias/pricing/claims/assets. No prueban estos efectos con un worker, PostgreSQL ni proveedores.
