# gif-strip — GIFs del producto funcionando

Bloque de la columna del producto: animaciones cortas del producto en uso, cada una con una línea **arriba** (qué mirar) y otra **abajo** (lo que se vio convertido en promesa). Archivo: `blocks/df-gif-strip.liquid`. Contrato: [`content.ts`](content.ts). Viene de dropflex v1 (`docs/specs/landing-gifs.md` allá), con dos cambios: los textos se escriben en la **misma llamada** de la página y la lista usa íconos del tema en vez de emojis.

## Dónde va y por qué

Bajo el botón, después de la doble tarjeta y antes de las reseñas. Responde «¿de verdad hace eso?» con el comprador todavía mirando el precio y el botón, que es cuando se hace la pregunta; a media página la prueba llega tarde. No compite con los videos UGC: el video es una persona usándolo; el GIF es el mecanismo funcionando.

## Anatomía

- **Título del bloque** opcional (ajuste del editor), apagado por defecto: tres niveles de texto sobre un clip lo vuelven folleto.
- Una **fila por GIF**, a todo el ancho de la columna: línea en la tipografía de títulos, el GIF con radio (12 px por defecto) y debajo un párrafo o una lista de 2 a 4 líneas con ícono en el color de acento.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.gif_strip` (IA) | `gifs[5]`: `{ heading, text? \| bullets?: [{ icon, text }] }` (un párrafo o una lista bajo cada GIF), el más fuerte primero |
| `product.metafields.dropflex.gif_strip_media` (real) | los GIF que sube el comerciante en **Imágenes › GIFs**, en su orden, como WebP animado (Shopify Files) |
| Ajustes del bloque | título opcional, radio, márgenes |

**El GIF N lleva el texto N.** La IA escribe siempre 5 textos; el comerciante sube de 1 a 5 GIF y se muestran tantos como GIF haya: con 3, los 3 primeros textos. Por eso el prompt pide el más fuerte primero. La IA no ve los GIF (se escriben antes o al mismo tiempo): si un texto no calza con su GIF, se reordenan los GIF en Imágenes o se edita el texto en la Página del producto.

## Comportamiento

- El `src` va **sin `width`**: toda variante que Shopify transforma se re-codifica y una animación re-codificada conserva un solo cuadro. El `width`/`height` intrínseco va en la etiqueta para reservar el espacio.
- `loading="lazy"` y `decoding="async"`: el bloque está bajo el pliegue.
- Sin GIF, no se dibuja nada (aviso en el editor). Un texto vacío no se dibuja (ni párrafo en blanco ni espacio reservado).
- Todo texto se imprime con `escape`; la lista es estructura (`icon`, `text`), nunca HTML del modelo.

## Psicología de venta

- **Demostración:** el mecanismo funcionando convence más que una foto fija.
- **Atención:** el movimiento detiene el scroll; el título dice qué mirar.
- **Reconocimiento:** un título que nombra una conducta («¿Te agarras de la pared al entrar a la ducha?») hace que el lector se vea en la escena; uno que nombra un diagnóstico («¿Sufres de inestabilidad?») lo aleja.

## Reglas del copy (IA)

- 5 textos, cada uno un momento distinto (el problema en acción, el uso, el resultado, un detalle, la facilidad), del más fuerte al más débil.
- Título ≤ 70: una conducta cotidiana en pregunta o una afirmación que responde 2 o 3 dudas. Nunca abre con el nombre del producto.
- Cuerpo: alterna párrafo (≤ 160, qué hace + resultado visible) y lista (2 a 4 líneas de ≤ 40, un ícono distinto por línea, beneficio antes que mecanismo).
- **Prohibido:** promesas de salud, precios u ofertas, datos que no están en la ficha, presentar el GIF como de un cliente.
