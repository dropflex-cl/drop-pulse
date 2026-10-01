# Movimiento en la tienda: animaciones sutiles y feedback

Spec para los componentes de Shopify de DropFlex v2 (`lib/shopify/components/`: los 16 del catálogo, `_landing/` y `_shared/`). Parte de un análisis del código al 2026-10-01 (commit `975bc76`). **Implementado el 2026-10-01** (las tres fases); ver §8 para lo que cambió respecto de la propuesta y lo que falta probar.

El objetivo no es «que se vea más animado». Es que la ficha:

- responda a cada toque;
- muestre dónde cambió algo (precio, pack, disponibilidad);
- dé ritmo a las 8 secciones bajo la ficha;
- deje de competir con el botón de compra.

Todo con las reglas que ya rigen los componentes ([README](../lib/shopify/components/README.md), regla 10) y el movimiento del design system: `design-system/README.md`, 120/200/320 ms, un solo movimiento continuo.

---

## 1. Diagnóstico

### Lo que ya está bien (se conserva)

| Dónde | Qué |
|---|---|
| `faq-and-text` | Acordeón con `::details-content` + `interpolate-size`. El + gira a −. Sin soporte, abre sin animar. |
| `comparison-table` | El latido corre 3 veces al entrar en pantalla y se detiene. Es el patrón a copiar. |
| `df-gallery` | Fundido de 450 ms entre fotos. El avance automático se pausa por todo. |
| `df-easysell` (brillo del botón) | Dos pasadas en unos 3 s, hasta 3 veces por visita. Cumple WCAG 2.2.2. |
| `df-slider` | Autoplay con pausa por puntero, foco, pestaña oculta, fuera de pantalla y movimiento reducido. |
| `df-downsell` | Hoja que sube en móvil (320 ms) y modal que escala en escritorio (200 ms). |
| `scrolling-benefits` | Solo anima `transform`. Botón de pausa. Velocidad constante en px/s. |

### Hallazgos

**H1. Dos bucles infinitos junto al botón de compra.**
- `df-inventory`: el halo del punto (`df-inventory-ping 1.4s infinite`).
- `df-shipping-timeline`: la línea punteada que marcha (`df-shipping-timeline-march 0.9s infinite`).

Ninguno tiene pausa, así que rompen la regla 10 del README y WCAG 2.2.2 (algo que se mueve solo más de 5 s). También le quitan atención periférica al botón, justo en la zona donde se decide la compra.

**H2. Demasiado movimiento a la vez en la ficha.** En escritorio, con la galería fija, la columna de datos puede tener en pantalla al mismo tiempo:
- el avance automático de la galería (4 s);
- el halo del inventario;
- la línea del envío;
- el brillo de EasySell;
- el carrusel de reseñas (5 s);
- los GIF.

El design system pide un solo movimiento continuo a la vista.

**H3. El precio cambia sin aviso.** Al elegir un pack, `df-price.js` reemplaza el texto del monto, el tachado y el sello de ahorro de golpe. Es el momento de mayor decisión de la página («¿2 o 3 unidades?») y el ojo no ve qué cambió.

**H4. La tarjeta de pack no tiene marca visible.**
- El radio real está con `opacity: 0` encima de la tarjeta (`df-pack-offers__radio`).
- La elegida solo cambia el borde y el fondo (120 ms).
- No hay un círculo o check que diga «esta», como en BundlePicker del design system y en los packs de EasySell.

**H5. Las 8 secciones bajo la ficha aparecen planas.** Nada acompaña la entrada al desplazarse:
- `pain-block`;
- `stats-with-image`;
- `image-with-benefits`;
- `insta-story`;
- `review-wall`;
- `comparison-table`;
- `faq-and-text`.

En móvil es un scroll largo sin ritmo. El dolor (`pain-block`) y la prueba (`review-wall`) se leen como un solo bloque gris.

**H6. Los visores se abren y cierran de golpe.** Los `<dialog>` de `insta-story` y `ugc-slider` no tienen transición, aunque la oferta de salida sí la tiene. La misma acción (abrir algo encima de la página) se siente distinta según el componente. El cierre no se anima en ninguno, tampoco en el downsell.

