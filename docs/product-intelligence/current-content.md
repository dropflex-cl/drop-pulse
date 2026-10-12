# Contenido vigente y decisiones explícitas

Este documento reemplaza los requisitos históricos de aprobación, conciliación y vigencia estratégica para usar contenido. El historial conserva procedencia y auditoría, pero no decide qué puede publicarse.

## Diagnóstico en producción, solo lectura

Producto `5fc0c212-67de-402b-b7a5-8b61f2643d6f`: los 27 componentes estaban aprobados y habilitados. El plan `66af7cc8-730b-469f-b751-276fe6040bb2` apuntaba a la estrategia anterior `beafbd5f-f616-4235-989b-b83c4a9ccc91`, mientras la estrategia seleccionada era `dcbdfec5-7c06-48df-889f-c2c186a36ec4`. El lector devolvía `strategy_changed`, `dependencies_changed` y `reconcile_plan`. Tres imágenes aprobadas conservaban dependencias de esa estrategia; una además indicaba cambio de políticas. La autorización Shopify estaba activa y la preparación de publicación seguía bloqueada. No se modificó el producto ni se publicó durante esta auditoría.

## Mapa de reglas retiradas

| Recorrido | Bloqueo anterior | Regla vigente |
|---|---|---|
| MCP → servicios | Revisión global, stamps y etags obligatorios en cada pedido | Parámetros opcionales; lectura, CAS e idempotencia internos |
| Estrategia → contenido | Snapshot seleccionado congelado; contexto/precio cambiado exigía revisar | Estrategia actual editable; oferta leída del precio canónico actual |
| Identidad → plan → iteración → pieza | Cadena de aprobaciones y versiones exactas | Datos para generación solicitada; procedencia sin invalidación automática |
| Pieza → binding | Aprobar pieza/plan y reencadenar dependencias | Asignar selecciona el uso; archivo y destino deben existir |
| Plan de persuasión → experiencia | Revisión exacta y plan inmutable después de activación | Plan editable; la experiencia guarda variante, visibilidad y orden |
| MCP → componentes | Nueva corrida reemplazaba filas y protegía una copia manual paralela | Se actualiza la fila vigente; último guardado explícito de UI o MCP |
| UI → componentes | Aprobar/revisar antes de habilitar o publicar | Editar, seleccionar, mostrar/ocultar y descartar explícitamente |
| UGC | Guion aprobado, contexto y fingerprints de planos como requisitos del archivo final | Archivo existente y trabajo real; edición no invalida medios elegidos |
| Etiquetas | Precio/contexto distinto anulaba etiquetas guardadas | Texto actual disponible salvo descarte; precio operativo sigue siendo canónico |
| Publicar → Shopify | Aprobación, snapshots y dependencias históricas | Contenido necesario, variantes/destinos, archivos, conexión y permisos |

## Fuente de verdad y precedencia

- `product_intelligence` y el grafo guardan contexto y decisiones. `pi_strategy_versions` mantiene el nombre compatible, pero editar la estrategia seleccionada actualiza su mismo ID. `pi_revisions`, versiones visuales y eventos son historial técnico.
- `page_components` contiene el texto vigente editable (`content`, con `proposal` como lectura compatible de registros antiguos), `enabled`, imágenes y orden. MCP puede mostrar/ocultar explícitamente mediante `entries[].enabled`; omitirlo conserva la decisión anterior. UI y MCP actualizan el mismo ID. El último cambio explícito del texto prevalece; la migración conserva las ediciones ya existentes. Omitir imágenes de una variante al editar conserva la selección; `images: []` la vacía explícitamente.
- `pi_visual_records` contiene piezas y bindings actuales. `payload.selected` decide el uso. Las dependencias son procedencia. Un binding conserva su selección al editar el componente o el contexto. Un destino eliminado requiere asignarlo a otro destino real.
- `page_images.is_selected` y `discarded_at` expresan selección y descarte; el trigger traduce escrituras de clientes antiguos. Los descartes y registros históricos no se recuperan como respaldo.
- `pi_landing_experiences` guarda variantes por ángulo/hook, selección de contenido, visibilidad y orden. Las asignaciones explícitas de imágenes en una experiencia actualizan las selecciones del componente/variante vigente. Estas variantes representan alternativas comerciales, no versiones históricas. `effectivePage` y `preparePublish` resuelven la misma selección para ficha, vista previa y publicación.
- Guiones, conceptos, planes de galería y etiquetas actuales mantienen IDs al editar. Los archivos y decisiones existentes se conservan. La integración de keyframes externos agrega destinos nuevos sin generar imágenes ni borrar tomas existentes.

