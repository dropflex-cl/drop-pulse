# Componentes de conversión para Shopify

Secciones y bloques de alta conversión para la página de producto, **propios y portables entre temas**. Se escriben una vez aquí y se copian a cada tema con `npx tsx scripts/shopify-components.ts [--theme <nombre>]`. Principios y mecanismo de publicación: [`docs/spec-tema-shopify.md`](../../../docs/spec-tema-shopify.md).

Los patrones vienen del análisis funcional de una demo comercial (Sternify). **No se copió código, CSS ni textos**: se replicó la función y la psicología, con nuestro código, y se corrigió lo que la referencia hacía mal (escasez y reseñas inventadas, accesibilidad, peso en móvil).

## Catálogo

| Id | Tipo | Dónde va | Metafield (IA) | Datos reales |
|---|---|---|---|---|
| `inventory` | bloque | entre precio y botón | `dropflex.inventory` | inventario de la variante, logística |
| `shipping-timeline` | bloque | bajo el botón | `dropflex.shipping_timeline` | logística, feriados, zona horaria |
| `benefit-usps` | bloque | entre precio y botón | `dropflex.benefit_usps` | políticas reales de la tienda |
| `benefit-double-box` | bloque | bajo el botón | `dropflex.benefit_double_box` | medios de pago y garantía reales |
| `review-stars` | bloque | sobre el título | `dropflex.review_stars` | promedio y cantidad de reseñas |
| `gif-strip` | bloque | bajo el botón | `dropflex.gif_strip` | GIFs subidos en Imágenes |
| `review-slider` | bloque | bajo el botón | `dropflex.review_slider` | reseñas aprobadas |
| `ugc-slider` | bloque | bajo el botón | `dropflex.ugc_slider` | videos subidos |
| `scrolling-benefits` | sección | franja entre secciones | `dropflex.scrolling_benefits` | políticas reales |
| `stats-with-image` | sección | hero de la landing | `dropflex.stats_with_image` | calificación, cifras, fotos |
| `image-with-benefits` | sección | cuerpo de la landing | `dropflex.image_with_benefits` | foto del producto |
| `comparison-table` | sección | cuerpo de la landing | `dropflex.comparison_table` | aprobación humana |
| `faq-and-text` | sección | antes del cierre | `dropflex.faq_and_text` | políticas (plazos, cobertura) |
| `insta-story` | sección | cuerpo de la landing | `dropflex.insta_story` | imágenes y videos subidos |

Fuera del catálogo, `_landing/` tiene lo que hace de la tienda la landing de un producto (modo landing, design system de DropFlex y los bloques de la ficha: prueba social, bajada, precio, packs y nota de confianza). No lleva contenido de la IA; ver su `README.md`.

El detalle de cada uno (datos que necesita, comportamiento, psicología y reglas del copy) está en su `README.md`; lo que la app consume está en su `content.ts`.

## Estructura de un componente

```
lib/shopify/components/
  define.ts              contrato TypeScript (ConversionComponent, ICON_KEYS)
  catalog.ts             registro de todos los componentes (lo usa la app y el test)
  _shared/               base común: tokens, íconos, estrellas, carrusel
  <id>/
    blocks/df-<id>.liquid | sections/df-<id>.liquid
    snippets/df-<id>-*.liquid        (opcional)
    assets/df-<id>.js                (opcional; CSS va en {% stylesheet %})
    content.ts                       lo que escribe la IA: esquema zod + reglas + ejemplos
    README.md                        datos, comportamiento, psicología, reglas del copy
```

Las carpetas `sections/`, `blocks/`, `snippets/` y `assets/` replican las de un tema: el script las aplana sin renombrar. Todo archivo empieza con `df-`; el script borra del tema los `df-*` que ya no existen aquí.

## Reglas