**H7. En el teléfono, los toques no dan respuesta.** El tráfico es casi todo de teléfono (anuncios de Meta y TikTok), pero los efectos que existen son de `:hover`:
- el play de UGC;
- el aro de las historias;
- la flecha del botón del hero;
- el botón de «Ver más testimonios».

Las tarjetas de pack, los círculos, las tarjetas de video, las flechas y los puntos no tienen un estado `:active`.

**H8. Los contenidos aparecen o se expanden de golpe.**
- `review-wall`: «Ver más testimonios» descubre 6 publicaciones con `hidden = false`, y «Ver más» quita el `line-clamp` de una sola vez.
- `review-slider`: «ver completa» hace lo mismo.
- `review-stars` y el botón del hero (`df-buy-link`) desplazan hasta su destino, pero al llegar nada confirma dónde estás.

**H9. Las imágenes diferidas aparecen de golpe.** En 4G las fotos de reseñas, los pósters de UGC, las historias y el collage aparecen tarde y sin transición. Solo `gif-strip` y `df-pack-offers` tienen un fondo de reserva (`--df-surface`).

**H10. Sin tokens de movimiento.**
- Los componentes repiten duraciones a mano: 0.2 s, 0.3 s, 0.35 s, 120 ms, 0.9 s, 1.4 s.
- Hay una sola curva (`--df-ease`).
- El design system ya define `fast`/`base`/`slow` y `ease-standard`/`enter`/`exit`.
- Hay dos reinicios de movimiento reducido: 0.01 ms en `df-components.css` y 0 ms en `df-design-system`. No es un error, pero son dos fuentes de verdad.

---

## 2. Principios

1. **El movimiento informa, no decora.** Cada animación responde a una de cuatro preguntas:
   - ¿qué cambió?
   - ¿dónde estoy?
   - ¿lo toqué?
   - ¿qué sigue?

   Si no responde ninguna, no va.
2. **Nada se mueve solo arriba del pliegue al cargar,** salvo la galería y el brillo del botón (ya existen). El primer pantallazo (social proof, estrellas, título, precio, beneficios) se pinta quieto: no afecta el LCP ni distrae del precio.
3. **Presupuesto: un movimiento continuo por pantalla.** Cuentan como continuos el autoplay de un carrusel, la marquesina, el avance de la galería y el brillo del botón. Los GIF y los videos son contenido y no cuentan. Todo lo demás es transitorio: dura 500 ms o menos y termina.
4. **Ningún bucle infinito sin pausa.** Lo que se repite tiene un tope: 3 repeticiones o 5 s. Si dura más, lleva un botón de pausa (regla 10).
5. **Solo `transform` y `opacity`.** La excepción es la altura de lo que se expande (`interpolate-size` o FLIP de alto). Así no hay saltos de diseño (CLS = 0) ni repintados caros en teléfonos de gama baja.
6. **Mejora progresiva.** Sin JS, sin soporte o con `prefers-reduced-motion`, la página se ve completa y quieta, nunca oculta. Nada queda en `opacity: 0` esperando un script.
7. **Honesto.** No se animan cifras de precio: un contador mostraría precios que no existen. No hay toasts de «alguien acaba de comprar» ni contadores en vivo inventados. Esto sigue la línea de los README (Ley 19.496).
8. **Respeta al comerciante y al editor.** Un ajuste global `df_motion` apaga todo lo nuevo. En el editor de temas (`Shopify.designMode`) no hay revelado: todo se ve de inmediato para editar.

---

## 3. Base compartida (`_shared/`)

### 3.1 Tokens (`df-components.css`, en `.df`)

```css
--df-dur-fast: 120ms;     /* presionar, hover, cambiar de estado */
--df-dur-base: 200ms;     /* cambiar un valor, abrir un visor en escritorio */
--df-dur-slow: 320ms;     /* hoja que sube, expandir texto */
--df-dur-reveal: 480ms;   /* entrada de contenido al desplazar (solo en la tienda) */
--df-ease-standard: cubic-bezier(0.2, 0, 0, 1);
--df-ease-enter: cubic-bezier(0, 0, 0, 1);
--df-ease-exit: cubic-bezier(0.4, 0, 1, 1);
--df-ease: cubic-bezier(0.22, 1, 0.36, 1);  /* el de antes, para lo que ya existía */
--df-reveal-distance: 12px;
--df-stagger: 60ms;
```