Los estados antiguos `generated`, `in_review` y `approved` siguen aceptados durante el despliegue; no son requisitos de uso. `rejected`, archivado, descarte, selección y `enabled=false` siguen siendo decisiones explícitas. Las acciones antiguas de aprobación son alias compatibles. Guardar no habilita secciones ocultas ni publica el producto.

El contenido solicitado no requiere evidencia, verificación de hechos ni reseñas aprobadas. Fuentes y estados conservan procedencia; propietario y permisos siguen vigentes. Cambiar el contexto no revalida automáticamente todo lo guardado ni gasta créditos. Inventario, campañas y publicación siguen leyendo sus sistemas operativos reales.

## Concurrencia, seguridad y publicación

Los contratos permiten omitir revisiones, stamps, etags y claves idempotentes. El servidor captura la lectura y conserva comparación del artefacto y bloqueo por producto dentro de la RPC. Un cambio concurrente del mismo contenido produce conflicto y evita sobrescrituras; un cambio de contexto independiente no invalida el contenido. Las claves del cliente siguen siendo válidas para reintentar una respuesta ambigua y evitar escrituras/publicaciones duplicadas.

Se conservan RLS, propietario y scopes de MCP, claves del comerciante, límites de trabajos, archivos optimizados y borrado en cascada/Storage por producto. No se cambió autenticación. Un registro de archivo no prueba que existan sus bytes: la preparación de publicación verifica Storage y devuelve un impedimento concreto si faltan. La aprobación y la autorización Shopify son independientes; el consentimiento desactivado no se reactiva.

## Migraciones y despliegue

`20261211000000_current_product_content.sql` agrega decisiones explícitas de imagen y actualiza lectores/RPC/guards compatibles. El backfill transforma selecciones existentes y conserva descartes, textos editados, orden, destinos y visibilidad; no recupera filas con `superseded_at`. Los nombres y campos históricos permanecen para clientes anteriores y auditoría. Reemplazar funciones mantiene los permisos existentes; los guards nuevos no son ejecutables públicamente.

`20261214000000_current_ugc_keyframe_targets.sql` integra las ediciones de guiones actuales con los destinos externos de `20261212000000`. Conserva las tomas existentes y crea solo destinos ausentes; no encola renders ni consume créditos. Las migraciones `20261212` y `20261213` pertenecen al trabajo de UGC de la otra sesión y no se reemplazan aquí.

Durante la implementación inicial se aplicaron únicamente en la base local. El 2026-10-11, con autorización explícita del comerciante, se aplicaron en producción las cuatro migraciones pendientes `20261211` a `20261214`, en orden. La comprobación posterior confirmó que no quedan migraciones pendientes. El despliegue de aplicación y las comprobaciones operativas de Shopify son independientes; no se publicó ningún producto para verificar las migraciones.

Antes de aplicar se respaldaron el esquema y los datos públicos. La inspección encontró cinco imágenes proyectadas desde bindings: su guard impedía completar `is_selected` desde el valor inicial. El backfill establece `pi.visual_projection` solo dentro de su transacción y lo restablece al terminar, sin retirar el guard ni modificar archivos o usos. La prueba local reproduce ese estado inicial y comprueba que una escritura normal permanece bloqueada.

Después de migrar coinciden las nueve huellas previas de componentes, imágenes (sin las columnas nuevas ni su timestamp), registros visuales (sin la nueva selección), experiencias, estrategias, etiquetas, guiones, tomas y publicaciones. Las cinco imágenes seleccionadas conservan su decisión y todos los bindings tienen selección explícita. El producto del diagnóstico conserva 27 componentes habilitados y cinco imágenes seleccionadas. RLS sigue activo, el trigger de destinos externos cubre inserción y edición, y el worker Remotion retirado no tiene permisos de ejecución. No se lanzaron generaciones, campañas ni publicaciones de productos. Verificación de la corrección: diez pruebas locales, TypeScript y lint del archivo modificado correctos.

## Verificación

