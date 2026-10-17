# Formulario de pago al recibir

La presentación de EasySell vive en `lib/shopify/components/_landing/snippets/df-easysell.liquid`. Conserva los campos, decisiones, importes, validaciones y eventos de la app. El editor de EasySell decide si se ven las etiquetas; ocultarlas no se revierte desde el tema.

- Geist del tema, sin cargar otra fuente. Título `type-title` (20/26, 600); bajada y nota final de 13/18, 400 (escala de texto auxiliar de `reference/bundle.css`); títulos de sección `type-heading` (16/22, 600). Los campos mantienen 16 px y 48 px de alto para lectura y uso táctil.
- Grupos separados por `space-3` (12 px). Las envolturas vacías del encabezado y carrito no reservan espacio. La nota de efectivo tiene menos énfasis que el botón.
- El subtítulo del botón de apertura se conserva cuando el comerciante lo configuró. La acción sigue siendo única, con el acento vigente y sin animación adicional.
- La palabra inglesa exacta «Free» del resumen se representa como «Gratis». No se interpretan ni cambian precios, descuentos, tarifas ni textos de otras opciones.
- Apoyo final: «Despachamos con», ícono de camión de `df-icon` y logos con texto alternativo. Separación de 12/16 px; logos de hasta 96 × 32 px, sobre soportes de al menos 44 px de alto. Se permite envolver la fila en móvil.

## Transportistas de Datazo

El comerciante pidió Starken y Blue Express. El apoyo se limita a `shop.permanent_domain == 'qs060z-e7.myshopify.com'`; otras tiendas no anuncian operadores ajenos. No implica asociación, una nueva modalidad de entrega, un plazo ni un costo. Estos assets no son contenido generado ni nuevos campos del contrato PDP/MCP.

Los logos se sirven desde assets del tema, sin consultas a terceros. Se obtuvieron de sus sitios oficiales:

- Starken: [cabecera oficial](https://www.starken.cl/soy-starken), archivo `logo-q100.bac31f50de7b41338e6c.webp`. Marca blanca original, sobre el verde de su cabecera (`#009d4e`), limitado al soporte del logo. Este color de marca no se usa como estado de UI.
- Blue Express: [sitio oficial](https://www.blue.cl/), archivo [logo.svg](https://www.blue.cl/logo.svg). Se conserva su arte y sus colores.

El template del apoyo es inerte. El runtime añade una única copia propia al formulario cuando EasySell lo monta y la repone si la app remonta el formulario. Nunca mueve ni reemplaza un campo, oferta o botón de la app.
