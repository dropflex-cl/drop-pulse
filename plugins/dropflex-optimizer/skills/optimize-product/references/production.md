# Ejecutar la dirección elegida

Carga solo contratos necesarios para el alcance actual. Los schemas y `next_action` del MCP prevalecen sobre estos ejemplos.

## PDP

1. `get_pdp_planning_context` + `get_component_catalog`: estrategia, ángulo, evidencia y componentes reales. Recupera el plan existente con `get_angle_persuasion_plan`.
2. Construye argumento y recorrido mínimo de creencias; cada sección contribuye a una creencia u objeción. `validate_angle_persuasion_plan` valida y `save_angle_persuasion_plan` guarda con el stamp actual.
3. La aprobación del plan se realiza en DropFlex. Prepara lo independiente cuando ese requisito bloquee una operación.
4. `get_landing_content` consulta cada componente; `save_landing_content` guarda copy del chat. Usa schema 1.2 para metadata de plan, ángulo, selector de hook, sección, creencias, hechos y claims. Crea slots reales antes de proponer bindings.
5. `get_landing_experience`/`save_landing_experience` fijan revisión exacta del plan y bindings a variantes existentes. Activar y publicar son decisiones distintas. Un plan consumido por una experiencia activa requiere otra variante o el procedimiento permitido por su contrato.

## Identidad y plan visual

`get_visual_generation_context` devuelve referencia canónica, capacidades, dependencias y registros paginados. Los planes pueden ser resúmenes: usa `get_visual_generation_plan` y pagina `shots.items` para tomas completas.

`get_visual_identity`/`save_visual_identity` usan la imagen base existente. El hash corresponde a bytes, no a la URL firmada. Si no puedes leerlos, utiliza información válida del contexto o pide preparar la identidad en DropFlex; no inventes el hash.

`save_visual_generation_plan` guarda intención estructurada: familia estable, objetivo, escena, composición, mensaje, restricciones y dependencias, con `product_identity: "inherit"`. Hereda geometría, colores, controles y accesorios reales. Identidad y plan deben estar aprobados y vigentes antes de `prepare_visual_iteration`.

Portada/galería son cuadradas, hay hasta seis posiciones de galería y beneficios existentes usan 3:4. Otros destinos siguen su ratio declarado. No inventes slots ni recortes silenciosos.

## Generación externa y transferencia

1. Consulta `list_visual_assets`/`get_visual_reuse_candidates`; compartir familia no garantiza compatibilidad.
2. `prepare_visual_iteration` congela toma, plan, identidad, referencias e instrucciones. Al iterar vincula parent y reviews reales. El prompt ejecutado es metadata.
3. Usa la generación/edición del cliente con referencia canónica. Si no puede consumirla, resuelve su acceso antes de generar esa toma.
4. Muestra el resultado. `ingest_external_visual_asset` recibe HTTPS temporal o `upload_ticket`: prepara con `prepare_visual_asset_upload`, transfiere bytes por PUT y confirma. Consulta `get_visual_ingestion_status` para verificar el guardado durable.
5. Un ID interno de conversación no es un file_id soportado ni una URL accesible. Si no puedes transferirlo, indica la subida manual desde la toma en DropFlex y recupera el asset después. Mostrar la imagen no la guarda.
6. El resultado entra generado. Propón usos con `bind_visual_asset`/`save_visual_binding_suggestions`; el comerciante aprueba el asset y selecciona los bindings en la UI.
7. Registra intentos fallidos/abandonados con `record_visual_iteration_result` cuando corresponda. Consulta estado ante una ingestión ambigua antes de iniciar otra.

DropFlex valida, optimiza y conserva bytes. No uses `generate_gallery_images` para este recorrido externo ni configures proveedores en el servidor. Resultados generados son `illustrative_demo`; `real_evidence` exige evidencia auténtica y material manual.

## Feedback y cambios

`get_visual_iteration_history`/`get_visual_comparison` recuperan intentos y decisiones. El feedback del chat orienta propuestas; la review formal se registra en la UI. No inventes una tool MCP de aprobación/rechazo.

`get_visual_reconciliation_context` explica dependencias afectadas. `save_visual_reconciliation` propone `retain`, `replace` o `remove` con motivo y nueva versión por revisar. Eliminar un destino puede invalidar un binding conservando el asset. Evidencia revocada no se valida con una justificación del chat.

## Otros entregables solicitados

- Galería: `get_gallery_content`/`save_gallery_content` conservan requisitos nativos; el plan visual aporta ejecución/assets.
- Packs: `get_pack_labels`/`save_pack_labels` proponen etiquetas ligadas al cálculo real, sin duración inventada.
- Creativos: `get_creative_content`/`save_creative_content` guardan conceptos, dirección y copy con estrategia, ángulo y selectores.
- UGC: `get_ugc_content`/`save_ugc_content` guardan guion/plan. Un still en B-roll es storyboard, no clip terminado. Renderizar video sigue un flujo separado con permisos, aprobación y costes explícitos.
- Learning: `get_product_performance`/`get_product_learning` y `save_product_learning` vinculan hipótesis y métricas reales. CTR no equivale a pedidos entregados, cobros ni causalidad visual.
