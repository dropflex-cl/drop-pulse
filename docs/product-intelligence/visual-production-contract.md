# Producción visual desde chat — contrato implementado

Estado: fases 1 y 2 implementadas en el repositorio. `schema_version = "1.0"`. Este documento concreta el spec suministrado por el comerciante y reemplaza el borrador de acuerdos. No constituye un despliegue en producción.

Los schemas ejecutables son [`visual-schemas.ts`](../../lib/product-intelligence/visual-schemas.ts); sus contratos JSON se generan con `npm run pi:contracts`. Ante diferencias de nombres o campos, estos schemas son el contrato del transporte.

## Responsabilidades y decisiones aplicadas

- DropFlex conserva estrategia, identidad, briefs, archivos, versiones, feedback y usos. Este recorrido no llama a proveedores generativos ni administra claves de generación.
- El chat decide dirección, genera/edita externamente y transfiere el resultado. El servidor no puede certificar que el generador respetó la referencia: conserva el snapshot y el comerciante verifica la fidelidad.
- Sin autorización automática, identidad, plan, assets y usos se deciden en la UI autenticada. El permiso persistido de publicación automática en Shopify habilita las decisiones del chat únicamente para PDP/galería de la estrategia autorizada. Los assets nuevos siempre entran `generated`; el chat debe inspeccionarlos antes de aprobar y seleccionar. Ningún booleano del agente equivale a una autorización del comerciante.
- Un cambio conserva las publicaciones históricas. Bloquea nuevos usos afectados hasta revisar. No pausa ni retira automáticamente publicaciones externas.
- El recorrido externo se agrega al producto existente. Los renderizadores heredados siguen disponibles; retirarlos exige una migración aparte. La prohibición de llamadas generativas aplica a todos los módulos y operaciones de este nuevo recorrido.
- La sección se integra en Imágenes, con Identidad también en Información base y acceso a Piezas en Creativos. No agrega etapas a la ruta ni modifica autenticación.

## Modelo y almacenamiento

El ownership siempre se deriva del principal. Las referencias se validan contra el mismo `user_id` y `product_id`, en el dominio y PostgreSQL.

| Tabla | Responsabilidad |
|---|---|
| `pi_visual_records` | Heads versionados de `identity`, `plan`, `iteration`, `asset`, `binding`, `review` |
| `pi_visual_versions` | Copias inmutables de cada versión y su actor |
| `pi_visual_files` | Archivo optimizado, SHA-256 recibido/almacenado y metadata real |
| `pi_visual_renditions` | Conversiones técnicas compartidas para creativos, Meta y UGC |
| `pi_visual_operations` | Tickets e ingestiones durables; nunca trabajos de generación |
| `pi_visual_receipts` | Idempotencia por producto/tool/clave |
| `pi_visual_read_snapshots` | Paginación consistente ligada a usuario, actor y consulta |

Todas tienen RLS y acceso solo de servidor. Las claves foráneas de pertenencia son compuestas. El borrado del producto elimina los registros en cascada. `deleteProducts` limpia antes todos los archivos bajo el prefijo del producto en los buckets existentes, incluidos staging y derivados. El lock del producto y `pi_deleting_at` impiden completar escrituras después de iniciar el borrado.

Un registro mutable contiene `id`, `kind`, `version`, `etag`, `status`, `payload`, `created_at`, `updated_at`. Una referencia de versión es `{ id, version, etag }`. Los campos `null` se conservan en almacenamiento, respuestas y replay.

### Identidad

Una identidad canónica por producto; su referencia es la imagen base existente en `product_reference_images`. No crea una segunda elección de base. Las referencias se obtienen mediante `imagesForGeneration`.

El payload conserva `canonical_reference_image_id`, `reference_content_hash`, `reference_mode`, `identity_description`, `preserve`, `allowed_variations`, `forbidden_variations`, `identity_hash` y `dependencies`. El backend lee los bytes para comprobar la huella declarada.

`strict_product_identity` y `guided_reference` requieren referencia canónica consumible. Cambiar la base o restricciones no reescribe historia ni regenera. Guardar crea una propuesta `review`; la aprobación corresponde al comerciante.

