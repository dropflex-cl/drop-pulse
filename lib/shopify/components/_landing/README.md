# La tienda como landing de un producto

Piezas del tema que **no son componentes del catálogo**: la IA no escribe su contenido. Muestran datos reales (precio, variantes, reseñas aprobadas, políticas) o textos aprobados en la app. Se copian al tema con los demás componentes (`npm run shopify:components`) y siguen las mismas reglas del [README de componentes](../README.md): prefijo `df-`, portables, escapados, sin defaults vacíos.

## Modo landing

La tienda es solo la ficha del producto. La home, las colecciones, la búsqueda, los blogs y las páginas no se pueden visitar.

| Pieza | Qué hace |
|---|---|
| `snippets/df-landing-mode.liquid` | La única fuente de verdad: imprime `true` o `false` según el ajuste `df_landing_mode` (encendido por defecto). |
| `snippets/df-landing-redirect.liquid` | Va en el `<head>`, antes de los estilos. En una ficha guarda el producto en `localStorage['df:last-product']`. En cualquier otra página, el navegador vuelve al último producto visitado, o al de respaldo si no hay uno. El respaldo es el ajuste `df_landing_product` o, si no está, el primer producto disponible de la tienda. |
| Header (`sections/header.liquid`, `snippets/header-actions.liquid`, `blocks/_header-logo.liquid`) | Sin menú, buscador, cuenta ni selector de país e idioma. El logo va sin enlace. |
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
- **Botones (script):** el que abre el formulario, la barra fija de la app, el de enviar y el del downsell toman el botón principal del tema: el acento del producto, su texto, su hover y su radio. Planos, sin el degradado ni la sombra de la app. La tarjeta del formulario toma el radio de las tarjetas y va sin sombra.
- **Por qué script:** EasySell escribe esos estilos inline con `!important`, que le ganan a cualquier hoja. El script lee los tokens ya resueltos del tema con un elemento de prueba, los escribe inline y los repone cada vez que la app los reescribe (un observador por nodo, idempotente).
- El app embed de EasySell queda siempre encendido desde Publicar (`EASYSELL_EMBED` en `lib/shopify/publish/kit.ts`).

## Bloques de la ficha

| Bloque | Dónde | Datos |
|---|---|---|
| `df-social-proof` | Arriba de todo | Fotos y nombres (enmascarados) de reseñas aprobadas con 4 o 5 estrellas, más la cantidad real de `dropflex.review_summary` |
| `df-title` | El título | El nombre del producto como `<h1>` (el del tema es un `<p>`), 26 px en móvil y 36 px en escritorio |
| `df-subtitle` | Bajo el título | `dropflex.subtitle`: la descripción corta de la ficha aprobada |
| `df-price` | Bajo la línea divisoria | Precio y precio tachado de la variante elegida, más el ahorro calculado. Se actualiza al cambiar de variante |
| `df-pack-offers` | Sobre el botón | Una tarjeta por variante (los packs de 1, 2 y 3 unidades) con su precio real. Los textos salen de `dropflex.offer`, y sin ellos se usa el nombre de la variante. Si el producto tiene una sola variante, no se muestra |
| `df-trust-note` | Bajo la galería en computador y bajo el botón en teléfono (ajuste `visibility`) | Una política real de la tienda (pago al recibir, cambios, garantía). Si la política no está activa, no se muestra |

**Packs = variantes.** Cada pack es una variante del producto («1 unidad», «2 unidades», «3 unidades»), con su precio y su precio tachado. Así el botón nativo, el carrito y cualquier app de pago contra entrega venden el pack correcto sin descuentos aparte.

`df-pack-offers` cambia el `input[name="id"]` del formulario y avisa con un `change`. `df-price` y `df-inventory` lo escuchan. No depende del selector de variantes del tema.
