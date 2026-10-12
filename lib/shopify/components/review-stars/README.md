# review-stars — Estrellas de reseñas

## Contenido editable vigente

El MCP permite redactar contenido propio sin reseñas importadas ni pruebas reales. Los campos de `content.ts` son la fuente de verdad vigente; `review_id` y los resúmenes importados son referencias opcionales. El texto propio se guarda en el componente y no cambia las reseñas importadas.

`label`, `rating` y `count` son editables. Un label sin tokens puede mostrarse sin cifras; cuando se usan tokens, se resuelven con los campos propios o el resumen disponible.

## Compatibilidad con reseñas importadas

Bloque de la columna del producto: cinco estrellas con relleno parcial y «4,6 · 19 reseñas», como enlace a las reseñas completas. Archivo: `blocks/df-review-stars.liquid` + `assets/df-review-stars.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Bajo la valoración de Google y antes de los badges y el título. Antes de evaluar el precio, el comprador recibe «otros lo compraron y lo calificaron». Además es un atajo: el que desconfía toca y baja a verificar las reseñas.

## Anatomía

Igual en móvil y escritorio:

Una fila (alto mínimo 44 px, es el área táctil): 5 estrellas de 16 px por defecto (`df-stars`, relleno proporcional: 4,6 → 92 %) + texto de 12 px, peso 500. El modo compacto muestra solo nota y cantidad, sin el argumento extenso de prueba social. Desactivar `compact` recupera el texto guardado o la proporción real; no modifica contenido persistido. La tienda no muestra el origen de las reseñas.

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
- Con ancla: es un `<a href="#resenas">` que funciona sin JS. El JS compensa el encabezado fijo (80 px por defecto), respeta `prefers-reduced-motion` y deja el foco en las reseñas. Al llegar, las reseñas hacen un destello del acento suave (900 ms, `dfMotion.flash`, [`docs/spec-movimiento-tienda.md`](../../../../docs/spec-movimiento-tienda.md)): el comprador ve dónde quedó. Si el ancla no existe en la página, el enlace se desactiva. Sin ancla: la fila es solo informativa.
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

Desarrolla contenido propio con los campos vigentes de `content.ts`. Importar reseñas, verificar hechos o disponer de fotos no es requisito de redacción ni de guardado. Los textos guardados se representan en Shopify y la vista previa con el mismo contrato. Las referencias a datos importados de este documento describen un respaldo opcional.