### Plan y tomas

El plan contiene nombre, `strategy_id`, `identity_ref`, `visual_system`, `shots` y dependencias. El sistema visual especifica mundo, paleta, luz, fotografía, tipografía nullable, ánimo y consistencia.

Cada toma guarda intención estructurada: familia, prioridad, canal, ángulo, selectores públicos, referencia al plan persuasivo/sección, creencias, hechos, evidencia, claims, objetivo, escena, composición, mensaje y restricciones. `product_identity` siempre es `inherit`. El backend agrega `shot_id`, `shot_version`, `shot_hash` y dependencias; la misma key mantiene su ID entre versiones del plan.

`shot_family` es una clave estable en inglés dentro del producto, presente desde el MVP. Las sugerencias comparan intención, identidad, representación, vigencia y encuadre. Compartir familia no implica compatibilidad automática.

Representaciones:

- `product_depiction`: producto en contexto.
- `illustrative_demo`: demostración ilustrativa, sin convertirla en prueba real.
- `real_evidence`: exige evidencia verificable y material manual. Un resultado de ChatGPT u otro generador no puede ingresar como evidencia real.

Se admiten `1:1`, `3:4`, `4:5`, `9:16`, `16:9`. La selección valida además el destino: portada/galería cuadradas y beneficios en 3:4; creativo en su ratio declarado. Un recorte requiere producir, ingresar y revisar una nueva pieza; no hay recorte silencioso.

Para editar el plan se entrega nuevamente intención pura, sin los campos calculados. `get_visual_generation_plan` devuelve los datos generales en `current` y las tomas completas en `shots.items`, con cursor.

### Intentos, archivos y procedencia

`prepare_visual_iteration` congela plan/version, toma, identidad y restricciones, sistema visual, dependencias, referencias adicionales, padre, reviews utilizadas e instrucción/modelo declarados. Exige identidad y plan aprobados vigentes. Estados: `prepared`, `result_recorded`, `failed`, `abandoned`.

La instrucción ejecutada es metadata nullable, no el brief. Su hash se calcula en servidor. No se inventa un prompt cuando el comerciante solo tiene un archivo.

Cada asset contiene `file_id`, `iteration_id`, `plan_ref`, `identity_ref`, `shot_key`, `shot_family`, `shot_hash`, estrategia/ángulo, representación, dependencias originales, origen/modelo, instrucción/hash, referencias, padre y fecha declarada. Las iteraciones conservan resultados adicionales y permiten reconstruir todas las procedencias de un asset deduplicado.

La deduplicación es por producto y SHA-256 del archivo optimizado. Se devuelve el mismo asset solo cuando también coincide el contexto semántico de la generación. Contextos distintos pueden compartir `file_id`; la aprobación no se transfiere entre assets distintos.

Todo resultado nuevo queda `generated`. Aprobar y seleccionar son operaciones separadas. Archivar conserva historia. Recuperar un archivo archivado lo deja `in_review`, sin heredar aprobación.

### Review y bindings

Las reviews son eventos inmutables: sujeto/version, decisión, motivo opcional y tags estructurados. El chat recupera feedback en consultas, historial y comparación. Rechazar no obliga a llenar un formulario; reconocer explícitamente un cambio de vigencia sí requiere motivo.

Destinos tipados:

- Galería: portada, hasta 6 posiciones según el contrato nativo y beneficios existentes en 3:4; una selección por posición o portada.
- PDP: experiencia, variante, sección, componente y slot existentes.
- Creativo: concepto y ratio `1:1`/`9:16`.
- UGC: guion aprobado, toma y slot `keyframe` o `b_roll`.

`bind_visual_asset` y `save_visual_binding_suggestions` crean propuestas, con huella del destino. La UI o el chat con autorización automática vigente para Shopify pueden seleccionarlas. Seleccionar desplaza atómicamente el uso anterior del mismo destino. Un asset puede reutilizarse en varios destinos.