Los componentes reemplazan sus duraciones escritas a mano por estos tokens (H10). El reinicio de movimiento reducido se unifica en 0 ms (el del design system).

### 3.2 Revelado al desplazar: `data-df-reveal`

**Cómo se marca (Liquid):** `data-df-reveal` en el elemento. El escalonado no se escribe en Liquid: el script pone `--df-i` según el orden de lo que entra **junto** (una fila, una tanda), así un ítem que entra solo no espera.

**Variantes:**
- `data-df-reveal` (sube 12 px y aparece);
- `data-df-reveal="fade"` (solo opacidad);
- `data-df-reveal="scale"` (de 0.98 a 1, para fotos);
- `data-df-reveal="left"` y `="right"` (8 px en horizontal).

```css
.df-reveal-pending {               /* lo pone df-motion.js, solo bajo la ventana */
  opacity: 0;
  translate: 0 var(--df-reveal-distance, 12px);
}
.df-reveal-run {                   /* mientras dura la entrada */
  transition: opacity var(--df-dur-reveal) var(--df-ease-enter),
              translate var(--df-dur-reveal) var(--df-ease-enter),
              scale var(--df-dur-reveal) var(--df-ease-enter);
  transition-delay: calc(min(var(--df-i, 0), 5) * var(--df-stagger));
}
```

**Por qué JS y no solo CSS.** `animation-timeline: view()` evitaría el script, pero:
- ata la animación a la posición del scroll (se rebobina al subir);
- Firefox no la soporta.

Con un script queda una entrada única, con tiempo propio.

**El riesgo de ocultar con un script diferido.** Un elemento a la vista quedaría invisible hasta que corra el script. La regla para evitarlo: **el script solo oculta lo que en ese instante está bajo la ventana.**

**`_shared/assets/df-motion.js`** (sin dependencias; cada componente que lo use lo carga con `defer`, igual que `df-slider.js`):

1. Sale sin hacer nada en estos casos:
   - `prefers-reduced-motion: reduce`;
   - `Shopify.designMode`;
   - `<html data-df-motion="off">` (ajuste del comerciante);
   - el navegador no tiene `IntersectionObserver`.
2. Marca con `df-reveal-pending` cada `[data-df-reveal]` cuyo `getBoundingClientRect().top` está más abajo que la ventana.
3. Un `IntersectionObserver` (`rootMargin: 0px 0px -10% 0px`) quita la marca al entrar y deja de observar. Es una sola vez por visita, sin rebobinar.
4. Mira solo elementos nuevos: un `MutationObserver` atento a nodos con `data-df-reveal`. Así sirve para las secciones que Shopify inserta o recarga.
5. Si `df-motion.js` se carga varias veces (varios componentes), guarda una sola instancia en `window.dfMotion`.

### 3.3 Fundido de imágenes: `data-df-img`

- El contenedor de cada foto diferida lleva `background: var(--df-surface)`.
- El `<img>` lleva `data-df-img`.
- `df-motion.js` marca `df-img-loading` (`opacity: 0`) solo si `img.complete` es falso cuando corre, y la quita en `load` o `error`.
- Sin JS, la imagen se ve como hoy.
- Va solo en imágenes diferidas. Nunca en la galería de la ficha ni en una imagen con `fetchpriority="high"`.

### 3.4 Respuesta al toque: `.df-press`

```css
:where(.df-press) { transition: scale var(--df-dur-fast) var(--df-ease-standard); }
:root:not([data-df-motion='off']) :where(.df-press):active { scale: var(--df-press-scale, 0.97); }
```

Va en todo control que se toca: tarjetas de pack, círculos de historias, tarjetas de UGC, flechas y puntos del carrusel, «Ver más testimonios», botones del hero y del FAQ. En las tarjetas grandes (pack) la escala es `0.985`.

