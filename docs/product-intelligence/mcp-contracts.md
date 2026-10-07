# Contratos MCP vigentes

Runtime base: **30 tools**; catálogo derivado: **37**, incluidos siete tools de persuasión PDP detrás de flag. La fuente es `lib/product-intelligence/schemas.ts`, ampliada por schemas de contenido, landing, packs, UGC, aprendizaje, galería y persuasión. `generated/` se exporta con `npm run pi:contracts`; el servidor no ejecuta JSON de documentación. `generate_landing` fue eliminado.

## Catálogo

| Grupo | Tools |
|---|---|
| Catálogo | list_products |
| Contexto y precio | get_product_context, save_product_context |
| Conocimiento | save_product_analysis, patch_product_analysis, save_research |
| Decisiones | set_product_strategy, get_product_strategy |
| Landing | get_landing_content, save_landing_content |
| Persuasión PDP (flag) | get_pdp_planning_context, get_component_catalog, get_angle_persuasion_plan, validate_angle_persuasion_plan, save_angle_persuasion_plan, get_landing_experience, save_landing_experience |
| Packs | get_pack_labels, save_pack_labels |
| Conceptos y chats creativos | get_creative_content, save_creative_content |
| Plan de galería | get_gallery_content, save_gallery_content |
| Imágenes de galería | generate_gallery_images, get_gallery_generation_status |
| UGC | get_ugc_content, save_ugc_content, generate_ugc, get_generation_status, get_ugc_montage |
| Calendario comercial | get_event_content, save_event_content |
| WhatsApp | get_usage_tip, save_usage_tip |
| Medición/aprendizaje | get_product_performance, get_product_learning, save_product_learning |

## Fronteras y garantías

La capa PDP añade get de contexto/catálogo/plan/experiencia, validate de plan y save de plan/experiencia. No genera contenido con IA. Save exige revisión, etag, `expected_planning_stamp`, idempotencia y soporta dry run; solo merchant aprueba/activa. [Contraste arquitectónico](pdp-persuasion-audit.md) y [operación](pdp-persuasion-runbook.md).

El chat entrega contenido final y planes. Guardar no llama modelos, descarga fuentes, aprueba, publica ni lanza campañas. Precio/packs se recalculan en servidor; hechos/evidencia, hipótesis y estrategia permanecen separados. Seleccionar no valida rendimiento.

Tools reciben objetos estrictos; salvo `list_products`, `product_id` identifica products en DropFlex. Actor/dueño/scopes se derivan del bearer verificado; no se aceptan claves, SQL ni identidad del modelo. Propiedad de producto, referencias, grants, verify y replay se comprueban nuevamente en servicio/RPC. Un recurso ajeno se oculta sin filtrar contenido.

Escrituras usan revisión, recibo idempotente y audit transaccionales; contenido además usa etag/stamp para impedir reemplazos concurrentes. Dry-run informa propuesta/estimación sin dispatch. Omitir arrays conserva; los patches son tipados y atómicos. Consultar el schema concreto para campos requeridos y versión: landing admite compatibilidad 1.0, arrays 1.1 y metadata opcional 1.2; learning admite execution opcional en 1.1.

Generación UGC inicia keyframes o clips de guion aprobado; no redacta guiones. Galería inicia tomas guardadas usando Gemini/Higgsfield. Ambos pueden gastar créditos del comerciante; QA visual opcional usa Anthropic. Status lee estado persistido, no sondea proveedores. Publicación y decisiones humanas permanecen en la UI.

Envíos ambiguos se concilian sin retry ciego. El deadline HTTP no cancela transacciones ya confirmadas ni pedidos externos aceptados. Métricas proceden de caché Meta con periodo/moneda/zona; compras no significan COD cobrado. Learning congela mediciones y limita inferencias.

Servidor SDK oficial 1.32.0, discovery paginado con contratos completos, envelopes structuredContent y texto equivalente, isError para errores de dominio. Un nombre retirado/desconocido produce error de protocolo InvalidParams.

[Contratos exportados y validación](contracts/README.md), [OAuth](oauth-runbook.md), [landing](landing-content-mcp.md), [variantes](landing-variants-mcp.md), [packs](pack-labels-mcp.md), [UGC](ugc-chat-mcp.md), [contenido/aprendizaje](chat-content-and-learning.md).

## Elegir un producto desde el chat

Llama `list_products` con `{}` antes de optimizar si no conoces el ID. Devuelve `data.products` con `product_id` (UUID de DropFlex), `name` y `description` (texto guardado, hasta 300 caracteres; `null` si falta). Prioriza el nombre y la descripción del contexto confirmado sobre el catálogo de Shopify. Después llama `get_product_context` con el `product_id` elegido.

Requiere `product_intelligence:read` y revalida la autorización en la base. Solo devuelve productos del dueño, omite los que se están borrando y excluye Upsell por defecto (`include_upsell: true` permite consultarlos). No crea contexto ni llama a IA. `page_size` acepta 1–50 (20 por defecto); repite la llamada con `cursor: data.next_cursor` y las mismas opciones hasta recibir `null`. Orden estable por ID, con cursor del último producto; no es un snapshot del catálogo.

Migración requerida: `20261124000000_product_intelligence_product_list.sql`.
