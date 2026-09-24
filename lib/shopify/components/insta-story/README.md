# insta-story — Historias

Sección de página completa: una fila de círculos al estilo de Instagram que abre un visor de historias a pantalla completa en un `<dialog>` nativo. Archivos: `sections/df-insta-story.liquid` + `assets/df-insta-story.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

En la parte alta de la landing, bajo el hero, o a mitad de página como «producto en uso» antes de los testimonios. El tráfico llega desde una historia de Meta o TikTok: encontrar el mismo formato en la tienda da continuidad y muestra el producto en uso antes de pedir una decisión.

## Anatomía

- **En la página:** título y bajada centrados («Toca una historia para verla»); una fila de círculos (80 px por defecto, 60–112) con aro degradado, sólido o sin aro, la miniatura recortada en círculo y una etiqueta de 12 px de hasta 2 líneas. La fila se centra si cabe y se desplaza en horizontal si no. Tarjeta de fondo opcional. Un círculo ya visto pierde el color del aro.
- **Visor:** en móvil ocupa toda la pantalla; en escritorio, un lienzo 9:16 centrado (hasta 960 px de alto) sobre un fondo oscuro con desenfoque.
  - Arriba: barras segmentadas (una por historia: las vistas llenas, la actual avanza) y los controles de pausa/reproducir, sonido (solo en videos) y cerrar, de 44 px.
  - El medio a sangre (`object-fit: cover`) con degradados arriba y abajo para leer.
  - Abajo: el texto en HTML (línea 1 en blanco; línea 2 como resaltado del color de acento) y el botón opcional.
  - Flechas anterior/siguiente de 44 px a los lados.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.insta_story` (IA) | `heading?`, `stories[3..10]` (`title`, `caption_line_1`, `caption_line_2?`, `cta_label?`), alineadas por índice con los medios |
| Metafield `dropflex.insta_story_media` (real) | `list.file_reference` de imágenes y videos verticales, en el orden de la secuencia |
| Bloques «Historia» (máx. 12) | respaldo: imagen o video, miniatura, etiqueta, dos líneas de texto, botón y enlace |
| Ajustes de la sección | título, bajada, destino del botón (#ancla o página del producto), duración de imágenes, videos sin sonido, cerrar al terminar, tamaño del círculo, aro, tarjeta, fondo, espacios; producto fuera de la ficha |
| Liquid (real) | `product.url`, `preview_image` del video como miniatura y póster |

Medios: si existe `insta_story_media` manda sobre los bloques. Textos: la historia `i` del metafield; si no existe, los del bloque `i`. Un medio que no es imagen ni video se omite. Sin medios la sección no se dibuja (en el editor muestra un aviso).

## Comportamiento

- Los círculos son `<button>`; abren el visor con `showModal()` (trampa de foco, Esc y fondo nativos). El foco inicial va a «Cerrar» y al cerrar vuelve al círculo. El scroll de la página queda bloqueado mientras está abierto.
- Avance automático: imágenes según «Duración de imágenes» (5 s por defecto) con la barra animada por Web Animations; el fin de la animación es el avance (sin temporizadores sueltos). Videos: la barra sigue al video y `ended` avanza. Al terminar la última, se cierra (o queda completa si «Cerrar al terminar» está apagado).
- Gestos: toque en el tercio izquierdo = anterior, resto = siguiente; mantener = pausa (los controles se esconden mientras); deslizar hacia abajo = cerrar; deslizar en horizontal = anterior/siguiente. Teclado: ← y →, Esc. Clic fuera del lienzo = cerrar.
- Pausa visible (WCAG 2.2.2) y automática con la pestaña oculta. `prefers-reduced-motion`: sin avance automático; la barra marca el paso sin animarse.
- Videos: el `<video>` se crea desde un `<template>` recién al abrir su historia (`preload="none"`, póster, `playsinline`, sin `loop`), silenciado por defecto con botón de sonido. Si el navegador bloquea `play()`, queda en pausa con ▶ visible.
- Imágenes del visor con `image_tag` (540–1080 px) y `loading="lazy"`: no se descargan hasta abrir; se adelanta solo la imagen siguiente.
- El botón a un `#ancla` cierra el visor y desplaza la página hasta el ancla; otro enlace navega normal.
- Un lector de pantalla oye «Historia 2 de 5: [etiqueta]» al cambiar; cada imagen tiene `alt` = etiqueta + línea 1.
- Editor de temas: seleccionar un bloque «Historia» abre el visor en esa historia.

## Psicología de venta

- **Objeción:** «¿cómo es en la vida real?», «¿me servirá?» y «¿es una tienda real?».
- **Familiaridad:** el formato de historias es el que el público usa a diario.
- **Curiosidad:** el aro de color dice «hay algo sin ver»; al verlo se apaga.
- **Continuidad anuncio → tienda:** menos disonancia y rebote.
- **Exposición pasiva:** con avance automático, cinco historias son unos 25 segundos de demostración sin decidir nada; las barras invitan a terminar.
- **Cierre sin riesgo:** la última historia lleva el llamado («Pedir y pagar al recibir»).

La referencia horneaba el texto dentro de imágenes generadas con IA («recomendado por nuestros expertos» sobre una persona generada), no tenía toques, pausa ni cierre con gesto, usaba una librería de carrusel y cargaba todos los videos desde el inicio. Aquí el texto es HTML, los medios son reales, los gestos son los de Instagram y los videos se cargan al abrirse.

## Reglas del copy (IA)

- Título: «verbo de ver + contexto» («Míralo en acción»), ≤ 32.
- Etiqueta: 1-2 palabras, sustantivo o momento de uso, ≤ 16. Nada de frases.
- Línea 1: contexto o beneficio observable, ≤ 28. Línea 2: el remate en acento, ≤ 24.
- Secuencia de 4 a 6: gancho → cómo se usa → detalle → uso diario → cierre con CTA. Cada texto describe lo que se ve en su medio.
- `cta_label`: verbo + riesgo cero COD, ≤ 22, solo en la última (máximo 2).
- **Prohibido:** expertos, médicos o kinesiólogos sin respaldo; «clientes felices», reseñas o citas sobre medios que no son UGC real; presentar una persona generada con IA como cliente o experto; cifras o escasez; claims de salud (Ley 19.496 arts. 28 y 33; regla FTC 2024 como referencia).