### 3.5 Confirmar el destino: `dfMotion.flash(el)`

Al terminar un desplazamiento a un ancla (`review-stars` → `#resenas`), el destino se ilumina una vez:
- fondo `--df-accent-soft` que se desvanece en 900 ms;
- un pseudo-elemento con `opacity`, así no repinta el contenido.

El desplazamiento termina con `scrollend` y, donde no existe, con un tiempo de respaldo de 600 ms. Con movimiento reducido no hay destello, pero el foco igual pasa al destino, como hoy.

### 3.6 Visores: entrada y salida

Una sola receta para `<dialog>` (insta-story, ugc-slider y df-downsell), con `@starting-style` y `transition-behavior: allow-discrete`, que anima la entrada **y la salida** sin JS:

| Formato | Entrada | Salida | Velo (`::backdrop`) |
|---|---|---|---|
| Hoja en móvil | sube 24 px + aparece, 320 ms `enter` | baja + se desvanece, 200 ms `exit` | aparece en 200 ms |
| Modal en escritorio | de 0.98 a 1 + aparece, 200 ms `enter` | 160 ms `exit` | aparece en 200 ms |
| Flotante (UGC) | sube 16 px desde la esquina, 200 ms | 160 ms | — |

Sin soporte de `@starting-style`, se abre y cierra de golpe, como hoy.

### 3.7 Ajuste del comerciante

- **`df_motion`:** casilla en el grupo DropFlex de `config/settings_schema.json`, «Animaciones de DropFlex», encendida por defecto.
- **Dónde se lee:** `layout/theme.liquid` imprime `data-df-motion="off"` en `<html>` cuando está apagado.
- **En otros temas:** el ajuste no existe y el atributo falta, así que el movimiento queda encendido (regla 1: portable).
- **Qué no toca:** el brillo de EasySell (`df_easysell_motion`) ni el avance de la galería (`df_gallery_autoplay`). Tienen su propio ajuste.

---

## 4. Por componente

Prioridad:
- **P0**: corrige un hallazgo o toca la decisión de compra.
- **P1**: mejora clara.
- **P2**: pulido.

### 4.1 Ficha (columna del producto)

| Componente | Hoy | Cambio | Disparo y duración | P |
|---|---|---|---|---|
| `df-inventory` | Halo infinito | **Halo con tope:** 3 latidos y se detiene; vuelve a latir 3 veces al cambiar de variante. El texto nuevo hace un fundido al cambiar de estado. | Al entrar en pantalla al 50 % (`IntersectionObserver`) y en `shopify:product:select`. 1,4 s × 3. Fundido: `base`. | P0 |
| `df-shipping-timeline` | Línea que marcha sin fin | **Recorrido único:** el hito 1 se marca con el acento; el tramo 1→2 se dibuja (`scaleX` 0→1 desde la izquierda, en el acento) y el hito 2 aparece (de 0.9 a 1). El tramo 2→3 queda punteado y quieto: lo que falta. Al cambiar el minuto, la cifra del contador hace un fundido corto. | Al 50 % visible, una vez. 600 ms + 200 ms. Contador: `base`. | P0 |
| `df-price` | El texto se reemplaza de golpe | **Cambio de monto:** el monto nuevo aparece subiendo 4 px (`el.animate`, WAAPI); el tachado y el sello hacen un fundido; el sello hace un pequeño pop (0.92→1). Sin contador de cifras (principio 7). Solo si el texto cambió. | En `df:pack` y en un cambio de variante. `base` `enter`. | P0 |
| `df-pack-offers` | Borde y fondo, 120 ms, sin marca visible | **Marca de selección:** un círculo de 20 px al inicio de la tarjeta, como un radio; elegido, se llena con el acento y el check entra (de 0.6 a 1 + aparece). La tarjeta lleva `.df-press` (0.985). El borde y el fondo pasan a `base`. El sello «Más vendido» queda quieto. | Al elegir: `fast` para la presión, `base` para el check. También cuando el pack vuelve del formulario de EasySell (`onFormPack`). | P0 |
| `df-benefit-double-box` | Estático | Revelado de las 2 tarjetas, escalonado. Solo en teléfono, donde queda bajo el pliegue. | `data-df-reveal`, `--df-i` 0 y 1. | P2 |
| `df-gif-strip` | Estático, fondo de reserva | Cada fila (título → GIF → texto) entra con revelado. El GIF hace un fundido al cargar (`data-df-img`), sobre el fondo de reserva que ya tiene. | Revelado + fundido. | P1 |
| `df-review-slider` | Desplazamiento suave nativo | «ver completa» expande el alto (receta de §4.3, `review-wall`). La tarjeta y las flechas llevan `.df-press`. El autoplay no se toca. | `slow`. | P2 |
| `df-ugc-slider` | Play que escala con hover; visor de golpe | Visor con la receta de §3.6 (pantalla completa y flotante). Las tarjetas llevan `.df-press` y los pósters `data-df-img`. | §3.6. | P1 |
| `df-review-stars` | Desplaza a `#resenas` | Al llegar, `dfMotion.flash()` sobre el bloque de reseñas. Las estrellas no se animan al cargar (principio 2). | `scrollend`, 900 ms. | P1 |
| `df-social-proof`, `df-hype-badge`, `df-title`, `df-subtitle`, `df-benefit-usps`, `df-social-badge`, `df-trust-note` | Estáticos | **Sin cambios.** Son el primer pantallazo: se pintan quietos. | — | — |

