# Contenido de tienda escrito en el chat

Decisión del comerciante: la investigación, estrategia y escritura de contenido se hacen en el chat. El MCP expone el contrato, recupera datos, valida y persiste. La generación de imágenes continúa con los proveedores del SaaS. No se cobra una llamada de escritura desde estas tools. Las etapas de texto legacy todavía pendientes se enumeran al final; esto no declara migrado todo el SaaS.

## Estructura comprobada

Hay 16 componentes de conversión registrados en [`catalog.ts`](../../lib/shopify/components/catalog.ts) y una ficha (`listing`) con seis campos en [`listing.ts`](../../lib/copy/listing.ts): `title`, `short_name`, `short_description`, `offer_line`, `seo_title`, `seo_description`.

| Componente | Función / campos principales | Dependencia real |
|---|---|---|
| `review-stars` | Texto de calificación, cantidad y confianza | Mínimo 3 reseñas aprobadas/publicadas con texto; tokens reales |
| `benefit-usps` | Beneficios: ícono, texto y política | Políticas de la tienda; valores como tokens |
| `inventory` | Disponibilidad y texto de respaldo | Inventario real; nunca cantidad enviada por el chat |
| `shipping-timeline` | Textos de preparación, despacho y entrega | Logística real |
| `benefit-double-box` | Tarjetas de pago y garantía | Medios de pago y políticas reales |
| `gif-strip` | Texto por GIF | Archivos del espacio GIFs en Imágenes |
| `review-slider` | Encabezado e IDs de reseña | Mínimo 3 reseñas reales; el chat no escribe testimonios |
| `ugc-slider` | Encabezado y textos asociados a videos | Gap: el publicador actual no carga `ugc_videos`; respaldo del editor de Shopify |
| `pain-block` | Encabezado, momentos y puente al producto | Hipótesis de marketing; aprobación del comerciante |
| `stats-with-image` | Titular, cifras como tokens, beneficios y reseña | Fotos, calificación y reseñas reales |
| `scrolling-benefits` | Cinta de beneficios con íconos | Políticas reales |
| `image-with-benefits` | Titular y razones con título/cuerpo | Foto elegida en el slot `main` |
| `insta-story` | Textos por historia | Medios elegidos en el slot `stories` |
| `review-wall` | Encabezado y selección de reseñas | Mínimo 4 reseñas; texto y fotos reales |
| `comparison-table` | Alternativa, filas y comparación | Revisión humana del fundamento de cada afirmación |
| `faq-and-text` | Encabezado, apoyo, CTA y preguntas por tema | Políticas como tokens; duración solo con datos respaldados |

Los nombres exactos, enums, límites y refinamientos viven en cada `content.ts`. La tool de lectura deriva su JSON Schema de esos archivos y entrega además reglas, prohibiciones y un ejemplo. No se mantiene un segundo esquema editorial. El esquema JSON expresa límites estructurales; los refinamientos adicionales se aplican con Zod al guardar y sus reglas se entregan al chat.

**Límite comprobado de medios:** `ugc-slider/content.ts` y Liquid admiten `ugc_videos`, pero `productMetafields` no asigna ese archivo: `SLOT_METAFIELD` cubre collage, stories, main y GIFs. `preparePublish` no recupera videos para este carrusel. Publicar textos de UGC no crea un carrusel usable sin videos configurados en el editor del tema. `insta-story` recibe hoy imágenes del catálogo desde la UI; la capacidad de video de Liquid tampoco demuestra un writer de video en la app. Hay que completar ambos bindings antes de anunciar publicación de videos desde MCP. `available` en esta tool expresa el requisito de reseñas para escribir texto, no preparación integral para publicar.

[`define.ts`](../../lib/shopify/components/define.ts) separa texto de datos compartidos. Precio y packs, acento, inventario, logística, reseñas y archivos tienen un flujo propio. Los archivos se publican como referencias a Shopify Files; no son URLs escritas dentro del contenido. [`mapping.ts`](../../lib/shopify/publish/mapping.ts) transforma la ficha en título/descripción/SEO y los componentes en `dropflex.*`, y calcula los packs desde los valores guardados. Liquid escapa el texto.

## Tools implementadas

`get_landing_content({ product_id, component? })` devuelve:

- Revisión actual de Product Intelligence y `landing_etag` de todos los componentes activos.
- Catálogo de 17 IDs, mínimo de reseñas y disponibilidad.
- Contrato de **un componente** por llamada (por defecto `listing`), contenido vigente, estado, imágenes asignadas, reglas, prohibiciones y ejemplo.
- Hasta 30 reseñas aprobadas/publicadas con texto, sus IDs y rating; cantidad total por separado. IDs de reseñas fuera de esta selección no se aceptan en esta primera versión.
- Precio/packs físicos guardados y políticas reales; no ejemplos de preview.
- `context_stale`: compara el snapshot guardado de cada componente de chat activo con el contexto canónico actual. Es una advertencia conservadora del contexto completo, no una medición de performance.

`save_landing_content({ product_id, schema_version: "1.0", expected_revision, expected_landing_etag, idempotency_key, dry_run?, entries: [{ component, content }] })` realiza merge explícito de hasta 17 componentes:

