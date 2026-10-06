# ADR 001 — Almacenamiento y ownership del conocimiento

Estado: propuesta ajustada por [ADR 006](006-chat-first-optimization.md). Fecha: 2026-10-06. Mantiene agregado relacional, identidad y evidencia; quedan sustituidas las decisiones legacy/shadow/backfill y proyecciones a análisis antiguo.

## Contexto

El catálogo tiene identidad estable en `products`; los análisis viven en JSON de fichas, avatares y corridas. Los slots de ranking no son IDs de ángulos comerciales, y las reseñas citadas pierden su referencia al copiarse a la ficha. Precios y assets ya tienen servicios y tablas. Evidencia: E01, E12–E19, E26–E30 en la [auditoría](../audit-current-model.md#7-registro-de-evidencia).

## Decisión

Conservar `products`, `user_id`, `product_pricing`, reseñas, componentes, creativos y buckets. Introducir el agregado `product_intelligence` y las entidades normalizadas `pi_*` del [mapping](../target-model-mapping.md), con IDs estables, relaciones, evidencia y estados explícitos. Ofertas son propuestas/snapshots de marketing; no reemplazan la calculadora ni cambian automáticamente los precios operativos.

Usar tablas relacionales para entidades y enlaces editables, y JSON tipado para snapshots completos, raw legacy, valores acotados y manifests. Una fuente prueba procedencia, no validez. Hecho verificado, permiso de uso, hipótesis validada y decisión seleccionada tienen estados separados. Una aprobación legacy no se importa como verificación.

Todas las relaciones nuevas llevan producto/dueño en FKs compuestas. El agregado canónico recibe análisis desde MCP y datos operativos/setup mediante servicios compartidos con la UI. No hay writer legacy paralelo ni backfill semántico. Un producto eliminado pierde también fuentes, snapshots, receipts y assets asociados; la inmutabilidad no anula esa obligación.

## Alternativas y consecuencias

- Un gran JSON editable del producto reduce tablas, pero dificulta FKs entre entidades, validación de pertenencia, cambios parciales y evidencia consultable. Se usa solo como snapshot reconstruible.
- Reutilizar strategy_runs como selección confunde generación con decisión; su writer y consumo de análisis se deprecan. Los generadores reciben contexto directo sin persistir proyecciones en customer_avatars/angle_briefs.
- Duplicar catálogo, precio, assets o un servicio IA añade fuentes de verdad incompatibles. No se adopta.

El coste es nuevo esquema y adaptación de loaders de ejecución; el beneficio es conocimiento persistente independiente del pipeline de IA anterior. No hay backfill de candidatos; un contexto incompleto se devuelve al chat para completar. Medir tamaño de snapshots y fanout de settings antes de ampliar; optimización delta es posterior si conserva reconstrucción exacta.