La proyección transaccional integra `page_images`, experiencias/variantes nativas, `creative_assets`, `ad_media` y keyframes de `video_shots`. Un still usado en B-roll es una referencia de storyboard: no se marca como clip generado ni video aprobado.

Los formatos de Meta pasan por `optimizeForAds`. Galería/PDP usan el archivo WebP canónico. Las conversiones técnicas comparten el archivo derivado por perfil; no crean duplicados por binding.

Los controles antiguos no pueden modificar aprobación, posición ni bytes de una proyección visual. La publicación comprueba selección, aprobación y vigencia de los usos. Quitar una selección no retira una publicación histórica de Shopify o Meta.

## Vigencia y reconciliación

Una dependencia contiene `kind`, `key`, `content_hash`, `usage`. Los hashes semánticos excluyen fechas de actualización, URLs firmadas y revisión global. La revisión global protege concurrencia; no decide vigencia por sí sola.

| Cambio | Efecto |
|---|---|
| Referencia/identidad física | Tomas/assets dependientes `needs_review` |
| Ángulo | Solo dependientes del ángulo |
| Sección persuasiva, creencias o claims vinculados | Solo tomas de esa sección |
| Hecho/evidencia revocados o inexistentes | Dependientes `blocked` |
| Precio | Solo overlays que consumen precio/oferta |
| Política | Solo overlays que consumen envío, garantía, entrega o pago |
| Destino/variante eliminado | Binding bloqueado; archivo permanece |
| Edición de otra sección | No invalida la toma ajena |

Hechos y evidencia ligados al plan persuasivo se heredan como dependencias; no basta con que el chat vuelva a enumerarlos. Las piezas de tienda pueden incorporar textos, precios, packs, descuentos y condiciones COD del contexto vigente, incluida la portada. La oferta y las políticas consumidas quedan como dependencias: si cambian, las tomas correspondientes requieren revisión. Esta decisión del comerciante (2026-10-07) reemplaza la prohibición anterior de precios/ofertas en el bitmap.

`get_visual_reconciliation_context` explica qué cambió por toma y uso. `save_visual_reconciliation` requiere resolución `retain`, `replace` o `remove` de las tomas afectadas y motivo. Crea una nueva versión en revisión; no conserva la aprobación del plan ni altera la procedencia de assets históricos.

El comerciante puede reconocer un cambio ordinario de un asset aprobado con motivo. Se registra una nueva línea base de vigencia `validity_dependencies`, conservando `dependencies` originales. Evidencia revocada no se puede reconocer como válida. Revalidar una selección conserva también la huella del destino.

## Contratos MCP

Hay 23 herramientas visuales, con input/output JSON Schema derivados de Zod:

| Grupo | Tools |
|---|---|
| Contexto/identidad | `get_visual_generation_context`, `get_visual_reference_image`, `get_visual_identity`, `save_visual_identity` |
| Plan | `get_visual_generation_plan`, `save_visual_generation_plan` |
| Iteración | `prepare_visual_iteration`, `record_visual_iteration_result`, `get_visual_iteration_history` |
| Transporte | `prepare_visual_asset_upload`, `ingest_external_visual_asset`, `ingest_chatgpt_visual_asset`, `get_visual_ingestion_status` |
| Assets/usos | `list_visual_assets`, `bind_visual_asset`, `unbind_visual_asset` |
| Diagnóstico | `record_visual_transfer_event`, `get_visual_transfer_history` |
| Fase 2 | `get_visual_reconciliation_context`, `save_visual_reconciliation`, `get_visual_reuse_candidates`, `save_visual_binding_suggestions`, `get_visual_comparison` |

Las lecturas necesitan `product_intelligence:read`; las escrituras además necesitan `product_intelligence:write`. `record_visual_transfer_event` necesita solo lectura: registra telemetría sin cambiar CAS ni decisiones. `review_visual_record` desde el MCP exige autorización automática vigente para Shopify y no incluye anuncios ni UGC. La UI usa la misma operación en `/api/products/[id]/visual`, con sesión merchant y comprobación de Origin.