`current-content.local.test.ts` ejerce MCP, RPC reales, edición UI, preparación Shopify y un archivo WebP real en Storage local. Comprueba guardado sin aprobación, imagen ligada a estrategia antigua, cambio de hooks/estrategia manteniendo ID, cambio de contexto/precio, edición UI/MCP de la misma fila, conservación de ocultar/descartar y backfill, preview/publicación compartidos y errores de permisos/archivo ausente. Las fixtures se eliminan al terminar. Las pruebas de dominio cubren disponibilidad, selección, destinos, referencias y autenticidad. Los contratos se regeneran desde los schemas compartidos.

La comprobación de producción fue diagnóstico de lectura; la solución operativa de ese producto requiere desplegar código y migraciones. No se ejecutaron llamadas pagadas, campañas ni publicación real para probarla.

Resultados de cierre (2026-10-11):

| Comprobación | Resultado |
|---|---|
| Suite general | 1.215 pruebas aprobadas; integraciones opt-in ejecutadas aparte |
| Integración Supabase/Storage local, 10 suites | 125 pruebas aprobadas, incluidas 9 del caso de contenido vigente |
| TypeScript y lint de archivos modificados | Correctos |
| Contratos compartidos | 65 pares exportados; validación de ejemplos y límites correcta |
| Compilación Next.js en copia aislada | Correcta; conserva avisos existentes de prerender en onboarding/ads |
| Tokens del design system | Sin valores sueltos |
| Navegador: móvil/escritorio, claro/oscuro, Plan/Identidad/Piezas | 12 combinaciones, sin aprobaciones obligatorias, desbordamiento ni incidencias WCAG AA detectadas |
| Producción | Diagnóstico de lectura únicamente; sin migraciones, despliegues ni publicaciones |

El lint global conserva errores preexistentes, principalmente en los assets del tema Shopify. La verificación acotada a los archivos modificados no presenta errores. No se alteraron autenticación ni archivos protegidos.

## Limpieza del flujo histórico

Las instrucciones de inicialización MCP y las descripciones de tools expresan contenido vigente y decisiones explícitas. Guardar no requiere autorización de publicación ni una llamada posterior a `review_visual_record`. `bind_visual_asset` asigna y selecciona el uso; revisiones, etags y stamps se resuelven internamente. Los aliases de revisión y reconciliación siguen disponibles para clientes anteriores, identificados como compatibilidad opcional.

Los schemas públicos no exportan una clave idempotente fija como valor por defecto. Si se omite, el servidor crea una clave por pedido; un cliente puede conservar su propia clave para reintentar una respuesta ambigua. La exportación es determinista y las pruebas comprueban claves distintas para pedidos nuevos y conservación de una clave explícita para reintentos.

Se retiraron `StageNav`, `showsBaseScreen` y la fábrica aislada `freezeGenerationContext` con sus pruebas del modelo anterior. No tenían consumidores operativos. `ReviewFlow` conserva su demo; `StageMeter` sigue utilizado por onboarding. El schema histórico de generación y su exportador permanecen por los contratos publicados. Esta limpieza no elimina campos de base de datos, autenticidad de evidencias, permisos, auditoría ni concurrencia.

Verificación de esta limpieza: 1.197 pruebas generales aprobadas; TypeScript, lint de los archivos modificados y validación de los 65 pares de contratos correctos. Inicialización y discovery MCP comprobados localmente. No se añadieron migraciones ni se ejecutaron acciones en producción.

## Retirada de consumidores redundantes

La situación del producto vive en `lib/products/presentation.ts`. Los lectores ya no calculan fases, medidores ni siguiente etapa. `Product.sections` conserva accesos y categorías de costos; `publicationReady` deriva de contenido efectivo e impedimentos reales. Anuncios consulta esa disponibilidad en UI y servidor; los controles de Meta y presupuesto se conservan.

Se retiraron el progreso de aprobación de copy, su consulta de vigencia contextual, los lectores abreviados antiguos, `storeFacts` (copia paralela sin consumidores), el wrapper identidad `shopifyStrategyRead`, el lector redundante de autorización, el helper de replay sin consumidores y utilidades sin llamadas. La idempotencia real sigue en RPC/receipts y las pruebas locales. `content-decisions.ts` normaliza estados anteriores a disponibilidad y selección conservando descartes.

Las decisiones actuales de imágenes leen `is_selected` y `discarded_at`; el trigger conserva la traducción de `status` para clientes anteriores. Seleccionar no recupera descartes; recuperarlos es explícito y no los selecciona automáticamente. Se mantienen archivo, destino, formato, orden y propietario.

