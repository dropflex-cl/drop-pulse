# CopySummary

Resumen de lo aprobado por sección al terminar la revisión.

- **Qué provees:** `sections` (`{ title, items: [{ label, text, tag }] }`) con `tag` = `edited` (tu versión) | `kept` (descartado con original: se mantiene lo de Shopify) | `omitted` (no va en la página) | `missing` (obligatorio sin aprobar).
- Los obligatorios pendientes se marcan en `warning-soft` y bloquean "Continuar: Imágenes"; un `Notice` arriba dice cuál y cómo resolverlo.