Notas:

- **El presupuesto en la ficha (H2) queda así:**
  - continuos: el avance de la galería, el autoplay de reseñas (con su pausa) y el brillo de EasySell (finito);
  - transitorios: el inventario y el envío, cada uno una sola vez.
- **Lo que el comprador ve al elegir un pack** (H3 + H4), en ese orden:
  1. la tarjeta se hunde;
  2. el check entra;
  3. el precio sube;
  4. el sello hace pop.

  Son cuatro respuestas en menos de 300 ms, todas en la misma zona. Esto es lo que más pesa en la decisión, por eso es P0.

### 4.2 Secciones bajo la ficha

| Sección | Cambio | P |
|---|---|---|
| `pain-block` | Revelado del título. Después, los momentos escalonados (`--df-i`). El filete del remate se dibuja (`scaleX` 0→1 desde el centro, 400 ms) y el texto del remate entra después. El remate es el paso del dolor al producto: tiene que sentirse como una respuesta. | P1 |
| `stats-with-image` | Fotos del collage con `data-df-reveal="scale"` (de 0.98 a 1), escalonadas; columna de texto con revelado. El botón lleva `.df-press` y la flecha conserva su hover. **Contador de cifras opcional (P2):** solo los enteros reales (`return_days`, `warranty_months`, `delivery_days_max`, `review_count`) y la nota con un decimal, de 0 al valor en 900 ms con `enter`, una vez y con `tabular-nums` (sin saltos de ancho). El valor final está en el HTML del servidor (sin JS se ve tal cual) y el lector de pantalla oye solo el final (`aria-label` con el valor; la cifra animada va `aria-hidden`). | P1 / P2 |
| `scrolling-benefits` | **Sin cambios.** Es el movimiento continuo de su pantalla. | — |
| `image-with-benefits` | En escritorio, la foto con `data-df-reveal="scale"`, los beneficios de la izquierda con `="left"` y los de la derecha con `="right"`: convergen hacia el producto. En tablet y móvil, revelado hacia arriba escalonado. | P1 |
| `insta-story` | Círculos con revelado escalonado (`scale`) y `.df-press`. Visor con la receta de §3.6. **Aro visto:** hoy `is-seen` se pone con el visor abierto y el comprador no ve el cambio. Pasa a ponerse al cerrar, con una transición del color del aro de 400 ms: se nota el avance («ya vi 2 de 5»). | P1 (visor) / P2 (aro) |
| `review-wall` | **Publicaciones:** revelado por fila, con `--df-i` = la columna (0–1 en móvil, 0–2 en escritorio), no el índice global, para que una tanda de 12 no espere 12 × 60 ms. **«Ver más testimonios»:** las nuevas entran con revelado escalonado (máximo 6) y el foco sigue yendo a la primera, sin mover la pantalla. **«Ver más» del texto:** FLIP de alto (mide el alto recortado, quita el `line-clamp`, mide `scrollHeight` y anima `height` entre ambos con `el.animate`, `slow` `standard`, y luego `height: auto`). | P1 |
| `comparison-table` | Se conserva el latido (3 veces). Antes, las filas entran escalonadas (40 ms, máximo 8), así el latido llega cuando la tabla ya está completa. | P2 |
| `faq-and-text` | Se conserva el acordeón. Revelado de la columna de texto y del acordeón; botón con `.df-press`. | P2 |