Discovery marca las dos tools de reconciliación con `dropflex/deprecated` y su reemplazo. Se conservan invocables porque todavía forman parte del contrato público. El antiguo PATCH `approve` devuelve el contenido actual sin aprobar, activar ni recuperar nada; los writers internos ya no aceptan esa bandera. No se eliminan campos ni tablas de auditoría o concurrencia aún usados por RPC, contratos o datos persistidos. No se requieren migraciones adicionales por esta limpieza.

Los nombres de las listas se leen desde contexto autorizado sin calcular readiness de estrategia. Imágenes ya no consulta vigencia estratégica ni expone candados o stale de etapas; los requisitos de una generación explícita permanecen en `cannotGenerate`.

Verificación de la retirada: 1.199 pruebas generales aprobadas, 126 de integración local (10 suites), compilación aislada correcta, TypeScript y lint de los archivos modificados correctos, 65 pares de contratos validados. El navegador comprobó 24 combinaciones de móvil/escritorio y claro/oscuro en producción visual, página, publicación y anuncios: sin desbordamiento ni incidencias WCAG AA detectadas. Los primeros fallos transitorios del gateway local desaparecieron al ejecutar las integraciones secuencialmente; las selecciones y la lectura aislada de nombres pasaron con Supabase real local. Producción no recibió migraciones, publicaciones de productos ni generaciones.

## Retirada de revisión automática de imágenes (2026-10-11)

Se retiró «Revisar cada imagen con IA» de Información y oferta, su endpoint y cliente, sus tipos, los prompts y esquemas de veredicto, los indicadores de QA y los reintentos automáticos. Galería, anuncios y keyframes guardan el render solicitado, optimizado, con el registro de costo del proveedor. Anthropic ya no es requisito de estos renders. La conexión de Anthropic y su validación siguen disponibles; se retiró el cliente de generación estructurada de pago que solo usaba el QA.

La migración `20261216000000_retire_image_qa.sql` elimina `products.image_qa`, `pi_gallery_operations.qa_enabled`, los campos `qa` de `page_images`, `creative_assets` y `video_shots`, y `baked_texts` de imágenes y anuncios. También elimina `page_images.retry_of` y los contadores `attempt` de imágenes y anuncios, que solo usaba el reintento automático. El contador de tomas de video se conserva para sus reintentos manuales. La RPC de galería ya no acepta `p_qa`, y la huella de ejecución no consulta configuración de revisión.

Se preservan archivos, selecciones, descartes, usos, costos cobrados, registros de auditoría y las migraciones anteriores. El hash conserva una posición constante para que las huellas de productos que ya tenían la revisión apagada sigan iguales. Para los demás, la migración sustituye solo huellas que coincidían con el contexto vigente; no recupera inputs obsoletos ni invalida trabajos por retirar esta opción. No encola generaciones ni activa proveedores.

Aplicada y comprobada en Supabase local y, con autorización explícita del comerciante, en producción el 2026-10-11. El commit `4fc4841` se subió a `main` y Vercel completó su despliegue antes de aplicar la migración. No había imágenes, anuncios ni tomas de video en cola o ejecución. Se respaldaron el esquema y los datos públicos antes del cambio. Los contratos MCP exportados y el catálogo de diseño reflejan la retirada; las referencias a QA en especificaciones históricas se identifican como anteriores a esta decisión.

Verificación: 124 pruebas de los módulos afectados y 55 de integración local (galería/anuncios, UGC, migración, contenido vigente y proyecciones). La migración se prueba dentro de una transacción revertida, con configuración anterior encendida/apagada, imágenes elegidas/descartadas, costos históricos y trabajos vigentes/obsoletos. Dos renders con proveedor simulado y Storage real guardan únicamente el trabajo solicitado y su costo. Chromium comprobó cuatro pantallas a 390 y 1280 px, en claro/oscuro: 16 combinaciones sin QA, desbordamiento, errores de navegador ni incidencias WCAG AA detectadas. Contratos, tokens, TypeScript, lint de cambios y compilación aislada correctos. La suite general aislada pasó 1.203 pruebas y detectó dos fallos de `review-stars` reproducibles en HEAD anterior al cambio; no se modificó ese componente para esta retirada. No se ejecutaron llamadas pagadas ni publicaciones de productos.

