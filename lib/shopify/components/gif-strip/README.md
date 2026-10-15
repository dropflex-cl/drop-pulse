# gif-strip — GIFs del producto funcionando

Bloque de la columna del producto: animaciones cortas del producto en uso, cada una con una línea **arriba** (qué mirar) y otra **abajo** (lo que se vio convertido en promesa). Archivo: `blocks/df-gif-strip.liquid`. Contrato: [`content.ts`](content.ts). Viene de dropflex v1 (`docs/specs/landing-gifs.md` allá), con dos cambios: los textos se escriben en la **misma llamada** de la página y la lista usa íconos del tema en vez de emojis.

## Dónde va y por qué

Bajo el botón, después de la doble tarjeta y antes de las reseñas. Responde «¿de verdad hace eso?» con el comprador todavía mirando el precio y el botón, que es cuando se hace la pregunta; a media página la prueba llega tarde. No compite con los videos UGC: el video es una persona usándolo; el GIF es el mecanismo funcionando.

## Anatomía

- **Título del bloque** opcional (ajuste del editor), apagado por defecto: tres niveles de texto sobre un clip lo vuelven folleto.
- **Todas las demostraciones expuestas**, una debajo de otra: encabezado «El producto en acción», tarjeta con número y título sobre el acento suave, marco cuadrado sin recortes y párrafo o lista debajo. Cada tarjeta aparece al recorrer la página, sin pestañas ni controles de navegación. Especificación visual: [`design-system/gif-demonstrations.md`](../../../../design-system/gif-demonstrations.md).

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.gif_strip` (IA) | `gifs[5]`: `{ heading, text? \| bullets?: [{ icon, text }] }` (un párrafo o una lista bajo cada GIF), el más fuerte primero |
| `product.metafields.dropflex.gif_strip_media` (real) | los GIF que sube el comerciante en **Página › GIFs**, en su orden, como WebP animado (Shopify Files) |
| Ajustes del bloque | título opcional, radio, márgenes |

**El GIF N lleva el texto N.** La IA escribe siempre 5 textos; el comerciante sube de 1 a 5 GIF y se muestran tantos como GIF haya: con 3, los 3 primeros textos. Por eso el prompt pide el más fuerte primero. Si un texto no calza con su GIF, se reordenan los GIF o se edita el texto en Página. El contrato de datos, el MCP y la skill conservan los mismos cinco textos y medios elegidos; este layout no necesita campos ni generaciones nuevos.

## Comportamiento

- El `src` va **sin `width`**: toda variante que Shopify transforma se re-codifica y una animación re-codificada conserva un solo cuadro. El `width`/`height` intrínseco va en la etiqueta para reservar el espacio.
- `loading="lazy"` y `decoding="async"`: el bloque está bajo el pliegue. `df-gif-strip.js` reproduce continuamente todos los GIFs visibles y lo reanuda al volver al bloque, a la pieza o a la pestaña; no hay corte de cinco segundos. «Pausar» / «Reproducir» conservan el control del comprador. Con movimiento reducido comienza congelado. Un canvas conserva el cuadro fuera de vista sin transformar la URL ni crear otro archivo.
- Marco, imagen y canvas usan `--df-radius-media`, compartido con el resto de las imágenes de la página. La caja de la imagen conserva su proporción, de modo que las esquinas de los GIFs verticales también se redondean.
- Publicar contenido efectivo con GIFs seleccionados habilita su bloque en la plantilla JSON aplicada, conservando sus ajustes y el resto de la composición. Ocultarlo en DropFlex permanece como decisión por producto en `conversion_supports`. Guardar/subir no cambia el tema. Una sección padre oculta o plantilla incompatible devuelve un impedimento concreto; no se declara éxito con los GIFs invisibles.
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
