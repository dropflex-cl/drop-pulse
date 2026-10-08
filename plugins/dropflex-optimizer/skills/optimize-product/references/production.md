# Ejecutar la dirección elegida

Carga solo contratos necesarios para el alcance actual. Los schemas y `next_action` del MCP prevalecen sobre estos ejemplos.

## PDP

1. `get_pdp_planning_context` + `get_component_catalog`: estrategia, ángulo, evidencia y componentes reales. Recupera el plan existente con `get_angle_persuasion_plan`.
2. Construye argumento y recorrido mínimo de creencias; cada sección contribuye a una creencia u objeción. `validate_angle_persuasion_plan` valida y `save_angle_persuasion_plan` guarda con el stamp actual.
3. Con `get_shopify_automation.active`, guarda el plan validado con `status: "approved"`. Sin esa autorización, conserva la revisión en DropFlex.
4. `get_landing_content` consulta cada componente; `save_landing_content` guarda copy del chat y lo aprueba automáticamente si la autorización está activa. Revalida y vuelve a guardar propuestas anteriores si aún estaban generadas; no apruebes contenido obsoleto. Usa schema 1.2 para metadata de plan, ángulo, selector de hook, sección, creencias, hechos y claims. Crea slots reales antes de proponer bindings.
5. `get_landing_experience`/`save_landing_experience` fijan revisión exacta del plan y bindings a variantes existentes. En modo automático, guarda la experiencia con `status: "active"` después de completar copy e imágenes y sin pedir confirmación adicional. Un plan consumido por una experiencia activa requiere otra variante o el procedimiento permitido por su contrato.

## Identidad y plan visual

`get_visual_generation_context` devuelve referencia canónica, capacidades, dependencias y registros paginados. Los planes pueden ser resúmenes: usa `get_visual_generation_plan` y pagina `shots.items` para tomas completas.

Si no están disponibles `get_visual_generation_context` y `get_visual_reference_image`, el catálogo del plugin puede estar desactualizado. Pide actualizar/reconectar DropFlex y abrir un chat nuevo. `get_product_context` con solo `base_reference_image_id` no entrega la foto al generador. No saltes al generador para completar el pedido con un SKU inventado.

Llama `get_visual_reference_image` con `product_id`, `reference_image_id` y `reference_content_hash` del contexto actual. Devuelve un bloque MCP `image`, además de la URL del original y metadata. Comprueba que puedes ver la foto y que el ID/hash corresponden a la base. El hash canónico identifica los bytes originales; `image.content_hash` identifica el adjunto, que puede ser una preview reducida sin recorte para respetar el límite MCP. Para más detalle descarga el original de su URL temporal.

En ChatGPT, la tool también muestra una tarjeta con la fotografía original y «Adjuntar referencia al chat». Ese botón descarga el original, verifica su hash, lo sube mediante `window.openai.uploadFile` y comparte el ID real del host en `imageIds`. Espera a que el archivo esté disponible en la conversación; que aparezca una tarjeta o enlace no demuestra que el generador lo recibió. El botón no inicia generación. Si el cliente no ofrece estas APIs o la tarjeta no aparece, conserva el fallback de adjuntar la foto original manualmente.

Después de adjuntar, «Revisar referencia en el chat» abre un nuevo turno de inspección con el identificador real. La respuesta escrita antes del toque no confirma ni descarta el adjunto posterior. Distingue tres comprobaciones: archivo subido al host, píxeles visibles para el modelo y archivo utilizable como entrada del generador; no declares la última solo porque la foto aparece en la tarjeta.

`get_visual_identity`/`save_visual_identity` usan la imagen base existente. El hash corresponde a bytes, no a la URL firmada. Si no puedes leerlos, utiliza información válida del contexto o pide preparar la identidad en DropFlex; no inventes el hash.

`save_visual_generation_plan` guarda intención estructurada: familia estable, objetivo, escena, composición, mensaje, restricciones y dependencias, con `product_identity: "inherit"`. Hereda geometría, colores, controles y accesorios reales. Identidad y plan deben estar aprobados y vigentes antes de `prepare_visual_iteration`. En modo automático, los saves aprueban identidad y planes cuyos destinos sean exclusivamente PDP/galería y correspondan a la estrategia autorizada; verifica su estado devuelto. Revisa propuestas vigentes anteriores con `review_visual_record`.

Portada/galería son cuadradas, hay hasta seis posiciones de galería y beneficios existentes usan 3:4. Otros destinos siguen su ratio declarado. No inventes slots ni recortes silenciosos.

## Generación externa y transferencia

