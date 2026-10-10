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
