# La app representa el contenido persistido del MCP

## Auditoría y decisiones

| Pantalla o regla anterior | Implementación |
|---|---|
| Entrada redirigida a la siguiente etapa | Ficha central con o sin contenido |
| Nueve etapas, bloqueos y medidor | Retirados de navegación y situación operativa |
| Hoy con tareas de generación y revisión | Publicación, cambios, errores y campañas reales |
| Productos Avanzan/Detenidos | Guardados/Con error, sin medidores; parámetros compatibles |
| Información base y cliente ideal como requisito | Datos canónicos y oferta; proveedor y referencias secundarios |
| Ángulos como ranking y desbloqueo | Consulta de estrategia guardada |
| Página con catálogo vacío y rondas de aprobación | Solo contenido persistido; edición, visibilidad, variantes comerciales y orden |
| Selecciones independientes en previews | Preparación compartida con publicación |
| Imágenes bloqueadas con mínimo de galería | Portada/galería operativa; una portada basta |
| Aprobar MCP otra vez | Retirado; guardar o ajustar, publicar aparte |
| Generadores internos de texto/estrategia | No se reintroducen los writers retirados |
| Workbenches técnicos principales | Biblioteca y usos con lenguaje comercial |
| Componentes permanentes que ignoraban ocultar | Todos respetan desactivación y omisión de la experiencia |
| Reseñas Google sintéticas y regalo de ejemplo | Sin datos inventados |
| Carrusel y tarjetas que ignoraban sus textos | Renderizan contenido, orden y variantes guardadas |
| Publicar por recorrido/aprobación | Requisitos de datos/archivos y permiso Shopify |
| Reseñas, creativos, anuncios, WhatsApp, eventos, Upsell | Herramientas útiles conservadas, sin obligatoriedad |
| Auth, aislamiento, eliminación y métricas | Modelos y controles conservados; auth sin cambios |

## Entidades y precedencia

`products` mantiene catálogo e inventario Shopify. `product_intelligence` y revisiones contienen contexto, grafo y estrategia. `product_pricing` y `pack_labels` contienen oferta calculada y etiquetas. El pipeline de análisis retirado no sirve de respaldo.

`save_landing_content` persiste textos/variantes en `page_components` por la proyección nativa PI. `get_landing_content` y la UI leen el mismo contenido. No se crea una copia para la interfaz. `content ?? proposal` lee contenido antiguo sin duplicar fuentes. UI y MCP actualizan la misma fila: el último guardado explícito cambia el contenido vigente; se conservan decisiones de visibilidad, descarte e imágenes omitidas. La migración no sobrescribe ediciones anteriores.

Las propuestas nuevas conservan `enabled=false` y `rejected`. No se recuperan supersedidos ni descartes como fallback. Reactivar es una decisión explícita.

`pi_persuasion_plans` y `pi_landing_experiences` conservan estrategia, selector, variante, orden, visibilidad y overrides. La experiencia activa manda sobre coincidencias independientes. Resolución: gancho exacto → ángulo → principal. Cambiar la principal retira la marca anterior y registra ambas revisiones en una transacción. Sin experiencia activa se representa contenido nativo vigente, incluyendo páginas anteriores válidas.

`pi_visual_records` mantiene planes, assets y bindings; `page_images` proyecta sus usos. Portada/galería combinan archivos nativos y del dominio visual mediante una transacción propia. Las referencias excluidas y los medios revocados no se recuperan silenciosamente. `pi_visual_operations` mantiene ingestión y reintentos. Creativos y UGC conservan sus contratos, archivos y proveedores; los guardados desde MCP ya aprobados no piden otra aprobación.

`product_publications`, Shopify y campañas conservan estados operativos. Una aprobación no modifica esos sistemas ni autoriza llamadas externas.

## Una preparación efectiva

`getPreparedProduct` comparte `preparePublish` por petición. `getEffectiveProductContent` firma sus fuentes exactas y `previewFacts` deriva precio, packs, reseñas, políticas y plazos del snapshot de publicación, sin volver a leer selecciones antiguas. Los hechos verificables del editor se consultan en PI. `effectivePage` y `effectiveVariant` resuelven ficha/editor. El tema usa el mismo manifiesto runtime, variantes y desactivaciones. El título principal efectivo llega al resumen y publicación.

