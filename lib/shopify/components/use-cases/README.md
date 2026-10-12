# Elige cómo lo usarías

Sección `df-use-cases`. Metafield `dropflex.use_cases`; contrato en `content.ts`.

Activada por defecto. Sin contenido muestra un estado vacío visible. La elección de variantes conserva el contenido e imágenes de cada ángulo. Nunca presenta datos de ejemplo en la tienda.

* Una idea principal por sección, textos cortos y concretos para móvil.

El contenido no requiere evidencia ni aprobación de hechos. `fact_id` es procedencia opcional. Las imágenes de referencia y las generadas pueden ocupar sus destinos.

## Infografía con el mensaje completo

Si la imagen ya contiene los usos y sus explicaciones, guarda `display_mode: "image_only"` e `image_alt` (8–500 caracteres de texto plano con el mensaje de la imagen). Asigna el archivo existente a `cases`, posición 1, en la variante correspondiente. Solo se imprime esa imagen, abierta y sin recorte: no se duplica el heading, no hay acordeones, tarjetas, títulos ni descripciones externas. Requiere al menos una imagen disponible; sin ella muestra el estado vacío y la preparación de publicación informa el archivo faltante.

`heading` y `cases` se pueden omitir en este modo. Si ya existen, se conservan y no se renderizan. Las demás imágenes elegidas se conservan, aunque solo la primera es visible. El modo anterior (`accordion`, o sin `display_mode`) exige título y 2–5 usos y admite fotos opcionales. Cambiar el modo no genera archivos ni modifica selección, orden, variantes, descartes o visibilidad. Los contratos MCP, reporte, editor, preview y publicación comparten el requisito de imagen del modo vigente.
