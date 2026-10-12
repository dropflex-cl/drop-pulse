# stats-with-image — Hero y cifras

## Contenido editable vigente

El MCP permite redactar contenido propio sin reseñas importadas ni pruebas reales. Los campos de `content.ts` son la fuente de verdad vigente; `review_id` y los resúmenes importados son referencias opcionales. El texto propio se guarda en el componente y no cambia las reseñas importadas.

`testimonial` admite `body`, `name` y `rating` opcional. `stats[].value` permite escribir una cifra propia; `fact` reutiliza un dato operativo. `rating` y `count` son editables.

## Compatibilidad con reseñas importadas

Sección de dos columnas: un collage de 1 a 4 fotos y una columna de texto que arma un mini embudo completo (calificación → título → descripción → razones → cifras → testimonio → botón). Archivo: `sections/df-stats-with-image.liquid` + `snippets/df-stats-with-image-image.liquid` + `assets/df-stats-with-image.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Segunda pantalla de la landing, justo después del bloque de compra, para volver a vender con fotos de uso; o primera sección de un advertorial. Junta en un solo vistazo lo que el comprador frío necesita para seguir: cuántos lo valoran (valoración compartida), qué gana (título y descripción), pruebas rápidas (razones), alguien como él (testimonio editable) y un botón.

## Anatomía

- **Escritorio (≥ 990 px):** tarjeta de hasta 1 400 px con fondo suave y radio configurable; columnas 50/50 (el collage puede ir a la derecha).
- **Collage** según las fotos disponibles de verdad (nunca huecos): 1 = cuadrada; 2 = dos verticales 3:4; 3 = la primera vertical a la izquierda y dos cuadradas apiladas; 4 = grilla 2×2.
- **Columna de texto:** estrellas + línea de calificación sin mostrar plataforma de origen; `h2` con una parte destacada (`--df-accent-ink`); descripción con una negrita opcional; 3 razones con check; cifras opcionales (valor grande + etiqueta, con borde de acento); tarjeta de testimonio (inicial del autor, cita, estrellas, autor y país); botón con el acento del producto y flecha.
- **Móvil (375 px):** tarjeta a todo el ancho, collage arriba (o abajo, según el editor), texto debajo y botón a todo el ancho (máx. 400 px). Título con `clamp()`.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.stats_with_image` (IA) | `heading` (`**destacado**`), `description`, `bullets[]`, `cta_label`, `rating_label` (`{rating}`, `{count}`), `review_id?`, `stats?[]` (`fact` + `label`) |
| Ajustes de la sección | respaldo de todos los textos; fotos 1 a 4; cuántas fotos del producto; posición; ajuste histórico de mínimo (sin efecto); id de la reseña; 3 cifras escritas por el comerciante; enlace del botón; colores, radio y rellenos |
| `dropflex.review_summary` (compartido y editable) | `rating`, `count` → estrellas, `{rating}` (4,6), `{count}` (1.234) y las cifras `rating` / `review_count`; sin plataforma de origen |
| `dropflex.reviews` (compartido y editable) | la reseña aprobada con ese `id`, tal cual (recortada a 240 caracteres) |
| `shop.metafields.dropflex.policies` / `logistics` (compartido y editable) | cifras `return_days`, `warranty_months` y `delivery_days_max` |
| `dropflex.stats_with_image_images` (list.file_reference) | fotos del collage si el editor no tiene; si tampoco, las del producto |

Sin una nota guardada, la línea de estrellas se oculta. No requiere importación ni mínimos. Sin reseña con ese id, no hay testimonio. Una cifra sin dato se oculta. Sin título, la sección no se muestra (en el editor, un aviso).

## Comportamiento

- Sin carrusel ni autoplay. Movimiento (`df-motion.js`, [`docs/spec-movimiento-tienda.md`](../../../../docs/spec-movimiento-tienda.md)): las fotos entran creciendo apenas y el texto escalonado al desplazar; las cifras del metafield cuentan desde 0 una sola vez (900 ms, ancho fijo, la cifra animada `aria-hidden` y una copia oculta con el valor final para el lector). Las cifras escritas en el editor no cuentan. El botón se hunde al tocarlo y su flecha avanza con el puntero. Todo se apaga con `prefers-reduced-motion` y con «Animaciones de DropFlex».
- Fotos con `image_url` + `image_tag` (`widths` y `sizes` según el collage). Si la sección es de las dos primeras de la página (`section.index`), cargan de inmediato y la primera con `fetchpriority="high"`; si no, diferidas.
- Botón: un solo `<a>`. Con enlace propio, va ahí. Sin enlace, apunta a la ficha del producto y, en la ficha, `<df-buy-link>` desplaza hasta el formulario `/cart/add` de la página y le pasa el foco al botón de compra.
- Estrellas decorativas (`aria-hidden`) junto a su texto; el testimonio es `figure` + `blockquote` + `figcaption`.

## Psicología de venta

- **Objeción:** «¿esto funciona y otros ya lo compraron?», del comprador frío que llega desde un anuncio.
- **Prueba social cuantitativa arriba:** la calificación ancla la credibilidad antes de leer el título (primacía, efecto halo).
- **Prueba social cualitativa:** un testimonio real con nombre y estrellas genera identificación.
- **Escaneabilidad:** 3 razones con check en 3 segundos. **Simulación mental:** fotos de uso real.
- **AIDA en una pantalla:** atención (fotos y estrellas) → interés (título) → deseo (descripción, razones, testimonio) → acción (botón).


## Reglas del copy (IA)

Desarrolla contenido propio con los campos vigentes de `content.ts`. Importar reseñas, verificar hechos o disponer de fotos no es requisito de redacción ni de guardado. Los textos guardados se representan en Shopify y la vista previa con el mismo contrato. Las referencias a datos importados de este documento describen un respaldo opcional.

## Valoración compartida vigente

La nota y cantidad agregadas se editan en `review-stars` mediante `save_landing_content` y se publican en `review_summary`. No requieren datos de Google, reseñas importadas, mínimos, evidencia ni verificación. Los campos antiguos rating/count de Hero son respaldo compatible, no una segunda fuente cuando Estrellas aporta esos valores. Las notas individuales de testimonios son independientes.
