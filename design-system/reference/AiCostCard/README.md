# AiCostCard

Costo de IA de un producto: total, equivalente en dólares, generaciones, tope, desglose por etapa y contexto.

- **Qué provees:** `total`, `totalUsd`, `generations`, `cap`, `stages` (`{ label, cost, runs, retries, note, tokens }`), `context`, `compact` (solo total y tope), `audience` (`merchant` | `admin`), `action`.
- **Por etapa, en barras de una sola tinta:** son cantidades, no categorías; no hace falta un color por etapa. Las etapas sin uso aparecen atenuadas con "Sin uso aún" o el motivo.
- **Reintentos a la vista:** "3 generaciones · 1 reintento", para que el costo de un error no se esconda.
- **Contexto en dinero del comerciante:** compara con la ganancia por venta ("Equivale al 4,5% de lo que ganas en una venta"). Solo si hay precio definido.
- **Tope:** barra y texto en `warning` desde el 80% ("quedan $210") y en `destructive` sobre el tope ("regenerar pide confirmación"). Nunca bloquea lo ya generado.
- `audience="admin"` suma tokens por etapa (Geist Mono) y quita el contexto; es solo para el equipo.
