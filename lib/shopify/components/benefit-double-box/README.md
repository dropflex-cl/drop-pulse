# benefit-double-box — Doble tarjeta

Bloque de la columna del producto: dos tarjetas gemelas, una para el pago y otra para el cambio o la garantía. Archivo: `blocks/df-benefit-double-box.liquid` (sin JS). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Bajo el botón de compra. En el instante del clic quedan dos barreras: «¿cómo pago, es seguro?» y «¿qué pasa si no me sirve?». Las tarjetas las responden ahí mismo. Complementa a `benefit-usps` (sobre el botón: envío, origen, soporte) sin repetirlo.

## Anatomía

Igual en móvil y escritorio: grilla de dos columnas iguales con 8 px de separación (≈ 165 px por tarjeta a 375 px). Cada tarjeta (`<li>`):

1. **Ícono o imagen** en una franja de 24 px de alto alineada a la izquierda. La imagen (por ejemplo, los logos de los medios de pago activos) conserva su proporción: alto fijo, ancho libre.
2. **Título** 14 px en negrita (`<p><strong>`, no un encabezado, para no ensuciar el esquema de la página).
3. **Descripción** 1,5 px menor que el título, nunca bajo 12 px, color atenuado.

Fondo `--df-surface` y radio de 16 px, o borde fino (`--df-hairline`) sin fondo. Ícono en el acento del producto. Con una sola tarjeta válida, ocupa todo el ancho; con «Apilar en móvil», una columna bajo 480 px.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.benefit_double_box` (IA) | `cards[2]`: `icon` (clave de `ICON_KEYS`), `title` (≤ 24 visibles), `body` (≤ 64 visibles), `policy` |
| Ajustes del bloque | 2 tarjetas fijas (ícono, imagen, título, descripción) como respaldo; borde, apilar, radio, relleno, alto del ícono, tamaño del título, márgenes |
| `shop.metafields.dropflex.policies` (real) | `cod`, `return_days`, `warranty_months`, `free_shipping`, `whatsapp`: habilitan cada tarjeta y llenan sus tokens |
| `shop.metafields.dropflex.logistics` (real) | preparación + tránsito → `{min}` y `{max}` |
| Archivos de Shopify (editor) | logos de pago con su texto alternativo |

Tokens: `{return_days}`, `{warranty_months}`, `{threshold}` (monto del envío gratis), `{min}`, `{max}`.

## Comportamiento

- Estático: sin JS, sin animación.
- **Filtro de verdad:** cada tarjeta del metafield declara la política que afirma y se oculta si no está activa; una tarjeta con un token cuyo dato falta tampoco se muestra (también las del editor). Sin tarjetas, el bloque no ocupa espacio; en el editor muestra un aviso.
- Ícono desconocido → `check`.
- Accesibilidad: `<ul role="list">`, íconos `aria-hidden`; la imagen usa el texto alternativo del archivo (los nombres de los medios de pago) o `alt=""` si no tiene. Textos de 12 px o más; `hyphens: auto` con el `lang` de la tienda para cortar bien en la columna estrecha.
- Rendimiento: SVG en línea; la imagen sale a 160/320 px, sin carga diferida (suele verse en el primer pantallazo en escritorio) y con sus dimensiones para no mover el diseño.

## Psicología de venta

- **Objeción:** «¿cómo pago?» y «¿y si no me sirve?», las dos últimas barreras de riesgo percibido.
- **Reversión de riesgo:** el cambio o la garantía traslada el riesgo a la tienda.
- **Pago diferido:** pagar al recibir baja el dolor de pagar y la desconfianza hacia una tienda nueva (el equivalente del «pago contra factura» de la referencia).
- **Autoridad prestada:** logos conocidos de medios de pago transfieren confianza, solo si están activos.
- **Formato sello:** dos cajas gemelas se leen como garantías formales, más «oficiales» que una lista.
- **Pago + garantía:** cubren el riesgo antes y después de la compra.

La referencia usaba descripciones de 11,5 px, una fuente propia en vez de la del tema y relleno fijo de 25 px (estrecho en móvil). Aquí: mínimo 12 px, fuente del tema, relleno ajustable y beneficios comprobados contra las políticas reales.

## Reglas del copy (IA)

- `title`: el hecho verificable, modalidad o cifra como token («Pagas al recibir», «{return_days} días para cambiarlo»), ≤ 24 visibles.
- `body`: cómo te protege, una frase que no repite el título, ≤ 64 visibles (tres líneas en la tarjeta de ~165 px a 375 px).
- Tarjeta 1 = pago (en pago contra entrega, siempre pagar al recibir); tarjeta 2 = cambio o garantía, o despacho y seguimiento.
- `policy` obligatorio. Marcas de pago solo si están activas. Tono calmado, tuteo, sin exclamaciones.
- **Prohibido:** ofrecer menos que la ley o presentar la garantía legal (6 meses) o el retracto (10 días) como regalo (Ley 19.496, arts. 21 y 3 bis); «100 % garantizado» sin política; «devolución de tu dinero» si solo hay cambio; sellos inventados; cifras escritas.
