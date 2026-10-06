# Casos de aceptación y cobertura de dominio

Actualización 2026-10-06: dominio/contratos y OAuth tienen pruebas locales. `persistence.local.test.ts` ejecuta transacciones reales de contexto/precio: CAS concurrente, replay concurrente, rollback, dry-run/no-op, historia, scopes/expiración/revocación, RLS y cascada. `knowledge.local.test.ts` agrega commit de grafo/estrategia, puentes/FKs, metadata/replay verify, restricciones actuales sobre historia, cursores y selección/archivo. No valida todavía workers. [Estado](../implementation-status.md).

Los siguientes son escenarios de aceptación. Los de contexto/precio, autorización y protocolo local tienen cobertura indicada arriba; los de generación conservan sus gates de integración; host remoto sigue sin verificar. No se usan créditos productivos para cerrar estos casos.

| Escenario | Preparación | Resultado requerido |
|---|---|---|
| Grafo nuevo | analysis-four-personas del ejemplo, facts del mismo producto | IDs servidor y todas las refs locales resueltas, una revisión/commit. |
| Ref de otro dueño/producto | UUID válido pero recurso ajeno | NOT_FOUND/INVALID_REFERENCE sin filas, IDs ni contenido ajeno en details. |
| Persona cruzada | Angle persona A con pain/JTBD de B | INVALID_REFERENCE, rollback de todo el análisis/batch. |
| IDs/refs duplicados | Dos items con mismo client_ref o mismo ID | VALIDATION_ERROR determinista; no último gana. |
| Observed sin fuente | Forma válida, status observado y evidence vacío | VALIDATION_ERROR; no conocimiento «observado» sin respaldo. |
| Validated sin validación | Status validated sin validation_note | VALIDATION_ERROR; seleccionar no valida automáticamente. |
| Voz synthetic como reseña | customer_quote + synthetic, o observed sin source | VALIDATION_ERROR; original/traducción/edición preservados al resolver reseña. |
| Source ambigua/no autorizada | Ambas ubicaciones no null, ninguna, o internal_ref sin resolver | VALIDATION_ERROR/INVALID_REFERENCE; no fetch ni notas inventadas. |
| Aprobar con write normal | verify-authorized del ejemplo sin verify grant | FORBIDDEN, sin cambio de fact, revisión o recibo exitoso. |
| Cambiar evidencia revisada | Editar source/excerpt usado por fact aprobado con write normal | FORBIDDEN o aporte de nueva fuente independiente; no aprobación heredada sobre contenido cambiado. |
| Contradicción nueva | Agregar contradicts con write ordinario | Link conservado; uso dependiente bloqueado, snapshot histórico intacto. |
| Archivo de dependencia | Selección vigente apunta al pain/angle archivado | DEPENDENCY_IN_USE sin cambios; deseleccionar/sustituir primero. |
| Restore inconsistente | Restaurar ángulo cuya persona/JTBD permanece archivado | Rechazo salvo restauración válida en mismo batch. |
| Prioridades | Reprioritize incompleto, persona_id incorrecto, duplicate IDs | VALIDATION_ERROR; un set completo aplica prioridades contiguas. |
| Merge/null | Omitido, colección [], nullable null, relación [] | Conserva, conserva, limpia, sustituye relaciones; invariantes validan estado final. |
| Precio y defaults | Costo solo CLP vs moneda sin envío/CPA default; modo manual/recommended | Mismo servicio/calculadora UI/MCP; warnings de defaults o missing_fields; nunca derivados del chat. |
| Precisión de moneda | Minor fraccionario/out of safe integer o numeric incompatible | Rechazo antes de persistir; promedios/ganancias decimales no cambian precios cobrables. |
| Dos escritores | Dos comandos distintos expected_revision=N | Uno N+1, otro REVISION_CONFLICT; UI y MCP mismo writer. |
| Replay concurrente | Dos llamadas idénticas misma key | Un commit/recibo; mismo resultado/IDs; replay autoriza de nuevo. |
| Key con otro contenido | Mismo key diferente payload normalizado | IDEMPOTENCY_KEY_REUSED sin overwrite. |
| Dry-run/no-op | Preview select/generate; luego solicitud real | Preview no escribe ni consume key; no-op no incrementa; real vuelve a CAS. |
| Selección N | Select based_on=N, expected=N | analysis_revision N, selection_revision N+1; no stale por selección propia; nunca winner. |
| Oferta incompleta | Selección sin precio/oferta/política requerida | Selección posible con warning; generate devuelve EXECUTION_NOT_READY. |
| Historial/cursor | Editar entre páginas, cursor ajeno/expirado | Misma revisión/as_of en páginas; rechazo de cursor; históricas sin atribución unknown. |
| Claim revocado | Fact aprobado histórico prohibido hoy | Histórico intacto; restrictions/needs_review actuales; generación dependiente bloqueada. |
| Generar script sin video provider | Anthropic conectado, contexto válido, no Higgsfield | Solo redacción/planner previstos; render queda bloqueado hasta conectar su proveedor. |
| Etag editorial | Cambiar guion/aprobación/toma después de leer status | ARTIFACT_CONFLICT aun si knowledge revision no cambió. |
| Clips sin aprobación | shot_keys con keyframes pendientes/rechazadas | EXECUTION_NOT_READY; cero submit ni generación automática de base faltante. |
| Snapshot y precio cambia | Worker en vuelo y nuevo pricing/contexto | Input original, resultado stale/review; no pisa piezas aprobadas ni selección nueva. |
| Dedupe con key nueva | Trabajo equivalente activo, key diferente | GENERATION_IN_PROGRESS con operación autorizada; no segunda corrida. |
| Status puro | Operación running consultada repetidamente | Sin provider requests, expire/sync ni nuevos jobs/cargos; status_revision no aumenta por lectura. |
| Proveedor ambiguo | Submit timeout después de aceptación simulada | Reconciling/request_id; sin submit ciego; límite de garantía externa declarado. |
| QA operativo | Apagar image_qa mientras imagen está generándose | Respeta imageQaEnabled al finalizar y registra valor efectivo; no QA por snapshot viejo. |
| Regresión Meta/Shopify | Campañas/medios/PDP antiguos + salidas nuevas | IDs/configuración preservados; históricos unknown; nuevos con canonical provenance. |
| Borrado en carrera | Shopify elimina y worker intenta terminar | Pausa Meta, Storage primero, cascades; lease de borrado impide resurrección de fila/asset. |
| Protocolo/host | Cliente real autentica, descubre y llama diez tools | input/outputSchema válidos, structuredContent/isError correctos, scopes y revocación efectivos. |

Agregar inyección de fallos antes/después de commit, respuesta perdida, lease vencido y duplicación de dispatch. Diferenciar dedupe de operación interna del número de llamadas/retries cobrados por proveedor. Ningún test mock demuestra por sí solo exactamente un cobro real.
