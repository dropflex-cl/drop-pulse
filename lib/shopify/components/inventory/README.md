# inventory — Disponibilidad

Bloque de la columna del producto: un mensaje comercial fijo en ámbar, seguido del punto de disponibilidad y su texto. Archivo: `blocks/df-inventory.liquid` + `assets/df-inventory.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Bajo el botón. «Últimas unidades disponibles» introduce urgencia junto a la acción de compra; la siguiente línea conserva disponibilidad y plazo de entrega.

## Mensaje comercial fijo

`urgency_text` es texto editable e independiente del inventario: no consulta cantidades, no cambia al elegir variante de Shopify y no reemplaza `{qty}`. El editor del tema trae «Últimas unidades disponibles» como respaldo. El MCP descubre el campo con `get_component_generation_context` y lo guarda mediante `save_landing_content`, dentro de `inventory` y de su variante comercial. Un string vacío lo oculta; omitirlo conserva el comportamiento de respaldo. Las secciones ocultas y `{state: "empty"}` siguen respetándose.

La fila es ámbar, con punto decorativo y texto seminegrita, sin animación ni contador. El estado operativo conserva por separado su algoritmo y logística. La vista previa usa el mismo texto y marcado; publicación lo lleva en el JSON `dropflex.inventory` sin transformar el mensaje en un número de stock.

## Anatomía

Igual en móvil y escritorio: una fila con un punto de 10 px (con un halo que se expande y desvanece en 1,4 s, tres veces, y se detiene) y el texto de 14 px del mismo color. Sin fondo ni borde.

| Estado | Cuándo | Color |
|---|---|---|
| `available` | con stock, o sin inventario rastreado | `--df-positive` (verde) |
| `limited` | inventario rastreado, `0 < cantidad ≤ umbral` | `--df-warning` (ámbar oscuro, AA) |
| `sold_out` | variante no disponible | `--df-negative` (rojo) |
| `preorder` | sin stock y venta permitida (`continue`) | `--df-info` (petróleo) |

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.inventory` (IA) | `urgency_text?` comercial fijo; `available_text`, `limited_text`, `sold_out_text`, `preorder_text?` operativos |
| Ajustes del bloque | los mismos textos como respaldo; umbral, mostrar cantidad, mostrar sin rastreo, punto animado, tamaño, márgenes |
| Liquid (real) | `variant.available`, `inventory_quantity`, `inventory_management`, `inventory_policy` de cada variante |
| `shop.metafields.dropflex.logistics` (real) | `handling_days`, `transit_days_min`, `transit_days_max` → tokens `{min}` y `{max}`; los ajustes del bloque son el respaldo |

Tokens: `{qty}` (cantidad real), `{min}` y `{max}` (días hábiles). Con «mostrar cantidad» apagado, el estado de pocas unidades usa el texto de disponible.

## Comportamiento

- El primer render ya trae el estado correcto de la variante elegida (sin parpadeo).
- Al cambiar de variante recalcula en el navegador con el JSON embebido: escucha `shopify:product:select` y, como respaldo, el `change` del formulario. Sin fetch ni sondeo.
- `role="status"` + `aria-live="polite"` anuncia el cambio; el punto es decorativo. El color nunca es la única señal: el texto dice el estado.
- **Movimiento** ([`docs/spec-movimiento-tienda.md`](../../../../docs/spec-movimiento-tienda.md)): el halo late 3 veces cuando el bloque se ve al 50 % y otras 3 al cambiar de estado, nunca en bucle (WCAG 2.2.2: nada se mueve solo más de 5 s, y el bucle le quitaba atención al botón). El texto nuevo entra con un fundido de 200 ms. Sin JS el punto queda quieto. `prefers-reduced-motion` y el ajuste «Animaciones de DropFlex» apagan todo.
- La página puede venir cacheada por el CDN: la cantidad puede estar desfasada unos minutos, por eso el texto dice «quedan» y no «exactamente».

## Psicología de venta

- **Objeción:** «¿lo tienen?», «¿cuánto tarda?» y la postergación («lo compro después»).
- **Reducción de incertidumbre:** disponibilidad y plazo en una línea, sin buscar.
- **Semáforo:** verde = seguro, ámbar = actúa pronto, rojo = perdido. Se entiende en menos de un segundo.
- **Señal en vivo:** el punto que late sugiere un dato actualizado y el movimiento en la visión periférica lleva la mirada hacia el botón.
- **Escasez real:** «Solo quedan 3» es aversión a la pérdida con especificidad. Solo es ética, y legal, si el número es real.

El mensaje comercial fijo es independiente de esos estados; no escribe ni modifica cantidades de inventario.

## Reglas del copy (IA)

- Disponible: «[estado positivo], [promesa de entrega con {min} y {max}]» o «[estado], [pago contra entrega]».
- Pocas unidades: «Solo quedan {qty} unidades», «Últimas {qty} unidades». `{qty}` obligatorio.
- Agotado: «Agotado, [siguiente paso]», sin prometer fecha.
- Una línea a 375 px (≤ 48 caracteres), tuteo, sin emojis ni mayúsculas sostenidas.

Por defecto muestra disponibilidad e inventario real. Sin logística configurada omite el plazo. No muestra vendidos, visitas ni cifras de actividad simuladas.
