# ADR 002 — Revisiones, transacciones e idempotencia

Estado: propuesto, conservado y ajustado por [ADR 006](006-chat-first-optimization.md). Fecha: 2026-10-06. Las garantías siguientes corresponden a conocimiento/setup/selección; ejecución usa requests con snapshot y estado operacional propios.

## Contexto

`confirmStrategy` escribe varias tablas secuencialmente, puede repetirse y su compensación no elimina todos los cambios anteriores. `copy_runs` guarda huellas pero relee parte del contexto; publicar vuelve a preparar estado vivo. No hay revision CAS ni receipt común. E12, E21–E25 de la [auditoría](../audit-current-model.md#7-registro-de-evidencia).

## Decisión

Cada escritura efectiva de conocimiento se confirma mediante una RPC PostgreSQL restringida al servidor: autenticar y preparar comando en dominio; bloquear producto/head; consultar receipt; comparar revisión; resolver refs; validar grafo final; persistir entidades, snapshot, audit, receipt, selección y outbox en una transacción. No escribir proyecciones a fichas/avatares/rankings viejos. Fijar search_path, revocar ejecución pública/anon/authenticated y conceder solo a service_role. Los argumentos de principal vienen del servidor, no de la tool; la RPC verifica invariantes y scope sensible además de TypeScript.

La revisión creciente pertenece al agregado entero. Guardar snapshot completo por revisión inicialmente, con schema_version y hash canónico. Revisión 0 es vacía; no-op conserva revisión; dry_run no consume clave ni escribe. Las versiones de estrategia congelan contenido/dependencias; lifecycle se registra mediante eventos. La propia selección no hace stale al snapshot que acaba de elegir; divergencia de contenido y revocación de uso se reportan separadas.

Receipt unique por user/product/tool/key y payload canónico: igual key/hash devuelve el resultado original, incluso si revisión actual cambió; hash diferente rechaza. Retención inicial 30 días anunciada al cliente. Antes de cada replay se reautoriza principal/scope, incluida protección de producto eliminado. Canonical hash incluye schema, operación y contenido semántico, con normalización documentada de omitidos/orden; no elimina diferencia entre [] y null donde la semántica difiere.

Lecturas paginadas fijan revisión e incluyen cursor firmado ligado a actor/dueño/producto/include/view/filtros y vencimiento. PDP/assets/performance auxiliares se congelan en contexto de lectura de 15 minutos y llevan fecha; una lectura histórica sin snapshot de ejecución devuelve unknown, no atribución retrospectiva inventada.

## Consecuencias y validación

Transacciones cortas, sin red/IA/Storage bajo lock. Outbox entrega invalidaciones/trabajos con dedupe, lease y reintento; generación confirma request/input congelado/receipt antes del dispatch y no incrementa análisis por sus cambios de progreso. Settings globales bloquean agregados en orden determinista; medir antes del piloto. Borrado usa estado/lease respetado por escritores para cubrir el tiempo de Storage.

Se descarta una secuencia de llamadas Supabase con undo: no garantiza atomicidad ante concurrencia o caída. Se descarta idempotencia en memoria y un contador por tabla. Probar dos escritores N, dos receipts concurrentes, fallo antes/después de commit, batch inválido, snapshot histórico, cursor ajeno y eliminación. Ninguna de esas pruebas se considera aprobada por los 85 tests puros ejecutados durante la auditoría.
