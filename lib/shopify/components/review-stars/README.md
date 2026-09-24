# review-stars — Estrellas de reseñas

Bloque de la columna del producto: cinco estrellas con relleno parcial, «4,6 · 19 reseñas» y el origen de las reseñas, todo como enlace a las reseñas completas. Archivo: `blocks/df-review-stars.liquid` + `assets/df-review-stars.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Sobre el título del producto. Es lo primero que se lee de la ficha: antes de evaluar el precio, el comprador ya recibe «otros lo compraron y lo calificaron». Además es un atajo: el que desconfía toca y baja a verificar las reseñas.

## Anatomía

Igual en móvil y escritorio:

1. Fila (alto mínimo 44 px, es el área táctil): 5 estrellas de 18 px (`df-stars`, relleno proporcional: 4,6 → 92 %) + texto de 14 px, peso 500.
2. Debajo, el origen en 12 px y color apagado: «Reseñas de compradores del mismo producto en AliExpress».

Alineación izquierda, centro o derecha. Sin fondo ni borde; el subrayado del texto aparece al pasar el puntero.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.review_stars` (IA) | `label`: plantilla con `{count}` (obligatorio) y `{rating}` |
| Ajustes del bloque | la misma plantilla como respaldo; mostrar texto, mostrar origen, mínimo de reseñas, ancla, compensación del encabezado, alineación, tamaños, márgenes |
| `product.metafields.dropflex.review_summary` (real) | `rating` (1 decimal), `count`, `source_label` de las reseñas **aprobadas** |

`{rating}` se escribe con coma y un decimal («4,6», «5,0»); `{count}` con punto de miles («1.234»). Una plantilla sin `{count}` se descarta y se usa «{rating} · {count} reseñas».

No hay modo manual: ni la IA ni el editor pueden escribir la nota o la cantidad.

## Comportamiento

- Render en Liquid (sin salto de diseño): las estrellas son SVG con recorte del ancho, nunca redondeadas hacia arriba.
- Sin resumen, con nota 0 o con menos reseñas que el mínimo (3 por defecto) no se dibuja nada: nunca «0 reseñas». En el editor aparece un aviso.
- Con ancla: es un `<a href="#resenas">` que funciona sin JS. El JS compensa el encabezado fijo (80 px por defecto), respeta `prefers-reduced-motion` y deja el foco en las reseñas. Si el ancla no existe en la página, el enlace se desactiva. Sin ancla: la fila es solo informativa.
- Un solo `aria-label` para lectores de pantalla: «Calificación 4,6 de 5, basada en 19 reseñas. Ir a las reseñas»; estrellas y texto visible van `aria-hidden`.
- Es por producto, no por variante: no se redibuja al cambiar de variante.
- No emite JSON-LD `AggregateRating` (le toca al bloque de reseñas completo, para no duplicarlo).

## Psicología de venta

- **Objeción:** «¿es confiable?», «¿es una estafa?». Crítica en pago contra entrega, con tráfico de Meta y TikTok hacia tiendas que el comprador no conoce.
- **Prueba social y fluidez:** cinco estrellas se entienden sin leer.
- **Efecto halo:** la calificación tiñe la lectura del título y el precio que vienen debajo.
- **Invitación a verificar:** el enlace a las reseñas es transparencia, y la transparencia da confianza.
- **Imperfección creíble:** un 4,6 real convence más que un 5,0 perfecto.

La referencia permitía teclear nota y cantidad a mano, redondeaba 4,8 a cinco estrellas llenas y mostraba «0 reseñas» sin datos. Aquí nada de eso existe.

## Reglas del copy (IA)

- La IA escribe solo la plantilla: `[{rating} ·] {count} + sustantivo concreto` («reseñas», «opiniones de compradores»). ≤ 40 caracteres, sin exclamaciones, sin superlativos, sin emojis.
- Son compradores del producto en AliExpress: «compradores», nunca «nuestros clientes».
- **Prohibido:** escribir números, «miles de clientes felices», «100 % satisfechos», «el más vendido» (Ley 19.496, art. 28; FTC 16 CFR 465 sobre indicadores de reseñas).
