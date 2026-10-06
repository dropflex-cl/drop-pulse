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
