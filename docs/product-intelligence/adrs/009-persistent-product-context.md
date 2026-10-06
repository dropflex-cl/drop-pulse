# ADR 009 — Primera vertical de contexto persistente

Complemento posterior: [ADR 010](010-persistent-knowledge-and-strategy.md) incorpora grafo/estrategia/cursores y anuncia siete tools. Este ADR registra la primera vertical.

Estado: implementado y validado en local. Fecha: 2026-10-06. Amplía ADR 001/002/007; no declara implementado el agregado completo.

## Decisión

Activar primero `save_product_context` y `get_product_context`. El runtime publica solo estas dos tools; los diez contratos siguen disponibles para implementar las etapas siguientes. Una llamada directa a una tool pendiente devuelve `EXECUTION_NOT_READY`. Sin `MCP_ENABLED=true`, el endpoint sigue devolviendo 404.

La migración `20261103000000_product_intelligence_context.sql` agrega cabeza, inputs explícitos, revisiones, audit y receipts. El catálogo y `product_pricing` conservan su identidad. La imagen base se selecciona mediante `set_base_reference_image`, o se libera su elección explícita conservando el fallback existente; no se introduce otra base ni se copia un asset. El contexto leído contiene la base efectiva. No hay backfill de fichas, avatares ni rankings.

`service.ts` prepara el comando, recalcula con `buildPricingPlan` y confirma con RPC. `savePricingPlan` de la UI usa ese mismo servicio. Actor, dueño, scopes y sesión vienen de autenticación del servidor. PostgreSQL comprueba dueño, grant vigente, scopes y sesión, y vuelve a comprobar la expiración del JWT firmado después de esperar locks. Revocar acceso impide también replay y lecturas históricas.

La calculadora conserva la huella del precio que abrió y la envía al guardar. El adapter UI exige esa huella antes de preparar el comando con CAS del agregado: una pantalla vieja no pisa silenciosamente un precio nuevo del chat. Cambios ajenos al precio no invalidan esa huella; una carrera durante commit sí exige nueva lectura. La UI conserva lo escrito y muestra el error de `design-system/pricing.md`.

## Transacción e historia

La lectura preparatoria devuelve una huella del estado operacional. Commit bloquea producto, consulta receipt antes de CAS y exige revisión/huella iguales. Contexto, precio, selección de imagen, revisión, audit y receipt se confirman juntos. Si falla una constraint, todo se revierte. Dry-run no crea filas. No-op conserva revisión y guarda receipt; el resultado de replay es el original, aun cuando avanzó la revisión. La ventana de replay es 30 días; filas vencidas del producto se purgan en su siguiente escritura. El borrado del producto las elimina siempre.

Los writers conservados de catálogo, imágenes, etiquetas, settings y números bloquean los productos afectados y capturan un snapshot al commit si cambió el estado. Los triggers diferidos evitan capturar una selección de imagen a medias. El orden de locks de settings es estable por producto. Un deadlock o timeout devuelve un error reintentable y no autoriza duplicar la operación.

Las revisiones y audit son append-only, con triggers que permiten su borrado solo por cascada del producto. Snapshots guardan los valores físicos de precio; `lib/pricing/rows.ts` los lee sin recalcular el pasado. El serializer usa la precisión decimal de PostgreSQL para que el precio devuelto al guardar coincida con el recuperado. Nuevos packs congelan su recomendación dentro del JSON existente. Solo se incluyen etiquetas aprobadas con precios vigentes. Cambiar moneda requiere volver a ingresar costos y supuestos monetarios; no implica conversión.

`deleteProducts` marca primero `pi_deleting_at`, antes de pausar Meta y limpiar Storage. Las RPC PI rechazan el producto marcado. Si falla la limpieza, el producto queda para el próximo sync y sigue cerrado a cambios PI. Las cinco tablas nuevas caen con el producto. Los generadores legacy todavía requieren su adaptación al mismo guard antes de habilitar generación MCP.

## Límites de esta entrega

Los bloques de conocimiento están vacíos porque todavía no tienen writers persistentes. PDP, assets y performance devuelven `availability=unknown`; no se atribuye contenido viejo a una estrategia nueva. `performance:read` se comprueba también en PostgreSQL. Sin entidades paginables no se emiten cursores; un cursor recibido se rechaza. No se inventa una estrategia ni se declara listo para ejecución.

No se necesita dispatch/outbox para esta vertical sin generación. Outbox, invalidaciones durables, grafo relacional, selección de estrategia, cursores firmados y workers siguen pendientes. No se retira todavía el pipeline legacy mientras sus generadores conservados dependan de él.

Producción permanece readonly. Antes de desplegar este código se debe aplicar la migración: la calculadora UI ahora usa la nueva RPC aun cuando MCP esté desactivado. El rollback debe restaurar primero el writer UI anterior; apagar MCP por sí solo no revierte esa dependencia. No eliminar historia ni precios como rollback rutinario. OAuth hosted y el host remoto deben superar su gate antes de activación.

## Evidencia

Pruebas puras en `context.test.ts`; transacciones y OAuth nativo reales en `persistence.local.test.ts` con `PI_LOCAL_TEST=1` y guard exacto `127.0.0.1:55321`. Cubren dos tenants, CAS concurrente, doble receipt concurrente, rollback, dry-run/no-op, historia, precisión, inmutabilidad, imagen base, writer UI, scopes, expiración, revocación, RLS/ACL y cascada. El SDK HTTP opera con persistencia real. `pi-oauth-ui-local.ts` comprueba discovery y lectura contra la ruta Next compilada, junto con consentimiento y revocación.
