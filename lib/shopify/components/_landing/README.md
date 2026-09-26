# La tienda como landing de un producto

Piezas del tema que **no son componentes del catálogo**: la IA no escribe su contenido. Muestran datos reales (precio, variantes, reseñas aprobadas, políticas) o textos aprobados en la app. Se copian al tema con los demás componentes (`npm run shopify:components`) y siguen las mismas reglas del [README de componentes](../README.md): prefijo `df-`, portables, escapados, sin defaults vacíos.

## Modo landing

La tienda es solo la ficha del producto. La home, las colecciones, la búsqueda, los blogs y las páginas no se pueden visitar.

| Pieza | Qué hace |
|---|---|
| `snippets/df-landing-mode.liquid` | La única fuente de verdad: imprime `true` o `false` según el ajuste `df_landing_mode` (encendido por defecto). |
| `snippets/df-landing-redirect.liquid` | Va en el `<head>`, antes de los estilos. En una ficha guarda el producto en `localStorage['df:last-product']`. En cualquier otra página, el navegador vuelve al último producto visitado, o al de respaldo si no hay uno. El respaldo es el ajuste `df_landing_product` o, si no está, el primer producto disponible de la tienda. |
| Header (`sections/header.liquid`, `snippets/header-actions.liquid`, `blocks/_header-logo.liquid`) | Sin menú, buscador, cuenta ni selector de país e idioma. El logo va sin enlace. Sin carrito: toda compra entra por el formulario de pago contra entrega (EasySell); el ajuste `df_header_cart` (apagado por defecto) lo vuelve a mostrar. |
| Pie (`sections/footer-group.json`) | Solo el copyright y las políticas. |

Reglas de la redirección (spec del tema, §9.2):

- **Nunca redirige** estas páginas:
  - la ficha, el carrito, las políticas, la cuenta, password, gift card y captcha;
  - las páginas con handle `contact`, `contacto`, `seguimiento` o `gracias`, o con template `page.contact`;
  - nada dentro del editor de temas.
- Conserva `location.search` y `location.hash` (`utm_*`, `fbclid`), así no se pierde la atribución.
- No vuelve a una ficha agotada: guarda si el producto estaba disponible.
- **En 404:** borra el producto guardado y redirige al respaldo una sola vez por sesión (`sessionStorage['df:bounced']`), para no crear un bucle.
- Las páginas que redirige llevan `noindex`, para que Google no las indexe.

## Logo de la marca

`snippets/df-brand-logo.liquid` es el logo de Datazo dibujado en código (portado de v1, flux › `dropflex-brand-logo`), con el mismo criterio:

- Toma el acento del producto (`dropflex.accent`); sin acento, el rosa de la marca.
- Todos los tonos salen de ese color con `color_modify: 'lightness'` (conserva el tono): tinte del domo (L85), ola (L38), orbes con 3:1 contra la tinta y el texto de la etiqueta con 4.5:1 sobre la tinta.
- El contorno de tinta es fijo y envuelve cada relleno: cualquier acento se lee sobre el header.
- Letras Fredoka Bold (SIL OFL 1.1) convertidas a trazos: no depende de ninguna fuente.

El header (`blocks/_header-logo.liquid`) lo dibuja en lugar de `settings.logo` con el ajuste `df_brand_logo`, **encendido por defecto** (alto con `df_brand_logo_height`, 80 % en móvil). Apagándolo en el editor vuelve el logo subido.

## Design system

`snippets/df-design-system.liquid` lleva a la tienda los tokens de DropFlex (`design-system/`). Lo controla el ajuste `df_design_system`, encendido por defecto.

- **Tipografía:** Geist 400/500/600 servida desde el propio tema (`assets/df-geist-*.woff2`, licencia OFL en `GEIST-LICENSE.txt`), con cifras tabulares en precios.
- **Foco:** el anillo de 2 px con separación de 2 px.
- **Movimiento:** 0 ms con `prefers-reduced-motion`.
- **Acento:** en la ficha, el botón principal toma el acento del producto (`dropflex.accent`). Sin acento, queda el cobalto de DropFlex.
- **Paleta y radios:** van como valores del tema en `config/settings_data.json`, así el comerciante los puede cambiar en el editor:
  - blanco, tinta `#15171c`, bordes `#e4e6eb`;
  - radios de 6, 10 y 14 px.

## EasySell COD Form

`snippets/df-easysell.liquid` (al final del `<body>`) lleva el formulario de pago contra entrega al design system. Portado de v1 (flux › `dropflex-cod-cta-accent` y la capa «EASYSELL» de `flux-redesign.css`). Lo controla el ajuste `df_easysell`, encendido por defecto; se apaga también con `df_design_system`.

