# Cómo se usa

Sección `df-usage-steps`. Metafield `dropflex.usage_steps`; contrato en `content.ts`.

Activada por defecto. Sin contenido muestra un estado vacío visible. La elección de variantes conserva el contenido e imágenes de cada ángulo. Nunca presenta datos de ejemplo en la tienda.

* Una idea principal por sección, textos cortos y concretos para móvil.

El contenido no requiere evidencia ni aprobación de hechos. `fact_id` es procedencia opcional. Las imágenes de referencia y las generadas pueden ocupar sus destinos.

## Infografía de instrucciones

Cuando una imagen ya contiene todas las instrucciones, guarda `display_mode: "image_only"` e `image_alt` (8–500 caracteres de texto plano que transmitan los pasos). Asigna el archivo a `steps`, posición 1, en su variante. Solo se imprime esa imagen, abierta, a todo el ancho disponible y sin recortar: no hay título, números, tarjetas ni textos externos.

En este modo, `heading` y `steps` son opcionales. Se conservan si ya existen, igual que las imágenes adicionales, variantes, descartes, orden y visibilidad. Sin `display_mode`, o con `steps`, sigue el formato anterior: título y 2–5 pasos, con fotos opcionales. El modo Solo imagen requiere un archivo elegido y disponible; sin él, preview y tema muestran el estado vacío y la preparación de publicación informa el requisito. Cambiar el modo no genera imágenes ni publica. MCP, editor, reporte, página efectiva, preview y payload Shopify comparten este contrato; no necesita migración porque utiliza el contenido JSON y el destino existentes.
