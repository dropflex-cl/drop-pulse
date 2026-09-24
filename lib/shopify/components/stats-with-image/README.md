# stats-with-image — Hero y cifras

Sección de dos columnas: un collage de 1 a 4 fotos y una columna de texto que arma un mini embudo completo (calificación → título → descripción → razones → cifras → testimonio → botón). Archivo: `sections/df-stats-with-image.liquid` + `snippets/df-stats-with-image-image.liquid` + `assets/df-stats-with-image.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Segunda pantalla de la landing, justo después del bloque de compra, para volver a vender con fotos de uso; o primera sección de un advertorial. Junta en un solo vistazo lo que el comprador frío necesita para seguir: cuántos lo valoran (calificación real), qué gana (título y descripción), pruebas rápidas (razones), alguien como él (testimonio real) y un botón.

## Anatomía

- **Escritorio (≥ 990 px):** tarjeta de hasta 1 400 px con fondo suave y radio configurable; columnas 50/50 (el collage puede ir a la derecha).
- **Collage** según las fotos disponibles de verdad (nunca huecos): 1 = cuadrada; 2 = dos verticales 3:4; 3 = la primera vertical a la izquierda y dos cuadradas apiladas; 4 = grilla 2×2.
- **Columna de texto:** estrellas + línea de calificación y la fuente de las reseñas; `h2` con una parte destacada (`--df-accent-ink`); descripción con una negrita opcional; 3 razones con check; cifras opcionales (valor grande + etiqueta, con borde de acento); tarjeta de testimonio (inicial del autor, cita, estrellas, autor y país); botón con el acento del producto y flecha.
- **Móvil (375 px):** tarjeta a todo el ancho, collage arriba (o abajo, según el editor), texto debajo y botón a todo el ancho (máx. 400 px). Título con `clamp()`.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.stats_with_image` (IA) | `heading` (`**destacado**`), `description`, `bullets[]`, `cta_label`, `rating_label` (`{rating}`, `{count}`), `review_id?`, `stats?[]` (`fact` + `label`) |
| Ajustes de la sección | respaldo de todos los textos; fotos 1 a 4; cuántas fotos del producto; posición; mínimo de reseñas; id de la reseña; 3 cifras escritas por el comerciante; enlace del botón; colores, radio y rellenos |
| `dropflex.review_summary` (real) | `rating`, `count` → estrellas, `{rating}` (4,6), `{count}` (1.234) y las cifras `rating` / `review_count`; `source_label` siempre visible |
| `dropflex.reviews` (real) | la reseña aprobada con ese `id`, tal cual (recortada a 240 caracteres) |
| `shop.metafields.dropflex.policies` / `logistics` (real) | cifras `return_days`, `warranty_months` y `delivery_days_max` |
| `dropflex.stats_with_image_images` (list.file_reference) | fotos del collage si el editor no tiene; si tampoco, las del producto |

Sin calificación real (o bajo el mínimo), la línea no aparece: nunca «0 estrellas». Sin reseña con ese id, no hay testimonio. Una cifra sin dato se oculta. Sin título, la sección no se muestra (en el editor, un aviso).

## Comportamiento

- Estática: sin carrusel ni autoplay. La única animación es la flecha del botón al pasar el puntero (se apaga con `prefers-reduced-motion`).
- Fotos con `image_url` + `image_tag` (`widths` y `sizes` según el collage). Si la sección es de las dos primeras de la página (`section.index`), cargan de inmediato y la primera con `fetchpriority="high"`; si no, diferidas.
- Botón: un solo `<a>`. Con enlace propio, va ahí. Sin enlace, apunta a la ficha del producto y, en la ficha, `<df-buy-link>` desplaza hasta el formulario `/cart/add` de la página y le pasa el foco al botón de compra.
- Estrellas decorativas (`aria-hidden`) junto a su texto; el testimonio es `figure` + `blockquote` + `figcaption`.

## Psicología de venta

- **Objeción:** «¿esto funciona y otros ya lo compraron?», del comprador frío que llega desde un anuncio.
- **Prueba social cuantitativa arriba:** la calificación ancla la credibilidad antes de leer el título (primacía, efecto halo).
- **Prueba social cualitativa:** un testimonio real con nombre y estrellas genera identificación.
- **Escaneabilidad:** 3 razones con check en 3 segundos. **Simulación mental:** fotos de uso real.
- **AIDA en una pantalla:** atención (fotos y estrellas) → interés (título) → deseo (descripción, razones, testimonio) → acción (botón).

La referencia mezclaba reseñas con pedidos para inflar la base («10.000+ pedidos»), usaba «científicamente probado», anidaba un botón dentro de un enlace vacío y cargaba PNG de 1 MB sin `srcset`. Aquí la calificación sale de las reseñas reales y la IA no escribe ningún número.

## Reglas del copy (IA)

- **Título:** `[verbo de invitación o resultado] + [beneficio concreto] + **destacado**` (marca o palabra-beneficio), una sola parte destacada, ≤ 60 caracteres.
- **Descripción:** 80 a 220 caracteres; para quién + mecanismo real + resultado no médico; máximo una `**negrita**`; sin números.
- **Razones:** 3 (2 a 4), atributo verificable → beneficio, ≤ 48 caracteres, sin punto final.
- **Botón:** acción + bajo riesgo en pago contra entrega («Pídelo y paga al recibir», «Quiero el mío»), ≤ 24 caracteres.
- **Calificación:** solo plantilla con `{rating}` y `{count}`; «reseñas» u «opiniones», nunca «pedidos».
- **Testimonio y cifras:** la IA solo elige un `review_id` de la lista de aprobadas y un `fact` con su etiqueta; los valores los pone la tienda.
- **Prohibido:** «científicamente probado», «clínicamente», «recomendado por médicos», «cura», «elimina el dolor», garantías de resultado en X días, «el más vendido», cifras de clientes, presentarlo como dispositivo médico (Ley 19.496, arts. 28 y 33).
