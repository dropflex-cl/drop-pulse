# Contratos MCP vigentes

Runtime y catálogo derivado: **29 tools**. La fuente es `lib/product-intelligence/schemas.ts`, ampliada por schemas de contenido, landing, packs, UGC, aprendizaje y galería. `generated/` se exporta con `npm run pi:contracts`; el servidor no ejecuta JSON de documentación. `generate_landing` fue eliminado.

## Catálogo

| Grupo | Tools |
|---|---|
| Contexto y precio | get_product_context, save_product_context |
| Conocimiento | save_product_analysis, patch_product_analysis, save_research |
| Decisiones | set_product_strategy, get_product_strategy |
| Landing | get_landing_content, save_landing_content |
| Packs | get_pack_labels, save_pack_labels |
| Conceptos y chats creativos | get_creative_content, save_creative_content |
| Plan de galería | get_gallery_content, save_gallery_content |
| Imágenes de galería | generate_gallery_images, get_gallery_generation_status |
| UGC | get_ugc_content, save_ugc_content, generate_ugc, get_generation_status, get_ugc_montage |
| Calendario comercial | get_event_content, save_event_content |
| WhatsApp | get_usage_tip, save_usage_tip |
| Medición/aprendizaje | get_product_performance, get_product_learning, save_product_learning |

## Fronteras y garantías

El chat entrega contenido final y planes. Guardar no llama modelos, descarga fuentes, aprueba, publica ni lanza campañas. Precio/packs se recalculan en servidor; hechos/evidencia, hipótesis y estrategia permanecen separados. Seleccionar no valida rendimiento.

Tools reciben objetos estrictos; `product_id` identifica products en DropFlex. Actor/dueño/scopes se derivan del bearer verificado; no se aceptan claves, SQL ni identidad del modelo. Propiedad de producto, referencias, grants, verify y replay se comprueban nuevamente en servicio/RPC. Un recurso ajeno se oculta sin filtrar contenido.

Escrituras usan revisión, recibo idempotente y audit transaccionales; contenido además usa etag/stamp para impedir reemplazos concurrentes. Dry-run informa propuesta/estimación sin dispatch. Omitir arrays conserva; los patches son tipados y atómicos. Consultar el schema concreto para campos requeridos y versión: landing admite compatibilidad 1.0 y arrays 1.1.

Generación UGC inicia keyframes o clips de guion aprobado; no redacta guiones. Galería inicia tomas guardadas usando Gemini/Higgsfield. Ambos pueden gastar créditos del comerciante; QA visual opcional usa Anthropic. Status lee estado persistido, no sondea proveedores. Publicación y decisiones humanas permanecen en la UI.

Envíos ambiguos se concilian sin retry ciego. El deadline HTTP no cancela transacciones ya confirmadas ni pedidos externos aceptados. Métricas proceden de caché Meta con periodo/moneda/zona; compras no significan COD cobrado. Learning congela mediciones y limita inferencias.

Servidor SDK oficial 1.32.0, discovery paginado con contratos completos, envelopes structuredContent y texto equivalente, isError para errores de dominio. Un nombre retirado/desconocido produce error de protocolo InvalidParams.

[Contratos exportados y validación](contracts/README.md), [OAuth](oauth-runbook.md), [landing](landing-content-mcp.md), [variantes](landing-variants-mcp.md), [packs](pack-labels-mcp.md), [UGC](ugc-chat-mcp.md), [contenido/aprendizaje](chat-content-and-learning.md).
