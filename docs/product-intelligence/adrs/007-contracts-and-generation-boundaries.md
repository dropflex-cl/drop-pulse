# ADR 007 — Contratos explícitos y fronteras de generación

Estado: contratos/dominio y SDK local implementados; persistencia/HTTP/workers pendientes, 2026-10-06. Concreta [ADR 006](006-chat-first-optimization.md), sin cambiar el spec original.

## Decisión

Publicar diez tools con entradas/salidas estrictas y versión 1.0. Las relaciones nuevas utilizan objetos Ref discriminados por id/client_ref; la persistencia devuelve UUIDs y un id_map. Conservar merge/upsert, archivo explícito, CAS del agregado, recibos de 30 días y separación facts/hipótesis/selección.

Setup recibe inputs monetarios en unidad menor y conserva la calculadora actual; modos recommended/manual hacen explícita la intención sobre venta/tachado. Oferta es recipe + enfoque/etiquetas propuestas, materializada en servidor. Promedios/ganancias/CPA analíticos se expresan como decimales de unidad mayor; no forzar sus fracciones a importes cobrables ni cambiar redondeo comercial.

Knowledge revision y estado del job son independientes. Script/keyframes/clips requieren llamadas separadas; continuidad usa script_id y artifact_etag para cubrir ediciones/revisión fuera del agregado. Landing separa content/images, y las imágenes reciben plans explícitos del chat. Retener writer/planner finales; no volver a generar investigación, buyer persona, estrategia o hooks como fallback.

Congelar GenerationContext y provenance antes del dispatch, sin latest legacy. Guards vivos de auth/borrado/claims/credenciales/costo y el switch QA vigente siguen aplicando. Status es lectura pura; recuperación/poll externo ocurre en worker. No exponer publicación/launch ni montaje hospedado inexistente como efecto de generate.

## Razón y consecuencias

`lib/pricing/plan.ts` ya centraliza el cálculo. `lib/pipeline/copy.ts` relee contexto legacy; `lib/pipeline/video.ts` usa slots/contexto antiguo, mezcla guard de video con guion y tiene etapas de revisión; las lecturas actuales hacen housekeeping. Los contratos propuestos permiten conservar producción y operación Meta sin convertir esas dependencias en el modelo nuevo.

Evitar request «genera todo» permite controlar gasto por etapa y revisar material antes de pagar clips. La autorización de generar es necesaria pero no reemplaza revisión de guion/keyframes. Transacciones internas no garantizan exactamente un cobro externo: solicitudes ambiguas se concilian antes de reintentar.

Schemas/fixtures se validan con Ajv 8 draft 2020-12 completo y pricing real; los contratos se generan desde Zod. El SDK oficial 1.32.0 tiene pruebas locales de discovery/llamadas/aislamiento; no certifican host/OAuth/DB. Snapshot incluye deseos y JTBD/dolores adicionales para cerrar referencias, con una persona por decisión V1. La siguiente fase conecta HTTP/auth y persistencia aislada, después workers/adaptadores. Detalles: [estado](../implementation-status.md), [contratos](../mcp-contracts.md), [contexto](../generation-context.md) y [matriz](../contracts/domain-cases.md).
