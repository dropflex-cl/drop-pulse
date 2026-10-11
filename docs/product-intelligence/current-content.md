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

Las afirmaciones nuevas, reseñas y evidencias externas conservan validación de autenticidad y permisos. Cambiar el contexto no revalida automáticamente todo lo guardado ni gasta créditos. Inventario, campañas y publicación siguen leyendo sus sistemas operativos reales.

## Concurrencia, seguridad y publicación

Los contratos permiten omitir revisiones, stamps, etags y claves idempotentes. El servidor captura la lectura y conserva comparación del artefacto y bloqueo por producto dentro de la RPC. Un cambio concurrente del mismo contenido produce conflicto y evita sobrescrituras; un cambio de contexto independiente no invalida el contenido. Las claves del cliente siguen siendo válidas para reintentar una respuesta ambigua y evitar escrituras/publicaciones duplicadas.

Se conservan RLS, propietario y scopes de MCP, claves del comerciante, límites de trabajos, archivos optimizados y borrado en cascada/Storage por producto. No se cambió autenticación. Un registro de archivo no prueba que existan sus bytes: la preparación de publicación verifica Storage y devuelve un impedimento concreto si faltan. La aprobación y la autorización Shopify son independientes; el consentimiento desactivado no se reactiva.

## Migraciones y despliegue pendiente

`20261211000000_current_product_content.sql` agrega decisiones explícitas de imagen y actualiza lectores/RPC/guards compatibles. El backfill transforma selecciones existentes y conserva descartes, textos editados, orden, destinos y visibilidad; no recupera filas con `superseded_at`. Los nombres y campos históricos permanecen para clientes anteriores y auditoría. Reemplazar funciones mantiene los permisos existentes; los guards nuevos no son ejecutables públicamente.

`20261214000000_current_ugc_keyframe_targets.sql` integra las ediciones de guiones actuales con los destinos externos de `20261212000000`. Conserva las tomas existentes y crea solo destinos ausentes; no encola renders ni consume créditos. Las migraciones `20261212` y `20261213` pertenecen al trabajo de UGC de la otra sesión y no se reemplazan aquí.

Ambas migraciones de este trabajo se aplicaron únicamente en la base local. Producción permaneció en solo lectura. Aplicar las migraciones pendientes en orden antes de desplegar estos lectores; después actualizar los contratos MCP y comprobar conexión/tema Shopify con autorización operativa. No se publicó ningún producto para verificar esta implementación.

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