- **Formulario (CSS):** campos de 48 px con el borde y el radio de los inputs del tema, prefijo y campo en una sola pieza, foco con el anillo del design system, resumen del pedido con los bordes del tema, fotos con el radio de las fotos del producto y el modal con el radio de las tarjetas.
- **Botones (script):** el que abre el formulario, la barra fija de la app, el de enviar y el de aceptar del downsell toman el botón principal del tema: el acento del producto, su texto, su hover y su radio. Planos, sin el degradado ni la sombra de la app. La tarjeta del formulario toma el radio de las tarjetas y va sin sombra.
- **Rechazo del downsell (script):** aceptar y rechazar son el mismo componente de EasySell (misma clase, id aleatorio), así que antes los dos salían como botón de compra. El de rechazar (el que no es el primero en `.es-downsell-buttons` o `#easysell-upsell`) va como texto gris subrayado. Se ve solo cuando el popup de EasySell no lo reemplaza la oferta de salida (abajo).
- **Formulario de pedido (CodOrderForm, BundlePicker y OrderBump del design system):**
  - Packs (ofertas por cantidad de EasySell): tarjeta de 72 px con radio. La elegida (`[offer-selected]`) va en acento con fondo suave. El sello de ahorro va en verde; el vacío del pack de 1 unidad se oculta.
  - Agregados: tarjeta sobria con casilla de 22 px, sin borde punteado ni fondo verde. Marcados (`:has(.bump-checkbox-input:checked)`), acento y fondo suave. Si el texto del agregado en EasySell es `<strong>nombre</strong> <strong>+precio</strong>`, el precio va a la derecha (`data-df-es-split`).
  - Resumen: fondo gris sin borde. El ahorro y el envío sin monto van en verde (`data-df-es-free`). El total, más grande y separado por una línea.
  - Orden agregados → resumen → botón, con `display: contents` y `order`, sin mover nodos.
  - Botón de enviar: 56 px y 17 px/600, sin el rebote de la app. Con `prefers-reduced-motion`, ningún botón de EasySell rebota.
  - Packs, agregados y la X se anuncian como radio, casilla y botón (`role`, `tabindex`, `aria-checked`). Espacio o Enter hacen clic en el mismo nodo.
  - **Qué no se toca:** EasySell mide impresiones y conversiones (packs, agregados, downsell) por sus selectores y solo cuenta una impresión si el nodo tiene `offsetParent` (`waitForSelectorToBeVisible`). Por eso ningún nodo se mueve, se crea, se borra ni se oculta con `display: none`, y ningún id, name, clase ni manejador cambia. Lo que la app escribe inline con `!important` (textos de los packs, título, sello, precio) lo repinta el script con la misma técnica que los botones.
  - **Textos:** son de EasySell y se cambian en su panel. Lo que pide el design system: título «Completa tu pedido», sello «Ahorras $X · N %», sección «¿A dónde lo enviamos?», agregados sin emojis con `<strong>nombre</strong> <strong>+precio</strong>` y una descripción de qué es, resumen «Subtotal», «Descuento del pack», «Gratis» y «Total a pagar al recibir», botón «Confirmar pedido» con «No pagas nada ahora», y el campo opcional «Depto, casa o referencia».
  - **Fuera de alcance:** etiquetas visibles en los campos, comuna deshabilitada hasta elegir región y la barra fija del botón. Piden cambiar el DOM o el comportamiento de EasySell.
- **Por qué script:** EasySell escribe esos estilos inline con `!important`, que le ganan a cualquier hoja. El script lee los tokens ya resueltos del tema con un elemento de prueba, los escribe inline y los repone cada vez que la app los reescribe (un observador por nodo, idempotente).
- **Una sola barra fija de compra:** en móvil se apilaban la barra del tema (agrega al carrito) y la de EasySell. Queda la del tema (foto, precio y botón) con el texto del botón de EasySell; al tocarla hace clic en el propio botón de EasySell, así corre su código tal cual: abre el formulario y manda InitiateCheckout al píxel de Meta y a los demás, igual que tocar el botón de la app. Nunca se llama a una función interna de la app ni se dispara un evento del píxel a mano. El clic se toma en captura sobre `window`, antes que el tema, para que no agregue al carrito. La barra de EasySell se oculta (`html.df-es-cod`). Sin EasySell, la barra agrega al carrito como siempre.
- **Botón a todo el ancho:** EasySell oculta el «Agregar al carrito» del tema pero deja su contenedor, que en escritorio le quitaba media fila al botón de EasySell. El script marca ese contenedor vacío (`data-df-es-empty`) y el CSS lo saca de la fila.
- El app embed de EasySell queda siempre encendido desde Publicar (`EASYSELL_EMBED` en `lib/shopify/publish/kit.ts`).

