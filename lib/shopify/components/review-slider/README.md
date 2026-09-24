# review-slider — Carrusel de reseñas

Bloque de la columna del producto: una reseña real a la vez (foto, nombre enmascarado, estrellas y extracto) que rota sola, con el origen de las reseñas siempre visible. Archivo: `blocks/df-review-slider.liquid` + `assets/df-review-slider.js` (sobre `<df-slider>` de `_shared`). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Justo bajo el botón de compra. El comprador ya vio precio y botón; si duda, lo primero que encuentra es la voz de otro comprador. Ocupa poco alto (≈ 90 px por tarjeta) para no empujar el resto de la columna.

## Anatomía

- **Título** opcional (18 px, fuente de títulos del tema).
- **Tarjeta** (1 visible, borde fino, radio del tema, 14 px de relleno), en fila:
  1. Avatar cuadrado 50 px (62 px en escritorio): la primera foto de la reseña; sin foto, la inicial sobre el acento suave. Solo en el estilo «Con foto y flechas».
  2. Nombre enmascarado (semibold) + estrellas de 14 px con relleno parcial + país.
  3. Extracto de 13–14 px, recortado a 2 líneas (ajustable de 1 a 4).
  4. Si el extracto no es textual: «Resumida · ver completa» o «Traducida · ver completa», que despliega el texto completo. Fecha opcional.
- **Controles** (44 px): estilo «Con foto» → flechas; estilo «Compacto» → puntos. Con autoplay, un botón de pausa entre ellos.
- **Origen** en 12 px bajo el carrusel: «Reseñas de compradores del mismo producto en AliExpress».

| Estilo | Avatar | Navegación | Relleno lateral |
|---|---|---|---|
| `photo` | sí | flechas | 14 px |
| `compact` | no | puntos | 20 px |

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.review_slider` (IA) | `heading?` y `items[]`: `review_id`, `excerpt`, `excerpt_mode` (`verbatim` · `condensed` · `translated`) |
| `product.metafields.dropflex.reviews` (real) | autor enmascarado, calificación, texto, fecha, país, `image_from`/`image_count` de cada reseña aprobada |
| `product.metafields.dropflex.reviews_images` (real) | fotos de las reseñas; la primera de cada una es el avatar |
| `product.metafields.dropflex.review_summary` (real) | `count` (para el mínimo y `{count}`), `rating` (`{rating}`), `source_label` |
| Ajustes del bloque | título y origen de respaldo; mínimo de reseñas, cantidad, calificación mínima y «solo con foto» (para la selección sin metafield); ancla; estilo, autoplay, tiempo, líneas, país, fecha, márgenes |

Sin metafield, el bloque toma las primeras reseñas aprobadas con la calificación mínima (4 por defecto) y muestra su texto completo recortado. El editor nunca escribe reseñas.

## Comportamiento

- La tienda une cada `review_id` con `dropflex.reviews`; si la reseña ya no existe (despublicada), el ítem se omite. Nunca un extracto huérfano.
- Menos reseñas que el mínimo (3 por defecto) o ninguna válida: no se dibuja nada. Con una sola: tarjeta fija, sin controles ni autoplay.
- Carrusel `<df-slider>`: scroll-snap nativo (arrastre, inercia y teclado del navegador), en bucle. Autoplay cada 5 s que se pausa con puntero encima, foco dentro, pestaña oculta, fuera de pantalla y siempre con `prefers-reduced-motion`.
- Botón de pausa visible (WCAG 2.2.2). La primera interacción (arrastrar, flecha, punto, «ver completa») detiene la rotación para siempre; el botón la reanuda.
- `role="region"` + `aria-roledescription="carrusel"`; cada tarjeta es un grupo «1 de 5». Estrellas con texto oculto «4 de 5 estrellas».
- El bloque lleva `id="resenas"` (ajustable): las estrellas (`review-stars`) llevan aquí.
- Avatar con `image_url` recortado a 124 px (2x) y `loading="lazy"`. Sin JSON-LD `Review` (evita duplicar el del widget principal).

## Psicología de venta

- **Objeción:** «¿y si no es como en las fotos, llega mal o es de mala calidad?», justo con el dedo sobre el botón. En pago contra entrega: «¿vale la pena comprometerme a recibirlo y pagarlo?».
- **Prueba social de pares** en primera persona, más creíble que la voz de la marca.
- **Especificidad y autenticidad:** nombre, estrellas, un detalle concreto y la foto real del producto recibido.
- **Rotación:** varias voces en poco espacio, sin esfuerzo del comprador.
- **Imperfección creíble:** una de 4 estrellas entre las de 5 hace creíble el conjunto.

La referencia mostraba testimonios tecleados en el editor, con fotos de stock y textos genéricos que servían para cualquier producto. Aquí solo existen reseñas aprobadas, con su origen a la vista.

## Reglas del copy (IA)

- La IA **elige** reseñas por id y **extrae**: la oración más específica, con las palabras del autor, 50–90 caracteres (máx. 110), primera persona; al traducir, tuteo neutro.
- `excerpt_mode` honesto: la tienda rotula lo resumido o traducido y muestra el completo.
- De 2 a 8 ítems; prioriza las que responden objeciones (calidad, talla, plazo, uso) e incluye al menos una de 4 estrellas si existe.
- `heading` opcional, ≤ 48 caracteres, cifras solo como `{count}` o `{rating}`.
- **Prohibido:** inventar o «humanizar» reseñas, autores o calificaciones; agregar resultados o adjetivos que el autor no dijo; elegir reseñas con promesas de salud; llamarlas «clientes de la tienda» (Ley 19.496 arts. 28 y 33; FTC 16 CFR 465).
