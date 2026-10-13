# benefit-double-box — Envío y regalo

Dos tarjetas mínimas, en una fila en móvil, encima del botón de compra: envío a domicilio
 y guía digital del producto. Las dibuja `df-purchase-supports`, con datos del producto y
políticas reales. El bloque histórico conserva su schema para templates guardados; ya no
renderiza una segunda pareja de tarjetas bajo el botón.

El envío dice «Gratis» solo si la política real lo permite; con umbral, lo muestra. La guía
usa `gift_title` o «Guía de [producto]», `gift_cover` o un ícono de regalo, y el archivo
`gift_pdf`. Sin archivo muestra «Guía digital en preparación». La ficha nunca imprime su enlace.

La tarjeta y su ubicación son permanentes. Los textos históricos de IA no determinan el regalo
ni las políticas. Configuración y entrega por confirmación del pedido:
[`docs/shopify-purchase-supports.md`](../../../../docs/shopify-purchase-supports.md).

## Presentación compacta junto al despacho

La UI muestra las dos condiciones como una fila de íconos y títulos, sin fondo, borde ni relleno de tarjetas. Cada título abre su descripción con `details`/`summary` nativos y un área táctil de 44 px. Los textos completos, tokens, políticas y variantes siguen guardados y disponibles; no se cambia el contrato de datos. Los íconos usan el accent del producto con `df-accent-vars`. Liquid y React conservan el mismo marcado.

## Ticket y pago contra entrega

Antes del botón existente, tras shipping-timeline. Una tarjeta con policy=cod activo muestra cero adelanto, formateado en la moneda de la tienda, título y explicación visibles. No es un precio gratuito. La otra garantía sigue compacta y desplegable. Se conservan el contrato de dos tarjetas, condiciones reales, variantes y textos guardados.