1. Autoriza dueño/scopes/grant vivo, incluida caducidad del bearer. El principal no llega por argumentos de tool.
2. Reproduce un receipt válido antes de CAS. La misma clave con otra carga falla. `dry_run` no consume la clave ni crea filas.
3. Aplica el esquema original de cada componente; rechaza campos desconocidos incluso dentro del contenido. Valida precios escritos, tokens, reseñas, mínimos, copy interno, claims prohibidos y duración respaldada por facts verificados/aprobados.
4. Bajo lock reautoriza, compara revisión, etag y el stamp de contexto/reseñas; rechaza escritura legacy en curso. Confirma batch, historial, audit y receipt juntos.
5. Crea un `copy_run` terminado con `source = mcp_chat`, actor y snapshot canónico completo. Guarda propuestas `generated`; la ficha queda habilitada para revisión, los otros componentes deshabilitados hasta decidirlos. Reemplaza solo los enviados, conserva los no enviados y los vínculos de imágenes anteriores. No aprueba nada ni publica.

La revisión de Product Intelligence no aumenta por guardar ejecución: el contenido tiene su propio etag e historial de `copy_runs`/`page_components`. Seleccionar estrategia sigue siendo una decisión distinta de aprobar contenido. El snapshot aporta trazabilidad de lo leído; no demuestra que cada afirmación de marketing sea cierta. La aprobación humana continúa siendo necesaria.

No hay nuevas tablas de páginas, activos o publicación. La migración [`20261105000000_product_intelligence_landing.sql`](../../supabase/migrations/20261105000000_product_intelligence_landing.sql) añade RPCs, serialización y la nueva clase de receipt. El trigger también impide arrancar un job legacy si ya hay componentes activos de chat, cerrando la carrera entre escritores. Las FKs/cascadas existentes borran versiones y componentes con el producto; el marcador de borrado impide cambios/replay. No se crean archivos que requieran limpieza adicional.

## Flujo para el chat

1. Recupera `get_product_context` y `get_product_strategy`. Usa facts aprobados como respaldo; conserva las hipótesis y la selección como hipótesis/decisión.
2. Consulta `get_landing_content` para `listing` y los componentes que vas a escribir. Respeta el precio guardado, el pack recomendado y las etiquetas aprobadas; consulta cada contrato necesario.
3. Escribe el contenido en el chat. Envía solo `{ component, content }`, sin estado de aprobación, precios derivados, URLs de archivos ni metadatos inventados.
4. Usa `dry_run: true` para validar. Con una misma revisión/etag, envía el batch real con su clave de idempotencia. Ante conflicto, recupera el estado y concilia; no fuerces sobrescritura.
5. Revisa/edita/aprueba en `/products/[id]/copy`. El contenido de chat no exige avatares/ángulos legacy ni una conexión Anthropic y no ofrece reescritura pagada. Si cambió el contexto, la UI pide revisar desde el chat.
6. Elige imágenes y publica desde la etapa Publicar. Conserva los requisitos actuales de portada, galería, precio, etiquetas, permisos y tema. Estas tools no llaman Shopify ni Meta.

## Siguientes adaptadores para mover todo el texto

| Texto/planning que hoy usa IA del servidor | Código actual | Siguiente contrato propuesto (aún no implementado) |
|---|---|---|
| Datos y estrategia antiguos | `lib/pipeline/product-data.ts`, `lib/pipeline/strategy.ts` | Retirar sus writers/UI cuando todos sus consumidores usen PI; contexto/research/análisis/selección ya tienen tools |
| Nombres de packs | `lib/pipeline/pack-labels.ts` | Ingestión de etiquetas, revisión y stamp de precio; reutilizar `pack_labels` |
| Conceptos/dirección de arte y chat de anuncios | `lib/pipeline/creatives.ts`, `lib/creatives/` | Consultar/guardar conceptos y prompts; render de imágenes separado |
| Guion y planificación UGC | `lib/pipeline/video.ts`, `lib/video/` | Consultar/guardar guion y plan existentes; imágenes clave/render separados. La permanencia del render de clips quedó como aclaración pendiente |
| Plan de imágenes | `lib/pipeline/page-images.ts`, `lib/page-images/` | Guardar el plan escrito en chat; conservar render, optimización, tracking y QA operativo |
| Textos estacionales | `lib/pipeline/events.ts` | Consultar/guardar copy de evento; aprobación/publicación separadas |
| Consejo WhatsApp | `lib/pipeline/whatsapp-tip.ts` | Guardar texto con `tipProblems`; conservar plantillas deterministas |

Los nombres de futuros contratos son propuestas de alcance, no tools anunciadas. Antes de crear cada uno hay que validar sus consumidores y forma física actual. Preservar catálogo, Auth, Storage, Shopify y Meta; nunca hacer backfill desde los textos antiguos al conocimiento nuevo.

## Puesta en marcha y rollback

Solo local. Aplicar OAuth → contexto → conocimiento → landing **antes** de este código, incluso si el MCP está apagado: el loader UI del contenido de chat usa la RPC nueva. No hubo deploy ni cambios de producción. El runtime anuncia nueve tools disponibles y conserva tres contratos de ejecución/status aún cerrados. El antiguo `generate_landing` con etapa de escritura ya no es la dirección objetivo; debe ajustarse a acciones de imágenes cuando se implemente.

Rollback de código: volver al handler/loader de siete tools y UI compatible anterior; conservar filas, receipts, funciones e historial. No hacer DROP ni reset de datos. Restituir una versión anterior de un componente sigue el mecanismo actual de supersession. Los restores legacy se hacen en varios pasos; migrarlos a un comando atómico con CAS sigue pendiente. El guard de edición evita aprobar/editar una fila ya reemplazada.

Verificación: 7 tests de dominio de landing y 9 de integración opt-in; la integración también comprueba CAS, replay, permisos, rollback, mapeo Shopify, borrado y stale. El test nativo de persistencia agrega lectura/escritura/replay de landing por OAuth+SDK HTTP. Sin proveedores pagados, host remoto ni publicación real.
