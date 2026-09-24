# scrolling-benefits — Cinta de beneficios

Sección de ancho completo: una franja delgada con beneficios de servicio (ícono + texto corto) que se desplaza sin fin. Archivo: `sections/df-scrolling-benefits.liquid` + `snippets/df-scrolling-benefits-item.liquid` + `assets/df-scrolling-benefits.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Justo bajo el bloque de compra o la galería, o entre dos secciones largas como separador. No pide lectura: se escanea en menos de dos segundos mientras el comprador hace scroll, y le recuerda las garantías (pago al recibir, plazo, cambios, soporte) en el momento en que aparece la duda, sin cortar el ritmo de la página.

## Anatomía

- Franja con fondo suave (`--df-surface` o el color del editor) y relleno vertical configurable. Título opcional centrado con una palabra destacada (`**…**`, color `--df-accent-ink`), oculto por defecto.
- Pista horizontal: ítems en fila, separación configurable (48 px por defecto). Cada ítem: ícono de línea (28 px en escritorio, 24 px en móvil) + texto de 14 px (13 px en móvil) sin cortes de línea.
- Bordes desvanecidos con `mask-image` (80 px en escritorio, 40 px en móvil): funciona sobre cualquier fondo.
- Botón de pausa de 44 px al final de la franja (ícono pausa ↔ play, `aria-pressed`).
- Móvil (375 px): caben 1,5 a 2 ítems; el movimiento comunica que hay más. Escritorio: 4 a 6 ítems visibles.
- Quieta (menos de 3 ítems o `prefers-reduced-motion`): una fila centrada que se envuelve, sin copias ni botón.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.scrolling_benefits` (IA) | `heading?`, `items[]` con `icon`, `text` y `requires?` |
| Bloques «Beneficio» del editor | respaldo: ícono, texto y «Solo si la tienda tiene» (máx. 8) |
| Ajustes de la sección | producto fuera de la ficha, título visible, velocidad (px/s), dirección, pausa con puntero, bordes, colores, tamaños, rellenos |
| `shop.metafields.dropflex.policies` (real) | `cod`, `free_shipping`, `free_shipping_threshold` → `{threshold}`, `return_days` → `{return_days}`, `warranty_months` → `{warranty_months}`, `whatsapp` |
| `shop.metafields.dropflex.logistics` (real) | preparación + tránsito → `{min}` y `{max}` (días hábiles) |

`requires` ata el ítem a una política (`cod`, `free_shipping`, `returns`, `warranty`, `whatsapp`, `delivery`). Si la política falta o es falsa, o si un token del texto no tiene dato, el ítem **no se dibuja**. Si no queda ningún ítem, la sección no se muestra (en el editor, un aviso).

## Comportamiento

- Liquid dibuja el set de ítems y una copia con `aria-hidden="true"` e `inert`; el CSS anima la pista de 0 a −50 % con una duración estimada, así que sin JS ya se mueve.
- `<df-scrolling-benefits>` mide el ancho real de un set, clona los que falten para cubrir la pantalla y fija `--df-marquee-shift` (un set en px) y `--df-marquee-duration` = ancho ÷ velocidad: la velocidad en px/s es la misma con textos cortos o largos. Recalcula con `ResizeObserver` (150 ms).
- Pausa: botón visible (WCAG 2.2.2, el movimiento dura más de 5 s), puntero encima (opcional), foco dentro, fuera de pantalla (`IntersectionObserver`), pestaña oculta y bloque seleccionado en el editor de temas.
- Solo se anima `transform` (`will-change`), sin librerías. Íconos SVG en línea, sin peticiones de imagen.
- El set original es una `<ul role="list">` que el lector de pantalla lee una vez; las copias son invisibles para él.

## Psicología de venta

- **Objeción:** «¿llegará?», «¿y si no me sirve?», «¿es seguro comprarle a una tienda que no conozco?».
- **Reducción de riesgo:** en pago contra entrega, «pagas al recibir» elimina el miedo a la estafa; va primero.
- **Fluidez cognitiva:** 2 a 5 palabras con ícono se procesan en la visión periférica.
- **Mera exposición:** el loop repite los mismos mensajes y la repetición aumenta la sensación de verdad. Por eso cada ítem debe ser verdadero: aquí se comprueba contra las políticas reales antes de dibujarlo.
- **Saliencia por movimiento y legitimidad:** la banda capta la mirada sin interrumpir y es un formato típico de marcas establecidas.

La referencia escribía los plazos a mano, repetía «Placeholder Icon» como alt en cada copia, no tenía pausa ni versión para movimiento reducido y su velocidad dependía del largo de los textos. Aquí no.

## Reglas del copy (IA)

- Fórmula por ítem: `[dato real como token, opcional] + [beneficio de servicio]`: «Pagas al recibir», «Llega en {min} a {max} días hábiles», «Cambio sin costo en {return_days} días», «Atención por WhatsApp».
- Orden: pago al recibir → envío → cambio o garantía → soporte → un atributo del producto (opcional).
- 3 a 6 ítems de largo parecido (12 a 26 caracteres, máximo 32 con los tokens reemplazados), sin verbos cuando se pueda, sin punto final, sin exclamaciones ni emojis.
- Todo número es un token y todo ítem que menciona una política declara `requires` (el esquema lo exige).
- **Prohibido:** «n.º 1», «el mejor», «el más vendido», «100 % garantizado», «envío inmediato», «24/7» sin respaldo, presentar la garantía legal como extra, claims de salud (Ley 19.496, arts. 28 y 33).
