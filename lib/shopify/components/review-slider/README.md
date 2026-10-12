# review-slider — Carrusel de reseñas

## Contenido editable vigente

El MCP permite redactar contenido propio sin reseñas importadas ni pruebas reales. Los campos de `content.ts` son la fuente de verdad vigente; `review_id` y los resúmenes importados son referencias opcionales. El texto propio se guarda en el componente y no cambia las reseñas importadas.

Cada item admite `body`, `name` y `rating` opcional, o `review_id` para reutilizar una reseña. Se muestra desde un item, sin mínimo de reseñas externas ni fotos obligatorias.

`excerpt` también permite escribir directamente el texto corto del carrusel.

## Compatibilidad con reseñas importadas

Una reseña de comprador a la vez, justo después del botón y de la disponibilidad.
Diseño mínimo: avatar circular con foto real o inicial, texto en cursiva, autor anonimizado
 y estrellas. Sin país, plataforma de origen ni marcas de compra verificada.

Lee todas las reseñas publicadas desde `dropflex.reviews` y las fotos desde
`dropflex.reviews_images`. Ya no filtra por calificación, foto, mínimo de 3, selección de IA
ni `max_items`. Conserva los ajustes históricos en el schema para no romper templates guardados.
Los loops se dividen en grupos de 50 para recorrer también colecciones grandes en Liquid.

Rota cada 5 segundos por defecto (ajustable), con anterior, siguiente, indicador de posición
 y pausa. Se detiene al interactuar, con el foco, al salir de pantalla, al ocultar la pestaña
 y con movimiento reducido. Solo aparece un carrusel: `df-review-state.js` coloca el bloque
existente en el espacio fijo de `buy-buttons`; si el editor lo quitó, usa su respaldo.

El total y la nota son los mismos de `review_summary` en todos los bloques del producto.
`df:reviews:<product id>` guarda esas cifras reales y el orden aleatorio en localStorage.
El orden conserva las reseñas conocidas, añade nuevas y elimina las retiradas. Sin storage
funciona con memoria de la página. Sin reseñas, el bloque conserva un mensaje visible.

La IA puede seguir leyendo el contrato histórico, pero el carrusel usa el texto aprobado completo,
no extractos ni una selección editorial. No se puede apagar desde DropFlex ni por experiencias.
