# inventory — Disponibilidad

Bloque de la columna del producto: un punto de estado que late y una línea de texto del mismo color. Archivo: `blocks/df-inventory.liquid` + `assets/df-inventory.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Entre el precio y el botón. El comprador acaba de ver el precio y evalúa si compra: la línea responde «¿lo tienen y cuándo llega?» justo cuando la mirada baja al botón, y en el estado de pocas unidades agrega urgencia en ese mismo punto.

## Anatomía

Igual en móvil y escritorio: una fila con un punto de 10 px (con halo que se expande y desvanece en 1,4 s) y el texto de 14 px del mismo color. Sin fondo ni borde.

| Estado | Cuándo | Color |
|---|---|---|
| `available` | con stock, o sin inventario rastreado | `--df-positive` (verde) |
| `limited` | inventario rastreado, `0 < cantidad ≤ umbral` | `--df-warning` (ámbar oscuro, AA) |
| `sold_out` | variante no disponible | `--df-negative` (rojo) |
| `preorder` | sin stock y venta permitida (`continue`) | `--df-info` (petróleo) |

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.inventory` (IA) | `available_text`, `limited_text`, `sold_out_text`, `preorder_text?` |
| Ajustes del bloque | los mismos textos como respaldo; umbral, mostrar cantidad, mostrar sin rastreo, punto animado, tamaño, márgenes |
| Liquid (real) | `variant.available`, `inventory_quantity`, `inventory_management`, `inventory_policy` de cada variante |
| `shop.metafields.dropflex.logistics` (real) | `handling_days`, `transit_days_min`, `transit_days_max` → tokens `{min}` y `{max}`; los ajustes del bloque son el respaldo |

Tokens: `{qty}` (cantidad real), `{min}` y `{max}` (días hábiles). Con «mostrar cantidad» apagado, el estado de pocas unidades usa el texto de disponible.

## Comportamiento

- El primer render ya trae el estado correcto de la variante elegida (sin parpadeo).
- Al cambiar de variante recalcula en el navegador con el JSON embebido: escucha `shopify:product:select` y, como respaldo, el `change` del formulario. Sin fetch ni sondeo.
- `role="status"` + `aria-live="polite"` anuncia el cambio; el punto es decorativo. El color nunca es la única señal: el texto dice el estado.
- `prefers-reduced-motion` apaga el halo.
- La página puede venir cacheada por el CDN: la cantidad puede estar desfasada unos minutos, por eso el texto dice «quedan» y no «exactamente».

## Psicología de venta

- **Objeción:** «¿lo tienen?», «¿cuánto tarda?» y la postergación («lo compro después»).
- **Reducción de incertidumbre:** disponibilidad y plazo en una línea, sin buscar.
- **Semáforo:** verde = seguro, ámbar = actúa pronto, rojo = perdido. Se entiende en menos de un segundo.
- **Señal en vivo:** el punto que late sugiere un dato actualizado y el movimiento en la visión periférica lleva la mirada hacia el botón.
- **Escasez real:** «Solo quedan 3» es aversión a la pérdida con especificidad. Solo es ética, y legal, si el número es real.

La referencia escribía el número a mano («solo quedan 5» fijo) y ofrecía un estado «limitado» manual: escasez simulada. Aquí no existe esa opción.

## Reglas del copy (IA)

- Disponible: «[estado positivo], [promesa de entrega con {min} y {max}]» o «[estado], [pago contra entrega]».
- Pocas unidades: «Solo quedan {qty} unidades», «Últimas {qty} unidades». `{qty}` obligatorio.
- Agotado: «Agotado, [siguiente paso]», sin prometer fecha.
- Una línea a 375 px (≤ 48 caracteres), tuteo, sin emojis ni mayúsculas sostenidas.
- **Prohibido:** escribir números, «se agotan en minutos», «X personas mirando», contadores aleatorios (Ley 19.496, publicidad engañosa sobre disponibilidad).
