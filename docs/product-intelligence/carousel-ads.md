# Carruseles publicitarios desde el chat

Implementación de una pieza publicitaria con 2–10 tarjetas, disponible en Anuncios aunque Meta o la página todavía no estén listas para crear una campaña. El chat guarda intención, escenas, textos y archivos; la app representa el mismo contenido editable. Guardar no selecciona la pieza para una campaña ni publica.

## Contrato y persistencia

- `get_ad_carousels`: contrato exacto y contenido vigente. Una pieza por página; seguir `next_offset` con `offset`, o recuperar `carousel_id` directamente. Cada pieza puede ocupar hasta 64 KiB en PostgreSQL, conservando el límite de respuesta MCP.
- `save_ad_carousel`: nombre, proporción 1:1/4:5, texto principal, CTA, arte compartido, tarjetas ordenadas con clave estable, escena, textos integrados, título/descripción/enlace de Meta y asignación de archivo. Los parámetros técnicos se resuelven internamente. La respuesta incluye identidad de la pieza y resultado del guardado.
- `ad_media.kind = 'carousel'` conserva el agregado en `carousel_content`. `carousel_etag` generado permite CAS entre UI y MCP. No representa un archivo en Storage; los archivos pertenecen a imágenes existentes del producto.
- `asset_id` asigna un archivo visual del chat y prepara sus formatos JPEG mediante `ensureVisualRenditions`; `media_id` reutiliza una imagen de Anuncios. Omitir archivos y `enabled` conserva sus decisiones. Null quita la asignación; false deja fuera de uso sin borrar.
- `ad_carousel_card` identifica destinos por carrusel, clave y ratio. El contexto visual descubre los destinos y la pieza vigente; `bind_visual_asset` actualiza su tarjeta mediante la proyección en PostgreSQL. Una deselección quita únicamente el archivo que sigue asignado a ese uso.
- La migración `20261219000000_ad_carousels.sql` conserva los contratos anteriores de recibos, añade los nuevos campos/funciones y mantiene aislamiento por producto/dueño, CAS, idempotencia y auditoría. Usa la cascada de producto existente. El borrado recorre todos los buckets antes de eliminar filas; omite la ruta vacía del agregado.

## App y Meta

`PUT /api/products/[id]/ads/carousels` usa el mismo executor del MCP. La biblioteca muestra todas las piezas guardadas; seleccionar para el anuncio es explícito. El editor permite subir/elegir/quitar imágenes, editar textos y arte, ordenar, dejar fuera de uso y recuperar. El guardado usa una clave estable durante reintentos de la misma edición. Preview y lanzamiento filtran las mismas tarjetas activas y conservan su orden. Los controles fijos respetan el área segura.

ABO crea un anuncio por carrusel. CBO normal mantiene cada carrusel como un anuncio. En CBO DCO, los carruseles van en conjuntos independientes sin contenido dinámico; imágenes/videos conservan su conjunto DCO. El presupuesto sigue viviendo en la campaña y el límite de conjuntos contempla ambos grupos.

Al crear se comprueban tarjetas activas completas, archivos propios disponibles, proporción, texto, conexión/cuenta, destino y presupuesto. `media_snapshot` fija el contenido elegido para ese lanzamiento; ediciones posteriores no cambian lo que se está creando. Los archivos usados en campañas quedan protegidos del borrado individual.

El payload envía `link_data.child_attachments`, títulos, enlaces y CTA, con `multi_share_optimized: false` y `multi_share_end_card: false`. Para 4:5 envía `use_flexible_image_aspect_ratio`. Conserva UTM, selectores de landing, creación en PAUSED, seguimiento de objetos y compensación de fallos. La aceptación y apariencia final en ubicaciones de Meta requiere validación en una cuenta real; estas pruebas no crean anuncios externos.

## Skill y comprobaciones

La fuente del plugin/skill está en `plugins/dropflex-optimizer`, versión 1.7.7. La guía `references/carousel-ads.md` forma parte del paquete y del catálogo MCP de recursos. Explica análisis de referencias, base real en cada generación, archivos individuales, transferencia nativa/ticket, confirmación y asignación. Reutilizar la muestra existente no autoriza regenerarla. No se modificó la caché instalada.

Verificación local realizada:

- 404 pruebas de Anuncios y Product Intelligence correctas; las suites locales se ejecutan aparte.
- 4 pruebas con Supabase local: dry-run, replay, destinos visuales, asignación y JPEG, omisiones/uso/orden, CAS, binding y deselección, aislamiento de referencias y borrado completo.
- Build de producción, TypeScript, lint de archivos afectados, tokens y exportación/validación de contratos correctos.
- QA del componente real con escrituras interceptadas: 390/1280 px, claro/oscuro, selección y reordenamiento, conservación del conflicto; cero errores de ejecución, desbordamientos o hallazgos WCAG A/AA. `scripts/carousel-browser.ts` usa el CSS del build y guarda capturas en `output/carousel-implementation`.

## Estado de distribución

Esta verificación cubre el repositorio y Supabase local. No acredita despliegue, migración en producción, actualización del plugin distribuido ni herramientas importadas por la conexión actual de ChatGPT. Las seis imágenes Sadoer de `output/imagegen/sadoer-carousel` siguen siendo archivos locales: no se regeneraron, ingirieron ni publicaron con este cambio.

Antes de usarlo desde ChatGPT, seguir la verificación obligatoria de AGENTS.md: commit en main/origin/main y producción, migración con proyecto de destino confirmado y dry-run, publicación de la versión del plugin preservando identidad/conexión, `tools/list` del servidor, Refresh tools en la conexión existente y comprobación en una conversación nueva. Verificar por nombre `get_ad_carousels`, `save_ad_carousel` y el destino `ad_carousel_card`; la versión visible de la skill o el total de tools no lo certifican.