Un error de requisitos conserva el manifiesto y contenido visibles; bloquea publicar sin activar otra arquitectura. Los errores de infraestructura se propagan: no se usa una página alternativa. Se excluyen requisitos, usos visuales y medios de componentes fuera de las experiencias activas, incluso cuando comparten archivo con la portada. Si hay versiones activas sin principal, se muestran esas versiones y se pide elegir el destino de las visitas directas. Solo una portada disponible es necesaria; no hay mínimo de galería ni de componentes. Precio, ficha válida, plazos, referencias y medios realmente utilizados se validan.

La huella incluye textos, variantes, orden, imágenes, oferta, políticas y acento. Excluye URLs firmadas y revisiones internas sin cambios visuales. `summary.content` registra hashes por categoría. Publicaciones antiguas sin resumen muestran «Contenido guardado», sin inventar un diff.

## Permisos, concurrencia e historia

Componentes: ID/fecha esperados, dueño y lock. Experiencias: revisión, etag, planning stamp e idempotencia. Galería: revisión, etag y dependency stamp; validación de archivos/rendiciones; dominio visual, proyección e historia atómicos. Un retry recupera su receipt antes de CAS.

`pi_claim_product_publication` serializa inicios bajo lock y conserva los datos de la publicación anterior. El worker comprueba la huella capturada antes de tocar Shopify y usa el snapshot para contenido y políticas. Las nuevas RPC son de rol de servicio. No se añaden tablas o buckets: se conservan cascadas y limpieza de `deleteProducts`.

## Verificación y entrega

`product-content-representation.local.test.ts` comprueba autoaprobación, ocultos, texto manual tras otro save, descarte, recuperación explícita, CAS, propiedad, orden, idempotencia, portada mínima y publicaciones concurrentes. `persuasion.local.test.ts` añade promoción de principal y contenido fuera de experiencias. Las pruebas puras cubren resolución, orden, medios, ocultos, compatibilidad y cambios publicados.

`product-experience-ui.local.test.ts` prepara cinco productos por contratos MCP en Supabase local: vacío, parcial, completo, publicado y actualizado. Navega ficha/base/copy/images/publish a 390 y 1440 px. Verifica variantes, estados, overflow, ajuste del nombre canónico, edición manual del título, ocultar/recuperar sección, quitar/restaurar portada, claro/oscuro, errores JS y axe WCAG AA. Limpia usuarios y archivos al terminar. Capturas y reporte: `output/product-experience/qa/`.

La suite del dominio PI pasó con 453 pruebas en serie sobre Supabase local. Las pruebas en paralelo tuvieron respuestas intermitentes del servidor local; las mismas pruebas pasaron en serie. El árbol aislado del commit del rediseño pasó las 1.212 pruebas generales y el build con webpack, incluyendo TypeScript. El código de montaje de video que se desarrolla en paralelo queda fuera de este commit. El build por defecto encontró una limitación de puertos del entorno de Turbopack. El reporte de navegador y el resumen de la verificación inicial están en `output/product-experience/` (artefactos locales).

La verificación inicial no modificó producción ni llamó a Shopify, Meta o proveedores reales. La entrega posterior fue autorizada expresamente por el comerciante: commit, push a main y aplicación de migraciones pendientes. `20261209000000_product_content_representation.sql` requiere `20261208000000_mcp_content_approval.sql`. Las migraciones deben verificarse contra el historial vinculado y respaldarse antes de aplicarse. Actualizar los temas de las tiendas y publicar productos son operaciones separadas; esta entrega no ejecuta esas acciones.

## Decisiones vigentes y compatibilidad

[Contenido vigente](current-content.md) reemplaza las reglas históricas de aprobación y vigencia estratégica. Los planes y la procedencia informan; no bloquean textos ni imágenes elegidas. Las variantes por ángulo/hook siguen siendo alternativas comerciales. La publicación y la vista previa comparten la resolución de contenido y comprueban archivos existentes.
