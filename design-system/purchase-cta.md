# Botón de pedido protagonista

La acción de pago contra entrega mantiene su jerarquía en reposo. Conserva el texto real del comerciante, el acento del producto y el contraste calculado del tema.

- Ancho completo; alto mínimo de 72 px (space-12 + space-6), texto de 20 px/600 (type-title), padding de 16/24 px (space-4/6) y radio del botón del tema.
- Base presionable de 4 px (space-1), mezclando 76 % del acento con la tinta; contorno de 4 px con el fondo de acento suave. Sombra `shadow-sm`: 0/1/2 px y tinta al 6 %. Esta base permanece quieta y no cambia el tamaño ni la posición del botón.
- El ticket de envío usa fondo de acento suave y tinta principal, con fechas sobre superficie neutra y línea en tinta de acento. El contorno interior usa hairline (1 px, como los bordes del sistema) sin alterar sus medidas. Las cifras del reloj usan tinta principal; unidades, etiqueta de despacho y corte usan tinta secundaria. El acento queda en el ícono y el paquete, y el relleno fuerte se concentra en el botón. No cambian la estructura, las fechas, el reloj ni sus textos.
- La vista previa usa el mismo CSS. EasySell toma la altura, el padding y la base desde los estilos calculados del botón compartido; sus textos, eventos y píxel conservan el recorrido existente. No cambian campos de contenido, contratos MCP ni la skill.

Implementación canónica: `_shared/assets/df-components.css` y `_landing/snippets/df-easysell.liquid` bajo `lib/shopify/components/`. El despliegue de la app y la actualización del tema de Shopify son acciones distintas.