1. **Portables.** Nada importa JS del tema (`@theme/*`) ni usa sus snippets (`spacing-style`, `contrast-override`…). Colores, radios y fuentes salen de los tokens `--df-*` de `_shared/assets/df-components.css`, que leen las variables del tema con un respaldo neutro. Clase raíz `df` en todo componente.
2. **Contenido: metafield → editor → nada.** Cada componente lee `product.metafields.dropflex.<key>.value` (lo que genera la IA). Si falta, usa los ajustes o bloques del editor. Si tampoco hay, no renderiza nada (en el editor, `request.design_mode`, puede mostrar un aviso `.df-placeholder`).
3. **Los hechos no los escribe la IA.** Inventario, cantidades, calificaciones, cantidad de reseñas, reseñas, fechas, plazos, precios, políticas y archivos salen de datos reales (Liquid, metafields de la app, ajustes de logística). La IA escribe textos con tokens (`{qty}`, `{min}`, `{max}`, `{count}`, `{rating}`, `{time}`) que la tienda reemplaza. Si el dato real falta, el componente cae a un texto sin el dato o no se muestra.
4. **Texto plano y escapado.** Todo texto de metafield se imprime con `| escape`. Negrita solo con `**…**` convertido en Liquid, nunca HTML del modelo. Las imágenes van en su propio metafield `file_reference`, nunca como URL dentro del json.
5. **Producto:** en bloques, `assign product = closest.product | default: product`. **Nunca un ajuste `product` propio en un bloque**: `closest.product` toma primero el ajuste de producto del mismo bloque y, vacío, deja el bloque sin producto (en v2 eso ocultó precio, packs, reseñas y bajada en la ficha). En secciones, `product` si existe, si no un ajuste `product`.
6. **Acento por producto:** `style="{% render 'df-accent-vars', product: product %}"` en la raíz. Colores de significado fijos (`--df-positive`, `--df-warning`, `--df-negative`, `--df-info`, `--df-star`) para lo que no puede cambiar con la marca.
7. **Íconos:** `{% render 'df-icon', name: … %}` con una clave de `ICON_KEYS`. Agregar un ícono = snippet + `ICON_KEYS`.
8. **Carruseles:** `<df-slider>` de `_shared` (scroll-snap nativo). Nada de Swiper ni librerías.
9. **Variante:** los bloques que dependen de la variante escuchan `shopify:product:select` (evento estándar de Shopify) y, como respaldo, el `change` del formulario `/cart/add`. Datos por variante embebidos en `<script type="application/json">`. Nada de sondeo.
10. **Accesibilidad (WCAG 2.1 AA):** listas semánticas, íconos `aria-hidden`, controles de 44 px, `prefers-reduced-motion` apaga toda animación, autoplay con pausa (hover, foco, fuera de pantalla, pestaña oculta), diálogos con `<dialog>` nativo, texto mínimo de 12 px, contraste 4.5:1.
11. **Rendimiento:** imágenes con `image_url` + `image_tag` con `widths`/`sizes` y `loading: 'lazy'` salvo arriba del pliegue; videos con `preload="none"` y póster; JS con `defer`, sin dependencias.
12. **CSS y JS en el nivel superior:** `{% stylesheet %}`, `{% javascript %}` y `{% schema %}` nunca van dentro de un `{% if %}` o un `{% for %}`. Shopify descarta el archivo al importar y se lleva cada template que lo usa (todas las fichas en 404); `shopify theme check` no lo avisa. Lo revisa `lib/shopify/publish/template-rules.test.ts`.
13. **Schema:** nombre de sección, preset y bloque ≤ 25 caracteres; **nunca `"default": ""`** (se omite); textos del editor en español neutro. Estas dos reglas dejaron en 404 todas las fichas en v1: las revisa el test de catálogo.

## Cómo agregar uno

1. Carpeta `<id>/` con el Liquid (siguiendo `inventory/` como ejemplo), `content.ts` con `defineComponent` y `README.md`.
2. Registrarlo en `catalog.ts`.
3. `npm test` (catálogo: archivos, íconos, schema, ejemplos) y `npx tsx scripts/shopify-components.ts`.
4. Probar en una tienda de desarrollo: claro y oscuro, 375 px y escritorio, sin metafield (respaldo del editor) y con metafield.