## Oferta de salida (downsell)

`snippets/df-downsell.liquid` + `assets/df-downsell.js` (al final del `<body>`, después de `df-easysell`) muestran el downsell de EasySell como el componente `DownsellOffer` del design system. Lo controla el ajuste `df_downsell`, encendido por defecto; los textos son ajustes del tema (`df_downsell_eyebrow`, `_title` con `{percent}`, `_trust`, `_cta`, `_decline`).

- **EasySell es el motor.** Decide cuándo aparece (al cerrar el formulario y, en ficha y carrito de escritorio, cuando el mouse llega al 5 % superior de la ventana), guarda el porcentaje (EasySell › Downsell) y aplica el descuento: el pedido lleva el id del downsell y su servidor calcula el monto.
- **Fachada:** el script observa el `style` de `#es-downsell`. Cuando EasySell lo muestra, lo oculta (`data-df-dso-hidden`, con `visibility: hidden`; con `display: none` EasySell no contaba la impresión del downsell) y abre un `<dialog>` nativo: hoja inferior en móvil, modal de 420 px en escritorio. «Aplicar descuento y continuar» hace clic en el botón real de aceptar de EasySell; «No, gracias», la X, Esc y el toque en el velo, en el de rechazar. Mismo patrón que la barra fija: nunca se llama a una función interna ni se dispara un evento a mano.
- **Montos:** EasySell descuenta el % sobre el **subtotal de productos** (menos el descuento por cantidad), no sobre el envío, el recargo ni los productos extra de un toque, y lo resta del total. El script lee esos valores de su store de Vue (solo lectura: `calculator/subtotal`, `calculator/offerDiscountValue`, `calculator/total`, `downsells/getDownsell`) y los formatea con `window.ES_FORMAT_CURRENCY`. Así el popup dice lo mismo que el resumen del formulario después de aceptar, incluido su redondeo: $55.990 al 5 % muestra ahorro $2.800 y total $53.191.
- **Una vez por sesión** (`sessionStorage['df:downsell']`). EasySell la vuelve a abrir en cada cierre del formulario mientras no se acepte. Si el comprador ya la rechazó, el script hace clic en rechazar en el mismo instante: el formulario se cierra sin mostrar nada. Cada vez que EasySell la abre también reabre el formulario y cuenta un InitiateCheckout en su analítica; eso no se puede evitar desde el tema. Si la aceptó, puede volver tras recargar, porque EasySell olvida el descuento.
- **Respaldo:** si algo no calza (sin estado legible, otra versión de EasySell, un descuento de monto fijo, montos que no cuadran), no oculta nada y queda el popup de EasySell con el diseño de `df-easysell`.
- **Probado** con una página local que reproduce el `DownsellPopup` de EasySell (easysell-cod-form-523: DOM, clases, estilos inline y la config de Datazo), con los snippets reales: aceptar, rechazar, X, Esc, velo, una vez por sesión, producto extra, salida por el borde y respaldo. **Falta:** un pedido de prueba en una tienda de desarrollo para confirmar el monto que cobra el servidor de EasySell.

## Galería de la ficha

- **Miniaturas también en móvil** (`slideshow_mobile_controls_style: thumbnails`, en `templates/product.json` y como default del bloque): una tira de miniaturas bajo la foto que se desliza, desde el margen de 16 px, con snap (CSS en `df-design-system`).
- **Fundido y avance automático** (`snippets/df-gallery.liquid` + `assets/df-gallery.js`, al final del `<body>` solo en la ficha). Las miniaturas, las flechas y el avance automático saltan a la foto nueva sin deslizar y la anterior se desvanece encima (una copia de su `<img>`, 450 ms). Deslizar con el dedo sigue deslizando. El clic se toma en captura sobre `window`, antes del `on:click` del tema; solo usa la API pública del slideshow (`select`, `current`, `slides`).
- El avance automático (ajustes `df_gallery_autoplay`, encendido, y `df_gallery_speed`, 4 s) se detiene con cualquier toque, tecla o foco en la galería y vuelve a los 8 s; también con el mouse encima, fuera de pantalla, con la pestaña oculta, con un diálogo abierto (zoom, EasySell) o con un video sonando. Con `prefers-reduced-motion` no hay ni avance ni fundido.

