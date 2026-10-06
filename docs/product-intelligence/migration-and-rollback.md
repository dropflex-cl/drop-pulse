# Transición, deprecación y rollback

Plan vigente según [ADR 006](adrs/006-chat-first-optimization.md). Sustituye el backfill semántico y las proyecciones a fichas/avatares/rankings de la propuesta anterior. **No se ejecutaron migraciones, deprecación de código ni escrituras en producción.** La migración de grants OAuth sí se aplicó y comprobó en Supabase local; ver [ADR 008](adrs/008-supabase-oauth-isolation.md) y [rollback OAuth](oauth-runbook.md#rollback-operativo).

Las migraciones de contexto y conocimiento también están aplicadas y probadas solo en local. Conocimiento agrega grafo/estrategia/cursores; no incluye jobs ni retirada del pipeline. [ADR 010](adrs/010-persistent-knowledge-and-strategy.md). Antes de desplegar código, aplicar OAuth/contexto/conocimiento: Precio y packs de UI depende de la RPC aun con MCP apagado. Para rollback, restaurar el writer y contrato UI de precio anteriores antes de retirar funciones/triggers. Mantener tablas/historia; no usar un reset ni borrar precios para revertir código. [ADR 009](adrs/009-persistent-product-context.md).

## 1. Qué entra al sistema nuevo

Catálogo, dueños, conexiones, mercado, políticas, pricing guardado, referencias/assets, componentes/UGC existentes, publicaciones, medios/campañas/métricas Meta y costes se conservan con sus IDs. No reinicializar ni cambiar precios/publicaciones/configuración de campañas por crear el agregado MCP.

Análisis anterior no se importa: product_data/fichas, avatares, rankings/desarrollos, informes/extracciones, diferenciador/hipótesis y hooks generados quedan fuera del nuevo contexto. No pi_legacy_links, no candidatos bootstrap ni job IA de completar. La revisión 0 representa ausencia de conocimiento nuevo; el primer setup/guardado explícito produce la primera revisión. Los datos operativos retenidos se incluyen con procedencia/fecha, sin tratar su coexistencia como una nueva selección de marketing.

[Producción readonly](production-validation.md) ya comprobó ocho productos, 52 tablas, 36 versiones de migración, formatos y metadatos Storage. Un solo dueño no verifica aislamiento. No hace falta exportar payloads productivos: recrear fixtures sintéticas de dos tenants, contextos nuevos, precios válidos/incompletos y piezas/campañas antiguas conservadas. Probar PostgreSQL, grants/RLS y recuperación en entorno aislado.

## 2. Gates de implementación

| Gate | Entrega | Comprobación antes de avanzar |
|---|---|---|
| A — Contrato | Schemas de conocimiento, setup, GenerationContext y jobs; política de coste; spike OAuth/SDK/host | Inputs/outputs tipados; pricing reutiliza fórmulas actuales; contenido incompleto devuelve faltantes sin IA; host autentica y descubre tools. |
| B — Persistencia | Tablas aditivas, RPCs, FKs compuestas, CAS, receipts, revisiones/audit, outbox y requests de generación | Dos tenants, conflicto entre chats, replay concurrente, rollback total, revocación y cascadas; ninguna table nueva duplica catálogo/pricing/assets/Meta. |
| C — Consumidores | Loaders directos de landing, UGC, imágenes y Meta; provenance en runs/medios | Ningún job nuevo lee/latest el análisis antiguo ni escribe proyecciones legacy; inputs congelados; stages no dependen de allApproved legacy. |
| D — Retirada | Acciones/UI/endpoints de análisis anterior desactivados, paths de generación revisados, runbook | No nuevas llamadas product_data/strategy/ángulos/hooks; UI conserva calculadora, revisión de piezas y publicación; Meta sigue operativo. |
| E — Piloto | Contexto nuevo desde chat y dos salidas revisables, prueba de coste/replay | Guardar no genera ni cobra; UGC/landing se inician expresamente; no doble cargo interno por replay; piezas llevan revisión exacta. |

Las migraciones solo se preparan después del contrato y se prueban aisladas. Antes del piloto, repetir los diagnósticos readonly pertinentes porque producción puede cambiar. Indexar/agregar constraints con estimación de locks; no corregir filas ni borrar assets silenciosamente.

## 3. Retirar dependencias en el orden correcto

1. Implementar dominio/contratos y nuevos loaders detrás de flags de despliegue. La UI operacional puede seguir mostrando piezas existentes; MCP de escritura/generación permanece deshabilitado hasta que sus garantías estén verificadas.
2. Reusar PricingSection y calculadora, integrando el guardado del plan/stamp con revisión del contexto. Conservar defaults/supuestos y las etiquetas ya aprobadas como configuración comercial; retirar generación de etiquetas ligada al cliente ideal. Etiquetas nuevas vienen del chat y se revisan en el componente actual.
3. Adaptar loadContext/runCopy y startScript/runScript a GenerationContext inmutable. Reusar writers/validadores/render existentes sin consultar UUIDs de ficha/avatar/brief viejo. Imágenes/creativos vinculados a estas salidas consumen el mismo snapshot; brief creativo viene del chat, no de una evaluación autónoma anterior.
4. Adaptar adsContext, hooks, stamps y relación de medios a ángulos canónicos. Conservar IDs de campaña/adset/ad, launch, reglas/engine, budgets, sync y métricas. Las piezas antiguas sin angle_id canónico mantienen metadata operativa; no reatribuirlas por slot/título/fecha.
5. Cambiar loaders `lib/data`, estados de Hoy/lista y navegación. Contexto/precios incompletos producen un motivo claro; no exigir aprobación de avatar/ranking ni dos ángulos para un UGC. Rutas antiguas de optimización redirigen a contexto o devuelven error de deprecación cuando corresponda; las rutas operativas Meta/Shopify se conservan.
6. Desactivar creación/confirmación de análisis anterior y las acciones equivalentes en UI. No borrar tablas todavía: primero probar que no quedan consumidores nuevos ni jobs en vuelo que dependan de ellas.

No se hace dual write a conocimiento viejo y nuevo. Las escrituras UI de setup/precio/assets o revisión de piezas siguen sus reglas; las del análisis/estrategia ocurren por MCP. Un callback tardío guarda su salida histórica asociada al input original y no reemplaza selección/output más reciente. El piloto requiere cierre controlado o aislamiento explícito de jobs legacy pendientes; no cortar ni reiniciar jobs de Meta como parte de la retirada de análisis.

## 4. Rollback

| Momento | Acción | Preservación |
|---|---|---|
| Flags apagadas / tablas aditivas | Revertir handlers/loaders nuevos | Datos y operación anteriores permanecen; no DROP en rollback operativo. |
| Contexto nuevo, sin ejecución | Deshabilitar MCP writes si hay fallo; mantener reads y UI operacional | Conservar todas las revisiones aceptadas; no convertirlas a avatar/ficha ni volver a ejecutarlas en mega prompt. |
| Generación nueva aceptada | Suspender nuevos pedidos, conciliar jobs/provider_request_id y aplicar forward fix | Outputs/snapshots/receipts se preservan; no reintentar a ciegas una operación pagada ambigua. |
| Publicación/campaña externa | Usar operaciones existentes y revisión del comerciante para restauración específica | Revertir DB/código no revierte Shopify, gasto ni campañas Meta. No launch/publicación automática por rollback. |

Si un rollback de deploy necesita loaders anteriores, las piezas viejas pueden seguir siendo visibles, pero no usar sus análisis como sustituto del contexto nuevo. No bajar revisiones, limpiar receipts ni reactivar automáticamente agentes de análisis. Backup restaurado requiere conciliar solicitudes aceptadas y jobs posteriores al punto de recuperación.

Cleanup físico del análisis deprecado es una tarea posterior: comprobar FKs de piezas/campañas/jobs y columnas legacy aún necesarias, definir retención/export autorizado si se requiere, y solo entonces preparar eliminación. Los datos de Meta y los assets/PDP/UGC conservados no son candidatos a limpieza del análisis.

El borrado de producto por Shopify mantiene su obligación completa: pausa Meta, Storage primero, después cascadas de todas las tablas nuevas, revisiones, receipts, solicitudes, outbox y contextos. Serializar eliminación y escritura para que no se creen hijos durante limpieza de Storage; probar reintento tras fallo sin modificar el orden requerido.

## 5. Medir la transición

Medir request_id/actor/tool/revisión/operation_id, conflictos, replays, missing_fields, p50/p95, bytes y outbox. Por generación: llamadas por paso, tokens/coste registrados, proveedor visual, intentos y resultados parciales. No registrar tokens de auth ni payloads completos.

Comparar cargas equivalentes antes/después: guardar contexto no llama IA, seleccionar no genera, y una generación solo ejecuta pasos solicitados. El presupuesto limita tokens/reintentos y permite estimar gasto; no anunciar un tope externo exacto sin soporte del proveedor. SLO de tools: 15 s máximo para crear/leer requests y p95 propuesto <2 s en operaciones habituales; los workers de generación se miden aparte.

Expandir piloto por cohortes solo tras regresión de calculadora, revisión/publicación, media/campañas/engine Meta y recuperación de contexto desde un chat nuevo. El volumen actual sirve como evidencia de formatos, no prueba escala.

## Migración UGC 20261108000000

Extiende guiones/tomas/medios, conserva versiones por ejecución y agrega pi_ugc_operations. Instalación completa validada en transacción local con rollback, sin reset. Posteriormente aplicada y verificada en producción el 2026-10-06, después del push del commit funcional: [registro](production-ugc-migration-2026-10-06.md). Verificar despliegue app/cron y actualizar tema Shopify. Rollback funcional conserva tablas, historia y lectores/revisión compatibles, desactiva nuevas generaciones y concilia trabajos externos. [Detalle](ugc-chat-mcp.md#despliegue-y-rollback).

## Entrega de cierre: migraciones 09–17

Nueve migraciones aditivas, aplicadas solo localmente en esta entrega: contenido, aprendizaje, revisión del consejo, guards de render, operaciones de galería, claim/snapshot, procedencia estática, referencias de aprendizaje y preflight de despacho. Aplicarlas en orden antes de los nuevos loaders. No hay backfill ni borrado de datos históricos. [Runbook y rollback seguro](chat-content-and-learning.md#despliegue-y-rollback).

El rollback operacional conserva esquema/assets, deshabilita MCP/cron nuevos y concilia lo ya enviado; no reactiva la redacción pagada. Las versiones anteriores de despliegue/migraciones productivas documentadas arriba no incluyen esta entrega.