Cierre de producción: migración registrada una sola vez; cero columnas o referencias SQL de QA retiradas; RPC nueva disponible solo para `service_role`, sin permisos de `anon` ni `authenticated`. Coinciden las quince huellas previas de datos y objetos de Storage (excluyendo únicamente campos retirados y huellas técnicas sustituidas por la migración). La comprobación HTTP de la app devolvió 200. Los respaldos y resultados quedan en `output/image-review-retirement/production/`.


## Retirada de requisitos de evidencia para el contenido

Por pedido explícito del comerciante, el MCP y la skill de optimización dejan de exigir pruebas reales, hechos aprobados o verificados, reseñas importadas, material manual o revisión de alcance para redactar y guardar contenido. `fact_id` es opcional en los componentes de PDP; las referencias existentes conservan procedencia. Las historias aceptan `body` y `name` propios o un `review_id` opcional. Antes/después y retratos aceptan imágenes generadas y se muestran sin `fact_id` tanto en Shopify como en la vista previa. Las etiquetas de packs permiten duración sin facts. No se usa `{state:"empty"}` automáticamente por falta de respaldo; permanece como elección explícita.

`20261217000000_remove_content_evidence_gates.sql` retira los mínimos de reseñas y los requisitos de verificación/aprobación/proveedor de las RPC. Conserva datos existentes, pertenencia, permisos, concurrencia, idempotencia, archivos, descartes y visibilidad. La procedencia, los estados de investigación y la autorización para publicar se conservan. Las declaraciones explícitas de investigación y sus permisos de edición siguen siendo metadata auditada; no son requisitos de contenido. El precio, los packs y la logística operativos conservan su cálculo y publicación propios.

La fuente actual del plugin incluye estos cambios en 1.6.4. La migración se aplicó en Supabase local. El paquete instalado y los servicios remotos requieren su actualización y despliegue; no se publicaron productos ni campañas como parte de este cambio.

Verificación: 1.321 pruebas generales, 90 pruebas de integración local y 75 regresiones de los módulos finales; contratos, tokens, TypeScript y lint de los archivos modificados correctos. La compilación con webpack terminó correctamente. Turbopack encontró una restricción de puertos del entorno; el lint global mantiene errores en archivos del tema y otros módulos ajenos a esta retirada.

## Corrección de las restricciones residuales de reseñas en 1.7.0

La primera retirada dejó dos carencias: los contratos de review-slider/review-wall seguían pidiendo IDs importados y prohibían redactar reseñas; el nuevo reporte de 1.7.0 marcaba estos componentes con medios pendientes cuando `review_count` era cero. El contexto de generación también pedía experiencias existentes y conservar una distinción de prueba real. La skill declaraba libertad de contenido, pero el contrato y el reporte todavía inducían a dejarlo pendiente.

1.7.1 permite `body`, `name` y `rating` opcional en review-slider/review-wall, conservando `review_id` como referencia opcional. El slider acepta también `excerpt` propio. review-stars permite label, rating y count editables; stats-with-image añade testimonial y valores de cifras propios. Estos datos se guardan en el componente, sin modificar las reseñas importadas ni su resumen global. UI, Liquid, preview y publicación consumen los mismos campos; desaparecen los mínimos de importación y los controles obsoletos del tema.

get_component_generation_context describe estas opciones y get_pdp_completion_report deja de exigir reseñas importadas como medios. GIF y video siguen necesitando archivos reproducibles de su formato, de origen manual o generado; un archivo faltante no impide redactar ni guardar el texto o guion. La versión fuente y los manifiestos del plugin pasan a 1.7.1; no hay migración nueva porque las columnas JSON vigentes ya persisten los campos.

Verificación: 1.335 pruebas generales, 15 de integración local, paridad Liquid/React con contenido propio sin reseñas importadas, contratos exportados, TypeScript, lint de los archivos modificados, tokens y compilación con webpack. Theme Check inspeccionó 457 archivos sin errores; conserva 45 advertencias. No se generaron medios ni se publicaron productos o campañas.


## Argumentos e imágenes por componente