### 4.3 Capas de `_landing`

| Pieza | Cambio | P |
|---|---|---|
| `df-downsell` | Agregar la salida y el velo de §3.6 (hoy solo anima la entrada). | P2 |
| `df-easysell` (formulario de EasySell) | **Fuera de alcance.** No se agrega ninguna transición a nodos de EasySell: sus impresiones se miden con `offsetParent`, sus estilos van inline con `!important` y el repintado ya es delicado. El brillo del botón se queda como está. | — |
| `df-buy-link` (botón del hero) | Al llegar al formulario no hace falta `flash`: el brillo de EasySell ya se dispara cuando el botón entra en pantalla (hasta 3 veces por visita). Solo se agrega `.df-press`. | P2 |
| `df-gallery` | Sin cambios. | — |
| `_event` | Sin cambios. La cuenta regresiva del evento no anima cada segundo. | — |

---

## 5. Fases

1. **Fase 1 (P0): la decisión de compra.**
   - Tokens (§3.1).
   - `df-inventory` y `df-shipping-timeline` sin bucles infinitos.
   - `df-price` con el cambio de monto.
   - `df-pack-offers` con la marca de selección y `.df-press`.
   - Corrige H1, H3, H4 y lo grave de H2.
   - No necesita `df-motion.js`: son transiciones locales o WAAPI dentro del JS de cada bloque.
2. **Fase 2 (P1): ritmo y feedback.**
   - `df-motion.js` con revelado, fundido de imágenes y `flash` (§3.2–3.5).
   - Ajuste `df_motion`.
   - Visores (§3.6).
   - Revelado en `pain-block`, `stats-with-image`, `image-with-benefits`, `insta-story`, `review-wall` y `gif-strip`.
   - Expansión de `review-wall` y `.df-press` en todos los controles.
3. **Fase 3 (P2): pulido.**
   - Contador de cifras, aro visto, filas de la tabla, `faq-and-text`, la doble tarjeta y la salida del downsell.

Cada fase es un `npm run shopify:components` más «Actualizar tema». No toca `templates/product.json` (es del comerciante y no se actualiza): todo entra por los archivos `df-*` y el layout.

---

## 6. Cómo se prueba

- **Tests (`components.test.ts`):**
  - ningún `animation` con `infinite` en `lib/shopify/components/**`, salvo la marquesina de `scrolling-benefits`, que tiene botón de pausa;
  - todo `@keyframes` y todo `transition` de un componente tiene su regla dentro de `prefers-reduced-motion` o usa los tokens (que el reinicio global apaga);
  - `{% stylesheet %}` y `{% javascript %}` siguen fuera de un `{% if %}` (regla 12).
- **Arnés local** (como el de df-downsell): una página con la ficha y las secciones reales, en 375 px y en escritorio. Se revisa:
  - sin JS (todo visible);
  - con JS;
  - con `prefers-reduced-motion` emulado (nada se mueve, nada queda oculto);
  - con `data-df-motion="off"`;
  - con `Shopify.designMode = true`.
- **Métricas:**
  - CLS = 0 con y sin revelado;
  - el LCP no cambia: la foto principal no lleva `data-df-img` ni revelado;
  - en el perfil de rendimiento de Chrome con CPU 4×, ninguna animación genera layout ni paint fuera de su capa.
