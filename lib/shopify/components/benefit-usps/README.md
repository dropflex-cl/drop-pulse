# benefit-usps — Beneficios

Bloque de la columna del producto: de 3 a 5 beneficios transaccionales, cada uno con un ícono y una frase corta. Archivo: `blocks/df-benefit-usps.liquid` (sin JS). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Entre el precio y el botón. El comprador acaba de ver el precio y se pregunta «¿vale la pena, qué riesgo corro?»: pago al recibir, envío, cambios, origen y soporte amortiguan el dolor de pagar antes de llegar al botón. Bajo el botón va `benefit-double-box` con otras objeciones (pago y garantía), para no repetir.

## Anatomía

Igual en móvil y escritorio: una lista (`<ul>`) de filas con ícono de línea de 20 px (o imagen propia de alto fijo y ancho hasta el doble, para banderas o logos) y texto de 15 px; una `**negrita**` opcional por ítem. Unos 76 px de alto con tres ítems.

| Ajuste | Opciones |
|---|---|
| Disposición | lista (por defecto), en línea (con salto), dos columnas |
| Estilo | sin fondo, o tarjeta (`--df-surface`, radio pequeño, 16 px de relleno) |
| Color de íconos | acento del producto (`--df-accent-ink`) o color del texto |
| Medidas | ícono 16-32 px, texto 12-18 px, separación 4-16 px, márgenes |

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.benefit_usps` (IA) | `items[3..5]`: `icon` (clave de `ICON_KEYS`), `text` (≤ 34 visibles), `policy` (política que afirma) |
| Ajustes del bloque | 5 ítems fijos (ícono, imagen propia, texto) como respaldo; diseño |
| `shop.metafields.dropflex.policies` (real) | `cod`, `free_shipping`, `free_shipping_threshold`, `return_days`, `warranty_months`, `whatsapp`: habilitan cada ítem y llenan sus tokens |
| `shop.metafields.dropflex.logistics` (real) | preparación + tránsito → `{min}` y `{max}` |

Tokens: `{min}`, `{max}` (días de entrega), `{return_days}`, `{warranty_months}`, `{threshold}` (monto del envío gratis, con el formato de dinero de la tienda).

## Comportamiento

- Estático: sin JS, sin animación.
- **Filtro de verdad:** cada ítem del metafield declara la política que afirma; si en `policies` no está activa (`cod` falso, sin `return_days`…), el ítem no se muestra. Un ítem con un token cuyo dato falta tampoco (vale también para los textos del editor). Si no queda ninguno, el bloque no ocupa espacio; en el editor muestra un aviso.
- Ícono desconocido → `check`. Máximo 5 ítems; los vacíos se saltan.
- Accesibilidad: `<ul role="list">` (conserva la semántica sin viñetas), íconos `aria-hidden` y las imágenes propias con `alt=""` (decorativas: el texto dice el beneficio).
- Rendimiento: SVG en línea; la imagen propia sale con `image_url` a 48/96 px y sin carga diferida (está en el primer pantallazo).

## Psicología de venta

- **Objeción:** costos ocultos, riesgo («¿y si no me sirve?»), desconfianza hacia una tienda desconocida y «¿tengo que pagar antes?».
- **Reducción de riesgo:** envío, cambio y pago al recibir quitan la fricción financiera justo después del precio.
- **Pagar después:** el pago contra entrega es el equivalente latinoamericano del «paga en 30 días» de la referencia: reduce el dolor de pagar.
- **Endogrupo:** el origen local («Tienda chilena») da confianza por cercanía.
- **Fluidez y regla de tres:** ícono + frase de 3-5 palabras; tres ítems se sienten completos.

La referencia usaba PNG a color con `alt` descriptivos en inglés (ruido para el lector de pantalla), carga diferida en el primer pantallazo y beneficios escritos a mano sin validar. Aquí los beneficios se comprueban contra las políticas reales.

## Reglas del copy (IA)

- Por ítem: «[beneficio concreto] + [cifra real como token]» o «[verbo] + [objeto]». 2-5 palabras, ≤ 34 caracteres visibles, una `**negrita**` opcional.
- Un ítem por objeción, en orden: pago contra entrega, envío, cambios o garantía, origen local, soporte.
- `policy` obligatorio: la política que afirma el texto (`none` si no depende de una).
- Tuteo, afirmativo, sin exclamaciones, mayúsculas sostenidas ni emojis.
- **Prohibido:** beneficios que la tienda no ofrece (oferta vinculante, Ley 19.496), la garantía legal de 6 meses como beneficio propio, superlativos («el mejor», «#1 en ventas»), sellos no demostrables, promesas de salud, cifras escritas.
