# review-slider — Carrusel de reseñas

## Contenido editable vigente

El MCP permite redactar contenido propio sin reseñas importadas ni pruebas reales. Los campos de `content.ts` son la fuente de verdad vigente; `review_id` y los resúmenes importados son referencias opcionales. El texto propio se guarda en el componente y no cambia las reseñas importadas.

Cada item admite `body`, `name` y `rating` opcional, o `review_id` para reutilizar una reseña. Se muestra desde un item, sin mínimo de reseñas externas ni fotos obligatorias.

`excerpt` también permite escribir directamente el texto corto del carrusel.

## Compatibilidad con reseñas importadas

Una reseña de comprador a la vez, justo después del botón y de la disponibilidad.
Diseño mínimo: avatar circular con foto real o inicial, texto en cursiva, autor anonimizado
 y estrellas. Sin país, plataforma de origen ni marcas de compra verificada.

Lee los items elegidos en el contenido vigente de `review-slider`. Cada `review_id` recupera la reseña publicada desde `dropflex.reviews` y las fotos desde `dropflex.reviews_images`. Tener reseñas disponibles o una cantidad agregada no las asigna al carrusel: se guardan sus IDs con `save_landing_content`, conservando el orden elegido. No filtra por calificación ni exige fotos; conserva los ajustes históricos del schema.

Se navega deslizando o tocando dots circulares de 8 px, uno por reseña, con botones compactos de 24 × 44 px y `aria-current`. No muestra flechas, contador ni pausa y no avanza automáticamente. El ajuste histórico de autoplay se conserva por compatibilidad, sin activar rotación. Solo aparece un carrusel: `df-review-state.js` coloca el bloque
existente en el espacio fijo de `buy-buttons`; si el editor lo quitó, usa su respaldo.

El total y la nota usan la fuente editable común `review-stars`, publicada en `review_summary`. No exige importación ni verificación.
`df:reviews:<product id>` guarda las cifras editables compartidas y el orden aleatorio en localStorage.
El orden conserva las reseñas conocidas, añade nuevas y elimina las retiradas. Sin storage
funciona con memoria de la página. Sin items disponibles, el bloque conserva el mensaje «Todavía no hay reseñas en este carrusel.»; describe este componente y no afirma que el producto carezca de reseñas.

La IA guarda los items y extractos actuales; las decisiones de orden y visibilidad se conservan.