## Bloques de la ficha

| Bloque | Dónde | Datos |
|---|---|---|
| `df-hype-badge` | Arriba de todo | Etiqueta con el acento del producto («Producto viral»), texto del editor. «Stock bajo» se agrega solo si la variante de 1 unidad sigue su inventario en Shopify y le quedan pocas (umbral en el editor): nunca escasez inventada. Estilo borde o relleno |
| `df-social-proof` | Bajo el badge de novedad | Fotos de reseñas aprobadas con 4 o 5 estrellas y la cantidad real de `dropflex.review_summary`. Los nombres nunca son el autor («Cliente», «Anónimo»): `df-social-proof.js` los elige al azar de 50 nombres de mujer y 50 de hombre y los guarda por producto en `localStorage["df:social-proof:<id>"]` |
| `df-title` | El título | El nombre del producto como `<h1>` (el del tema es un `<p>`), 26 px en móvil y 36 px en escritorio |
| `df-subtitle` | Bajo el título | `dropflex.subtitle`: la descripción corta de la ficha aprobada |
| `df-price` | Bajo la línea divisoria | Precio y precio tachado de la variante elegida, más el ahorro calculado. Con packs, los del pack elegido (evento `df:pack`) |
| `df-social-badge` | Bajo los beneficios | Píldora con el logo de TikTok (o un ícono) y una cifra de redes («Viral en TikTok: {views} vistas»). La cifra la escribe el comerciante en el editor (ajuste `views`), nunca la IA; sin cifra no se muestra |
| `df-pack-offers` | Sobre el botón | Una tarjeta por pack de `dropflex.offer` (1, 2 y 3 unidades) con su precio, su tachado y sus textos. Se muestra solo si EasySell cobra cada pack igual (ver abajo) |
| `df-trust-note` | Bajo la galería en computador y bajo el botón en teléfono (ajuste `visibility`) | Una política real de la tienda (pago al recibir, cambios, garantía). Si la política no está activa, no se muestra |

## Packs: la variante de 1 unidad × N

**Un pack nunca es una variante.** Es la variante de 1 unidad con cantidad N, y su precio lo cobra la **oferta por cantidad de EasySell**. Antes cada pack era una variante («2 unidades»), pero Dropify (la integración de Dropi) enlaza el producto entero con un solo id de Dropi y manda la cantidad de la línea: el pack de 2 llegaba a Dropi como 1 unidad (Datazo, pedido #1006, 2026-09-26).

- **La tarjeta elige la cantidad.** `df-pack-offers.js` deja la variante de 1 unidad en `input[name="id"]` y la cantidad del pack en `input[name="quantity"]` (el selector del tema va oculto). Lo repone en captura antes de cada clic, por si el tema lo reescribe.
- **EasySell elige su oferta.** Al abrir su popup, EasySell lee la variante y la cantidad del formulario del producto y elige la opción de esa cantidad (`Lt` → `ES_SELECT_OFFER_BY_QUANTITY` en easysell.js). El pedido llega como la variante × N con su descuento («QUANTITY DISCOUNT»). Nunca se llama a una función de la app.
- **La página nunca dice otro precio que el que cobra el formulario.** Cada tarjeta se compara con `window.EASYSELL_QUANTITY_OFFERS` (solo lectura, con el cálculo de EasySell: N × precio de la variante menos el descuento en % o fijo). La tarjeta sin opción de su cantidad, o con otro precio, se esconde. El bloque entero se esconde, y la cantidad queda en 1, en estos casos:
  - quedan menos de 2 tarjetas;
  - no hay oferta para el producto;
  - hay una opción preseleccionada (EasySell ya no toma la cantidad de la página);
  - la oferta se muestra junto al botón (`placement` con `button`: EasySell no lee la cantidad);
  - el formulario no es un popup.
  En el editor de temas un aviso dice qué cambiar; en la tienda, solo `console.warn`.
- **Configuración en EasySell:** una oferta por cantidad para el producto con una opción por pack, **descuento fijo** = N × precio de 1 unidad − precio del pack, sin preseleccionar, solo en el formulario. La pantalla Publicar de DropFlex muestra los montos.
- **Precios:** `dropflex.offer.packs[].price` y `compare_at`, en centavos como Liquid. Transición: un producto publicado antes (packs como variantes de una sola opción, sin `price`) toma el precio de la variante del mismo orden hasta que se vuelva a publicar.
- `df-price` muestra el pack elegido (`df:pack`) y la barra fija del tema su precio y su nombre. `df-inventory` sigue a la variante de 1 unidad, que no cambia.
