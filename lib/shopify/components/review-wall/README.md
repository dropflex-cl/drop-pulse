# review-wall — Testimonios (publicaciones de Facebook)

Sección del cuerpo de la landing: un muro de reseñas reales dibujadas como publicaciones de Facebook. Portado de `snippets/dropflex-reviews.liquid` (kit flux de dropflex v1). Archivo: `sections/df-review-wall.liquid` + `assets/df-review-wall.js`. Contrato: [`content.ts`](content.ts). Vista previa: `components/store-preview/review-wall.tsx` (fórmulas en `lib/store-preview/review-wall.ts`, que el test compara con el Liquid).

## Por qué parece Facebook

Un comprador lee el pantallazo de una publicación como la palabra de otro comprador y una tarjeta de reseña como marketing de la tienda, aunque las palabras sean las mismas. Por eso la tarjeta copia la anatomía (avatar, nombre sobre la fecha con el globo, los tres puntos, el texto, las fotos de borde a borde, la fila de reacciones y la barra Me gusta · Comentar · Compartir) y usa la **paleta y la tipografía de Facebook** (tarjeta blanca, tinta `#050505`, gris `#65676b`, fuente del sistema), no las de la tienda: teñida como el resto de la página deja de leerse como publicación. Las estrellas de cada reseña no van en la tarjeta (Facebook no las tiene); el promedio real va sobre el muro.

## Qué cambió respecto de v1

| | v1 (`dropflex-reviews`) | v2 (`review-wall`) |
|---|---|---|
| Columnas en el teléfono | 1 (mucho scroll) | **2** (ajuste `columns_mobile`) |
| Cuántas se ven | todas | `initial_posts` (6) y el resto con «Ver más testimonios» |
| Texto | completo | recortado a `text_lines` (4) con «Ver más», como Facebook |
| Fotos | 1 en su proporción; 2 cuadradas | cuadro fijo (1:1 o 4:5) con 1, 2 o 3 fotos, para que las filas calcen |
| Selección | todas las aprobadas con foto | la IA elige y ordena de 4 a 12 aprobadas (primero con foto) |
| Nombres | el autor tal cual | al azar (nombre + inicial, fijo por reseña) o el autor, según el ajuste |
| Contadores | sorteados por visitante (localStorage) | fijos por producto y reseña, iguales para todos |
| Dónde | bloque de la columna o sección | sección |

En la tarjeta angosta (media pantalla de teléfono, bajo 260 px) todo se achica y la barra de acciones queda solo con íconos; los tamaños de v1 vuelven desde 260 px de tarjeta y las etiquetas desde 300 px (container queries sobre `.df-review-wall__post`, así funciona igual con cualquier número de columnas).

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.review_wall` (IA) | `heading` y `items[]` (`review_id`), en el orden del muro |
| `product.metafields.dropflex.reviews` (real) | texto completo, fecha (`YYYY-MM-DD`), `image_from`/`image_count` |
| `product.metafields.dropflex.reviews_images` (real) | las fotos (hasta 3 por publicación) |
| `product.metafields.dropflex.review_summary` (real) | promedio y cantidad sobre el muro; con menos de 30, la proporción de `df-review-proof` |
| Ajustes de la sección | título de respaldo, botón, mínimo de reseñas (4), publicaciones a la vista, nombres, calificación, fecha, reacciones, barra de acciones, columnas, líneas, fotos, fondo, rellenos |

**Sin `dropflex.review_wall` no se dibuja** (en el editor, un aviso). Es una excepción a «metafield → editor → nada»: el muro ocupa media página y usarlo lo decide el comerciante en DropFlex («Usar en la página»); si el tema lo mostrara solo con tener reseñas publicadas, aparecería en cada producto con reseñas.

## Lo que no es dato real

- **Nombres al azar** (`author_names: random`, por defecto): las reseñas importadas traen «Cliente», «Anónimo» o «M***a», que en una publicación se leen como un error. Un nombre de pila y una inicial, elegidos con la semilla `product.id % 9973` y la posición de la reseña: siempre el mismo para esa reseña. La lista (mujer u hombre) la decide el texto («encantada», «mi esposo» → mujer; «encantado», «mi esposa» → hombre); sin pistas, alterna. Con `original` se muestra el autor tal cual.
- **Reacciones y comentarios** (`show_engagement`): decorativos, 320–1.600 reacciones y 8–46 comentarios con la misma semilla. `aria-hidden`.
- **Barra de acciones** (`show_actions`): `span`, no botones; nada es clicable. `aria-hidden`.

Reales: el texto, las fotos, la fecha y el promedio.

## Comportamiento

- Las primeras `initial_posts` publicaciones a la vista; las demás salen del servidor con `hidden`. «Ver más testimonios» descubre la siguiente tanda del mismo tamaño y lleva el foco a la primera nueva sin mover la pantalla.
- «Ver más» aparece solo en los textos que de verdad quedaron cortados (se mide con `ResizeObserver`, al cargar la fuente y al descubrir publicaciones). Al tocarlo, el texto se abre entero y el foco pasa a la publicación.
- Cada publicación es un `<article>` con el nombre como etiqueta. Fotos con `image_url` + `image_tag`, `loading="lazy"` y `sizes` calculado por columnas.
- Sin JSON-LD `Review`.

## Psicología de venta

- **Objeción:** «¿a gente como yo le llegó y le sirvió? ¿Las fotos del anuncio son reales?».
- **Formato de red social:** la prueba se lee como conversación de pares, no como la voz de la marca.
- **Volumen visible:** seis publicaciones con foto en una pantalla dicen «muchos lo compraron» sin cifras.
- **Imperfección creíble:** texto completo, una de 4 estrellas entre las de 5.

## Reglas del copy (IA)

- La IA **elige y ordena** ids de reseñas aprobadas (4 a 12, número par); el texto es el de la reseña, nunca uno escrito.
- Primero las que tienen fotos (el prompt dice «N fotos»); abrir con la más específica; al menos una de 4 estrellas si existe; no repetir las del carrusel (`review-slider`) si hay suficientes.
- `heading` de 8 a 48 caracteres, cifras solo como `{count}` o `{rating}`.
- **Prohibido:** inventar reseñas o ids; elegir reseñas con promesas de salud o que hablen de aduanas, del marketplace o de un envío desde otro país; presentarlas como clientes de la tienda.