`get_component_generation_context` combina información y oferta vigentes con la estrategia y su ángulo/hook primario, el contrato nativo de Shopify y una tarea argumental propia de cada componente. Incluye la variante solicitada, extractos de los demás argumentos, slots, ratios y destinos. El chat desarrolla y revisa el copy; el servidor valida su contrato. `get_pdp_completion_report` resume todos los contratos, variantes, contenido pendiente, imágenes y medios específicos. Sus componentes se paginan con `components.next_cursor`. La validación estructural no certifica alineación semántica ni sustituye `preparePublish`.

Los usos visuales aceptan `landing_component` con `component`, `content_variant_key`, `slot` y `position` (desde 1), sin crear un plan persuasivo o una experiencia para desbloquear el destino. `bind_visual_asset` conserva las imágenes vecinas y sincroniza las experiencias existentes que usan esa variante, sin alterar su orden ni visibilidad. Las selecciones anteriores conservan el orden del array; una asignación directa añade posiciones estables al slot. GIF y video mantienen sus contratos propios. Una toma nueva exige que la identidad corresponda al ID y hash de la base vigente; el cambio de base conserva los archivos y usos existentes. Migración: `20261218000000_component_generation_context.sql`. Skill `optimize-product` y plugin: 1.7.0.

## Valoración agregada compartida en 1.7.11

`review-stars.rating/count` es la fuente editable de Google, Estrellas, Hero y cifras, muro, slider, UGC, FAQ y prueba social. `pdpRating` resuelve los mismos valores por hook, ángulo y default; los campos antiguos de Hero y las reseñas importadas son respaldos compatibles cuando falta un campo. `productMetafields` publica el resultado en `dropflex.review_summary`, incluidas variantes sin importaciones. Ese resumen forma parte de la activación atómica de la página. La experiencia puede elegir una variante de contenido sin crear otra fuente de valoración; ocultar una sección conserva los datos guardados.

La auditoría encontró una fuente separada en `shop.metafields.dropflex.google_rating`, mínimos de cantidad en Google, Estrellas, UGC y prueba social, overrides de rating/count en Hero y sustituciones automáticas por proporciones importadas en Estrellas, Hero y muro. Se retiraron para el agregado. El metafield de Google conserva únicamente su URL opcional. Las cifras publicadas sincronizan textos, relleno de estrellas y accesibilidad al cambiar la variante; la caché de navegador no decide la nota ni la cantidad. Los ajustes históricos de mínimos permanecen inertes por compatibilidad.

El MCP descubre la fuente común en `rating_source` y permite leerla y guardarla con `get_landing_content`/`save_landing_content`. No requiere evidencia, verificación, importaciones ni configuración de Google. Los contratos de dominio, contexto de generación, Liquid, React y skill fuente comparten esta regla. La fuente del plugin y su paquete pasan a 1.7.11, sin nueva migración.

Las estrellas de cada testimonio siguen siendo individuales. El popup flotante conserva su fuente de tarjetas importadas `dropflex.reviews` y su filtro de cuatro/cinco estrellas; no calcula el agregado. Los archivos de video/GIF y los datos operativos de precio, inventario, logística y políticas conservan sus requisitos propios. Ninguno constituye una exigencia de datos reales para editar la valoración agregada.

Verificación: 126 regresiones finales (incluidas 115 de paridad Liquid/React), 15 pruebas de integración local de guardado/publicación, contratos exportados y validados, TypeScript y lint de cambios. Theme Check inspeccionó 458 archivos sin errores y con 42 advertencias. La suite general pasó previamente 1.386 pruebas. Estos cambios son locales: no se desplegó el servidor, no se distribuyó el plugin ni se publicó un producto o tema en Datazo.

## Rango de valoración agregada en 1.7.12

La nota compartida debe estar entre 4,4 y 4,9, inclusive. Los contratos de `review-stars` y del respaldo compatible de Hero rechazan valores fuera de rango. La resolución para preview/publicación y el snippet/runtime del tema limitan agregados históricos e importados al extremo más cercano y redondean a un decimal. La ausencia de nota conserva `null`; las calificaciones individuales y la cantidad no se modifican. MCP, contratos exportados y skill fuente 1.7.12 describen el mismo rango. No se modifica el contenido persistido anterior ni se publica en Datazo.

Verificación del rango: 161 pruebas de dominio, publicación, Liquid, runtime y paridad React; 15 pruebas de integración local (incluyen rechazo MCP fuera de rango), contratos exportados, TypeScript y lint de cambios. Paquete fuente 1.7.12 regenerado. No se desplegó ni se publicó en Shopify.
