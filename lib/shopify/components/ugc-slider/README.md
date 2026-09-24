# ugc-slider — Videos de clientes

Bloque de la columna del producto: una pista de videos verticales (o círculos tipo historias) que abre un reproductor a pantalla completa o flotante. Archivos: `blocks/df-ugc-slider.liquid`, `snippets/df-ugc-slider-card.liquid`, `assets/df-ugc-slider.js` (sobre `<df-slider>` de `_shared`). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Bajo el botón de compra. El tráfico llega desde anuncios en video (Meta, TikTok) y aquí encuentra más videos de gente usando el producto: «así se ve en la vida real, no solo en el render». Es la prueba para el que duda justo después de ver precio y botón.

## Anatomía

- **Encabezado** opcional, centrado: título de 16 px con una parte resaltada (`**…**`, acento en negrita) y, si se activa, estrellas + «4,6 · 19 reseñas» + origen de las reseñas.
- **Pista** (`<df-slider>`, sin bucle):
  - `reel`: tarjetas 3:5, 3 visibles (2, 2,5, 3, 3,5 o 4), separadas 10 px, radio 10 px. Póster con `object-fit: cover`, texto corto abajo sobre un degradado.
  - `circle`: burbujas de 88 px con anillo (borde del fondo + contorno fino), centradas si caben.
  - Ícono de play al centro: 40 px (30 px en círculo), translúcido con desenfoque o en el color de acento.
- **Paginación** (se oculta sola si todo cabe): barra de 5 px, puntos o nada. Flechas de 44 px opcionales.
- **Fondo de bloque** opcional (superficie del tema, 20 px de relleno).
- **Aviso** «Incluye contenido patrocinado» si el comerciante lo declara.
- **Reproductor** (`<dialog>`): video, barra de progreso de 3 px arriba, sonido (arriba a la izquierda), pausa y cerrar (arriba a la derecha), anterior/siguiente, texto del video y «Video 2 de 5» abajo. Todos los botones de 44 px.

| Modo | Cómo | Navegación |
|---|---|---|
| Pantalla completa | `showModal()`: página inerte, fondo oscuro; en escritorio, ventana de 420 × 700 px centrada | ← → y deslizar horizontal |
| Flotante | `show()` en la esquina inferior derecha, 340 × 567 px, sin fondo ni bloqueo | ↑ ↓ y deslizar vertical |
| Automático (por defecto) | pantalla completa bajo 750 px, flotante arriba | — |

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.ugc_slider` (IA) | `heading?` (tokens `{count}` `{rating}`, `**resaltado**`), `captions?[]` alineados por índice con los videos |
| `product.metafields.dropflex.ugc_videos` (real, media del componente) | videos que sube el comerciante (Shopify Files); pósters de `video.preview_image` |
| Ajustes del bloque | hasta 6 videos con su texto (respaldo del metafield), título, calificación, mínimo de reseñas, patrocinado, forma, visibles, radio, play, vista previa, paginación, flechas, fondo, modo, progreso, márgenes |
| `product.metafields.dropflex.review_summary` (real) | `{count}`, `{rating}`, estrellas y `source_label` del encabezado; bajo el mínimo (3) no se muestran y un título con cifra se oculta |

## Comportamiento

- **Liviano:** la pista solo carga pósters (`image_url` + `image_tag` con `widths`/`sizes`, `loading="lazy"`). Hay un único `<video preload="none">`, en el reproductor; toma la URL al abrir (la rendición MP4 más grande hasta 720p) y la suelta al cerrar para cortar la descarga. Un video sin MP4 no se dibuja.
- **Vista previa en movimiento** (apagada por defecto): crea un `<video muted>` con la rendición más chica solo en las tarjetas visibles al 50 %, y lo pausa al salir. Nunca con `prefers-reduced-motion` ni con ahorro de datos.
- **Sonido:** el toque que abre el video es la acción del comprador, así que arranca con sonido; si el navegador lo impide, sigue en silencio y el botón de sonido lo activa. Un solo video suena a la vez; todo se pausa con la pestaña oculta.
- **Teclado y foco:** cada tarjeta es un `<button>` («Ver video 2 de 5: …»). Al abrir, el foco va a «Cerrar»; Esc cierra (también en flotante) y el foco vuelve a la tarjeta. En pantalla completa el resto de la página queda inerte. Sonido y pausa son botones de alternancia con `aria-pressed`.
- **Flotante:** se mueve a `<body>` mientras está abierto para quedar sobre el tema; tocar otra tarjeta cambia de video sin cerrarlo.
- Sin videos: no se dibuja nada (aviso en el editor). Con 1: sin paginación ni flechas.

## Psicología de venta

- **Objeción:** «¿se ve igual en la vida real?, ¿funciona?, ¿me va a quedar?». En pago contra entrega, además: «¿esta tienda existe?».
- **Demostración y similitud:** una persona común con su celular es más creíble que cualquier render.
- **Familiaridad de formato:** reels e historias; nadie necesita aprender a usarlo.
- **Reproductor flotante:** el video sigue mientras el comprador baja y toca «Comprar».

La referencia reproducía todos los videos al cargar (`preload="auto"`, 5 MP4 completos en datos móviles), duplicaba cada video en la pista y el modal, mostraba una cifra de clientes de demo y cuadros verdes que imitaban a una plataforma de reseñas. Aquí: pósters, un solo video, cifras solo reales y estrellas propias.

## Reglas del copy (IA)

- `heading` opcional, ≤ 48 caracteres: sin cifra, una frase que describe el contenido («Así lo usan quienes ya lo tienen»); con cifra, `{count}` + lo que se cuenta («**{count} reseñas** de compradores»). Sin «+», sin «más de».
- `captions`: uno por video, en su orden, ≤ 40 caracteres, describe la acción o el contexto visible («Se pone en segundos»). Si no sabes qué muestra un video, omítelos.
- **Prohibido:** cifras escritas, resultados o promesas de salud, presentar videos del proveedor, de actores o hechos con IA como clientes, «nuestros clientes» para compradores del proveedor (Ley 19.496 arts. 28 y 33; FTC 16 CFR 465). Los videos de creadores pagados se rotulan con el aviso de patrocinio.