Cada escritura requiere `schema_version`, `expected_revision`, `expected_etag`, `expected_dependency_stamp`, `idempotency_key`, `dry_run`. CAS se comprueba bajo lock. El replay se resuelve antes del CAS. Misma clave con distinto payload falla. `dry_run` valida sin reservar una ingestión ni emitir una URL de subida.

Las respuestas tienen envelope `{ ok, request_id, product_id, revision, data }` o error tipado. Paginación con snapshot de 15 minutos, cursor firmado ligado a tool/query/principal. No mezclar páginas de consultas distintas. Las URLs de preview/referencia se renuevan al leer.

`context_records` pagina el grafo, planes persuasivos, experiencias, requisitos de galería, conceptos, visuales y destinos. Los planes en este contexto son resúmenes; las tomas se recuperan con `get_visual_generation_plan`. `targets` trae una muestra de hasta 50 destinos compactos; el conjunto completo se recorre mediante registros de tipo `target`. Hay hasta 12 items por página; el presupuesto de bytes puede reducirlos.

## Ingestión y límites

Transportes soportados:

1. `ingest_chatgpt_visual_asset`: parámetro raíz `file` anunciado mediante `_meta["openai/fileParams"]: ["file"]`. Objeto `{ download_url, file_id, mime_type?, file_name? }` entregado por el host. Reutiliza la ingestión durable existente; no intenta resolver un ID privado de conversación. Solo esta entrada nativa acepta `application/octet-stream`, sujeto a decodificación real y los mismos límites de imagen.
2. `remote_url`: URL HTTPS pública temporal, descargada inmediatamente por el worker durable.
3. `upload_ticket`: prepara URL firmada; el cliente sube bytes con PUT, `Content-Type` y `x-upsert: false`; confirma con `ingest_external_visual_asset` y consulta el resultado.

Un `file_id` aislado, `sandbox:/…` o `data_uri` no son transportes soportados. El cliente debe entregar bytes o una URL HTTPS descargable. El SHA del ID externo puede quedar como metadata de procedencia; el ID y URL temporales se eliminan de la operación al terminar. Renovar la URL del mismo archivo nativo con la misma clave conserva el replay de la operación original. Una operación confirmada como fallida requiere URL actual y clave nueva; nunca se regenera la imagen por un fallo de transporte.

Límites implementados: JPG/PNG/WebP estáticos, 15 MiB recibidos, 600 px mínimos por lado, 40 millones de píxeles decodificados, timeout de descarga 20 s, 3 redirects, solo HTTPS/443, sin credenciales. DNS validado y fijado en cada request; todos los resultados DNS deben ser públicos. Bloquea localhost, redes privadas, link-local/metadata, CGNAT y direcciones reservadas, incluidos IPv4 mapeados en IPv6.

La imagen se decodifica y pasa por `optimizeImage`: WebP, hasta 2400 px por lado. El SHA recibido y el almacenado se distinguen. Nunca se persiste solamente la URL externa.

Tickets e ingestiones vencen a los 15 minutos. Supabase firma subidas por una ventana mayor; el servidor conserva el path de limpieza hasta 3 horas y lo vuelve a limpiar durante esa ventana. Los tokens y URLs temporales no se almacenan en receipts, snapshots ni auditoría pública; se eliminan de la operación al terminar.

Límites de colección: 20 planes no archivados, 30 tomas/plan, 200 heads de assets incluyendo historial archivado y 1000 registros totales/producto. Identidad hasta 24 KB y plan estructurado hasta 64 KB. Input MCP 256 KiB, output 128 KiB y campo 8 KiB, compartidos con PI.

La recuperación por cron retoma pendientes o leases expirados. Revalida el permiso original antes de crear contenido; una revocación termina la ingestión sin crear assets. Ningún recovery llama a un generador. Los resultados tardíos conservan el contexto congelado y pueden aparecer pendientes de revisión por drift.

## Despliegue y verificación

Migraciones visuales: `20261125` a `20261205` en `supabase/migrations`. Orden:

1. Aplicar las migraciones en la base destino antes de habilitar el código.
2. Verificar buckets privados existentes `product-references`, `page-media`, `creative-media`, `ad-media` y las políticas de tickets.
3. Configurar los secretos existentes del cron (`app_base_url`, `cron_secret`) para el job `visual-ingestion-recovery`; el endpoint es `/api/cron/visual-ingestion`.
4. Desplegar la aplicación. `VISUAL_PRODUCTION_ENABLED=false` oculta/deshabilita el recorrido y sus tools; por defecto está habilitado.
5. Ejecutar una transferencia real desde el cliente MCP elegido y revisar la pieza en la UI antes de publicar.

Verificación repetible:

```sh
npm run typecheck
npm run pi:contracts
npm run check:valores
npm test
PI_LOCAL_TEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/product-intelligence/visual.local.test.ts
npm run build -- --webpack
# Con npm run dev y Supabase local:
node --env-file=.env.local --import tsx scripts/visual-production-browser.ts
```

Las pruebas locales usan usuarios/productos temporales y los eliminan. Cubren bytes canónicos, versiones, replay/CAS/dry-run, upload firmado, optimización, deduplicación, revisión, reutilización, proyección en galería/PDP/Meta/UGC, historial, drift/reconciliación, permisos, invariantes SQL y borrado de Storage/base. Las pruebas de medios cubren SSRF, redirecciones y formatos/tamaños. La vista de ejemplo es `/dev/screens/visual-production`; nunca usa una cuenta real para sus acciones de QA.

Las ocho migraciones visuales se aplicaron al proyecto de producción `oukcswnfrzroxgwqmujf` el 2026-10-07, junto con las dos migraciones previas pendientes (`20261119` y `20261124`). Se verificaron siete tablas visuales con RLS, once funciones visuales y el cron activo `visual-ingestion-recovery`. Los cuatro buckets son privados y los secretos existentes del cron están configurados. No se publicó contenido en Shopify/Meta durante este trabajo.

La prueba local de transporte no verifica las capacidades concretas de adjuntos del cliente ChatGPT en producción. Esa transferencia sigue siendo la comprobación de despliegue, usando las capacidades anunciadas del tool, no una integración nueva con un proveedor.

## Cierre del transporte del cliente (plugin 1.2.0)

La tarjeta `ui://dropflex/visual-reference/v2.html` renueva la referencia antes de descargarla y verifica ID/hash/bytes. «Usar referencia y continuar» sube mediante la API nativa del host, comparte el ID real en `imageIds` y solicita continuar el último pedido. Conserva «no generar» y no inicia acciones al renderizar. Reintentar solo el mensaje reutiliza el archivo; un cambio de producto/referencia durante la subida bloquea la continuación.

Los planes devuelven `readiness` con motivos, siguiente acción, estrategia activa y referencia de identidad vigente. Aprobar primero la identidad reencadena sus planes en la misma transacción, conservando su estado solo si siguen vigentes. Guardar/aprobar un plan puede corregir una referencia histórica cuando únicamente cambió el estado de aprobación; adoptar otra identidad física requiere reconciliación explícita. La validación SQL acepta referencias dentro del mismo batch validado y conserva versiones inmutables. Una estrategia distinta o dependencias afectadas impiden preparar la toma.

La auditoría existente conserva eventos `visual_transfer.*`: etapa, duración, intento, referencia/hash opcionales, iteración/operación y código de error. No conserva URLs, tokens ni mensajes arbitrarios del host. `reported_by` separa declaraciones del widget de ejecuciones del servidor; ninguno certifica la entrada del generador ni aprobación. Los eventos no cambian CAS y se eliminan con el producto. El historial entrega los 50 eventos más recientes y puede filtrarse por intento.

Las migraciones `20261204` y `20261205` se verificaron únicamente en Supabase local. Antes de desplegar esta mejora, aplicarlas en la base destino, desplegar y actualizar/reconectar el plugin. La aceptación pendiente en ChatGPT móvil requiere: adjuntar la referencia desde la tarjeta, verificar píxeles en el nuevo turno, entregar la original al generador y transferir su resultado nativo hasta `succeeded` con un asset visible en DropFlex. Los tests de host simulado no sustituyen esa comprobación real.