1. Consulta `list_visual_assets`/`get_visual_reuse_candidates`; compartir familia no garantiza compatibilidad.
2. `prepare_visual_iteration` congela toma, plan, identidad, referencias e instrucciones. Al iterar vincula parent y reviews reales. El prompt ejecutado es metadata.
3. Recupera `get_visual_reference_image` con el ID/hash de `identity_snapshot` y el `iteration_id` preparado. Pasa la imagen como entrada real de edición/referencia al generador: archivo local leído, adjunto de conversación o imagen/archivo soportado por esa herramienta. Inspeccionar una URL en el navegador o escribirla dentro del prompt no la adjunta. Usa los controles de referencias de la herramienta disponible; no inventes un identificador de archivo ni ejecutes generación solo desde texto. El prompt usa las restricciones de la identidad persistida.
4. Si no puedes pasar esa imagen como entrada real, explica la limitación del cliente y pide adjuntar la foto original en este chat. Detén la generación de esa toma mientras tanto y registra el intento abandonado si ya estaba preparado. No atribuyas uso de referencia a una llamada que no la recibió.
5. Compara el resultado con la foto canónica: silueta, proporciones, colores, mango, depósito, controles y accesorios según la identidad. Si representa otro SKU, presenta el fallo y prepara una corrección con la original; no lo propongas como portada ni lo uses como referencia canónica para el resto del lote. Una imagen generada anterior puede ser referencia secundaria de escena, conservando siempre la original como referencia principal.
6. Muestra el resultado. `ingest_external_visual_asset` recibe HTTPS temporal o `upload_ticket`: prepara con `prepare_visual_asset_upload`, transfiere bytes por PUT y confirma. Consulta `get_visual_ingestion_status` para verificar el guardado durable.
7. Un ID interno de conversación no es un file_id soportado ni una URL accesible. Si no puedes transferirlo, indica la subida manual desde la toma en DropFlex y recupera el asset después. Mostrar la imagen no la guarda.
8. El resultado entra generado. Con autorización automática activa, inspecciona su fidelidad, calidad, claridad y correspondencia con la toma. Si falla, usa `review_visual_record` para rechazarlo con motivo y prepara una corrección; no publiques un fallo por completar el lote. Si pasa, apruébalo con `review_visual_record` (`decision: "approve"`, motivo y tags reales). Propón su uso con `bind_visual_asset` en destinos `gallery_shot`/`landing_section` y selecciona el binding con `review_visual_record` (`decision: "select"`). Recupera etag/stamp después de cada cambio. Sin autorización automática, el comerciante conserva aprobación y selección en la UI.
9. Registra intentos fallidos/abandonados con `record_visual_iteration_result` cuando corresponda. Consulta estado ante una ingestión ambigua antes de iniciar otra.

DropFlex valida, optimiza y conserva bytes. No uses `generate_gallery_images` para este recorrido externo ni configures proveedores en el servidor. Resultados generados son `illustrative_demo`; `real_evidence` exige evidencia auténtica y material manual.

## Dirección visual para pago contra entrega

Diseña el recorrido desde el hook elegido y el producto real: entender qué se compra, verlo en uso, resolver objeciones, mostrar detalles y aclarar la oferta calculada. Distribuye estas tareas entre galería y componentes sin repetir el mismo argumento. Usa condiciones reales de pago y envío del contexto; no inventes sellos, certificaciones, cifras, testimonios, descuentos ni plazos. Conserva la identidad de la foto base y una estética coherente. Una demostración generada se etiqueta como ilustración; partículas simuladas, un antes/después o un depósito lleno no prueban eficacia real.

## Publicación automática en Shopify

Recupera `get_shopify_automation`: `active` confirma la autorización, `missing` enumera requisitos y `fingerprint` identifica la página actual. Resuelve lo que falta con los writers y decisiones automáticas anteriores. Etiquetas de packs guardadas con `save_pack_labels` quedan aprobadas automáticamente si el permiso sigue activo. No cambies reseñas reales ni marques hechos hipotéticos como verificados para desbloquear la publicación.

Cuando `publish_ready` sea true, llama `publish_product` con la revisión y el `expected_fingerprint` devueltos y una clave idempotente nueva. No pidas una confirmación final. Un dry run no publica. Si la respuesta es ambigua, repite exactamente la misma carga y clave; no crees otro trabajo. Consulta `get_shopify_automation` hasta que la publicación esté `published` o `error`. Un error confirmado permite reintentar con una clave nueva y el estado actual si la autorización sigue activa; no renueves consentimiento por un fallo técnico. Entrega el enlace real y explica cualquier error concreto. No declares publicada una cola `queued`/`running` ni una página sin URL pública.

Este recorrido necesita tools habilitadas, transferencia real de la imagen base y una conexión Shopify vigente. La skill no puede activar herramientas que el cliente deshabilitó ni confirmar diálogos del host en nombre del usuario. Si el generador o el cliente no admite la referencia o transferencia, explica ese bloqueo real; no simules un flujo automático completado.

## Feedback y cambios

`get_visual_iteration_history`/`get_visual_comparison` recuperan intentos y decisiones. Con autorización automática activa, `review_visual_record` registra las decisiones desde el chat con actor real; fuera de ella, la review formal se registra en la UI. No uses este permiso para anuncios ni UGC.

`get_visual_reconciliation_context` explica dependencias afectadas. `save_visual_reconciliation` propone `retain`, `replace` o `remove` con motivo y nueva versión por revisar. Eliminar un destino puede invalidar un binding conservando el asset. Evidencia revocada no se valida con una justificación del chat.

## Otros entregables solicitados

- Galería: `get_gallery_content`/`save_gallery_content` conservan requisitos nativos; el plan visual aporta ejecución/assets.
- Packs: `get_pack_labels`/`save_pack_labels` proponen etiquetas ligadas al cálculo real, sin duración inventada.
- Creativos: `get_creative_content`/`save_creative_content` guardan conceptos, dirección y copy con estrategia, ángulo y selectores.
- UGC: `get_ugc_content`/`save_ugc_content` guardan guion/plan. Un still en B-roll es storyboard, no clip terminado. Renderizar video sigue un flujo separado con permisos, aprobación y costes explícitos.
- Learning: `get_product_performance`/`get_product_learning` y `save_product_learning` vinculan hipótesis y métricas reales. CTR no equivale a pedidos entregados, cobros ni causalidad visual.