- **A11y:** `npm run a11y` (ojo: no inicia sesión, así que sirve en el arnés y no en rutas protegidas). El foco de «Ver más testimonios», el `flash` y los visores se prueban con teclado.
- **Tienda de desarrollo, nunca Datazo (qs060z-e7):** elegir pack (ver los 4 pasos de §4.1), cambio de variante, contador del envío al cambiar el minuto, historias y UGC abiertos y cerrados, y el downsell.

---

## 7. Fuera de alcance

- El formulario y los popups de EasySell (§4.3).
- Las animaciones propias del tema Horizon: transición de página, `add_to_cart_animation`, barra fija del tema y hover de tarjetas. Siguen con sus ajustes del tema.
- Transiciones de vista entre páginas: la tienda es una sola ficha (modo landing).
- Microinteracciones con sonido o vibración (`navigator.vibrate`).

---

## 8. Estado (2026-10-01)

Implementado en `lib/shopify/components/` y copiado al tema con `npm run shopify:components`:

- **Base:** tokens, revelado, fundido de imágenes, `.df-press` y la receta de visores en `_shared/assets/df-components.css`; `_shared/assets/df-motion.js` (revelado, imágenes, contador, `enter`, `flash`, `afterScroll`). Ajuste `df_motion` en `config/settings_schema.json` y `data-df-motion="off"` en `layout/theme.liquid`.
- **Fase 1:** `df-inventory` (3 latidos al verse y al cambiar de estado, fundido del texto), `df-shipping-timeline` (tramo hasta el despacho que se dibuja una vez, pop del hito 2, fundido del minuto), `df-price` (monto, tachado y sello) y `df-pack-offers` (marca con check, `.df-press`; también en la vista previa `components/store-preview/listing.tsx`).
- **Fase 2:** revelado en `pain-block` (filete del remate), `stats-with-image`, `image-with-benefits` (desde los costados en escritorio), `insta-story`, `review-wall` (más «Ver más testimonios» y el texto que crece), `gif-strip`, `benefit-double-box`, `comparison-table` y `faq-and-text`; visores de `insta-story` y `ugc-slider` con `df-dialog-motion`; destello de `review-stars`; `.df-press` en tarjetas, círculos, flechas y botones.
- **Fase 3:** contador de cifras en `stats-with-image`, aro visto al cerrar las historias, «ver completa» de `review-slider`, salida y velo del downsell.
- **Tests** (`components.test.ts` › movimiento): ningún `infinite` salvo la marquesina; todo lo que usa `data-df-reveal` o `data-df-count` carga `df-motion.js`.

Cambios respecto de la propuesta:

- `--df-ease` conserva su curva (no se volvió alias de `enter`): no cambia nada de lo que ya existía.
- El escalonado lo decide el script por tanda, no un índice en Liquid (en listas verticales, el índice retrasaba a los últimos aunque entraran solos).
- El hito 1 no cambia de color: el tramo sólido en el acento ya dice «en marcha» sin tocar el estilo de círculos del comerciante.
- El visor de historias usa la variante modal (fundido y escala) también en el teléfono: es de pantalla completa, no una hoja.
- El contador solo corre en las cifras del metafield (hechos reales), no en las escritas en el editor.
- `df-downsell` lleva su propia copia de la receta de visores: no carga `df-components.css`.

Verificado en un arnés local con el CSS y el JS reales (375 px): latidos finitos, tramo del envío, precio y sello al cambiar de pack, marca del pack y estado final con el ajuste apagado, revelado por tanda y limpieza de clases, contador (0 → 1.234 en ~850 ms), «Ver más testimonios» escalonado con el foco en la primera, texto que crece, destello al llegar a `#resenas`, y entrada y salida del visor (la salida mantiene el `display` mientras se desvanece). El panel del navegador estaba oculto, así que `IntersectionObserver` se simuló por geometría y las transiciones se revisaron por sus valores calculados, no a la vista.

**Falta:**
- verlo en una **tienda de desarrollo** (nunca Datazo), en teléfono real y escritorio: el ritmo de las transiciones a la vista, el editor de temas (sin revelado) y Safari (`@starting-style`, `translate`/`scale` sueltos);
- medir CLS y LCP en la ficha real;
- revisar con teclado los visores y «Ver más testimonios».

