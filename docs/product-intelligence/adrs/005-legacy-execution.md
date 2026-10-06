# ADR 005 — Compatibilidad con generación y ejecución actuales

Estado: **sustituido por [ADR 006](006-chat-first-optimization.md)** el 2026-10-06. Se conserva como registro de la propuesta anterior; no aplicar backfill, conservar mega prompt ni crear proyecciones legacy descritas abajo.

## Contexto

El generador actual produce informe y cinco ángulos; el comerciante elige dos o tres. La confirmación proyecta ficha/avatar/briefs aprobados, y ejecución espera al menos dos desarrollos. No hay principal explícito ni vínculos JTBD/pain estructurados. Fuentes de competencia activas fueron retiradas. PDP y publicación consumen versiones parciales/vivas. E09–E25 de la [auditoría](../audit-current-model.md#7-registro-de-evidencia).

## Decisión

Conservar mega prompt, pricing y pipeline actual para productos legacy. Backfill importa material comprobable como origen y candidatos incompletos; no llama IA ni convierte una elección por índice en estrategia canónica válida. Slot 1 no representa intención de principal. Completar persona/JTBD/pain y elegir principal explícitamente antes de seleccionar una estrategia canónica.

Una selección V1 puede guardarse con un ángulo. Si ejecución legacy exige dos, devolver ready_for_execution=false con el motivo; no fabricar ángulos, aprobar claims ni publicar para satisfacer el pipeline. Oferta incompatible con precios/condiciones vigentes y claims prohibidos también bloquean uso. El conocimiento se puede guardar sin clave Anthropic; generación sigue usando clave del comerciante y guards existentes.

En canonical, proyecciones necesarias (`product_briefs`, `customer_avatars`, `angle_rankings/briefs`) se actualizan por el mismo servicio/transacción. Su aprobación de contenido no cambia la verificación de facts. Prompts reciben contexto corto construido desde información permitida, base primero, precio calculado y etiquetas aprobadas; no JSON completo ni strings con instrucciones de fuentes. Introducir provenance de estrategia/revisión al iniciar nuevos jobs; su finalización no puede sobrescribir una edición más reciente sin resolver conflicto.

Cambios de entrada hacen stale; revocación de un fact o uso hace needs_review. Historial queda intacto. Los consumers deben comprobar esas condiciones antes de nuevos trabajos y publicación. En V1 se reportan dependencias legacy identificables; sin vínculo histórico no se atribuyen piezas a una estrategia por cercanía temporal.

## Consecuencias

V1 no ofrece versionado completo ni rollback de Shopify: fases posteriores agregan PDPVersion, operación observable y snapshots de assets. Los purges actuales pueden eliminar binarios; diseñar retención de publicados antes de prometer reproducción. Meta purchases y la sugerencia de campaña CBO no prueban una estrategia ganadora ni ventas COD entregadas/cobradas. Winner/loser se introduce solo con experimentos, fuente, ventana y regla documentada.

El cambio de ownership es por producto, con gates y rollback que conserva datos aceptados; ver [plan](../migration-and-rollback.md). No mantener MCP editable junto a escritores UI legacy para el mismo producto.

Validación de 2026-10-06: [producción](../production-validation.md) confirma la coexistencia legacy y dos strategy_runs failed/timeout sin extracción. No hay éxito del mega prompt en la muestra actual. Las fixtures deben incluir landing v2, varias aprobaciones históricas y PDP publicada sin ranking confirmado actual. La auditoría readonly no reintenta ni modifica esos estados.
