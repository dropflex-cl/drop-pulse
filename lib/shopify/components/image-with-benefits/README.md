# image-with-benefits — Foto y razones

Sección «¿Por qué este producto?»: la foto del producto al centro y 4 o 6 beneficios alrededor, como un diagrama que lo explica. Archivo: `sections/df-image-with-benefits.liquid` + `snippets/df-image-with-benefits-item.liquid`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

En la mitad de la landing, después del hero y la primera prueba social y antes de la comparativa o las preguntas. Ahí el comprador ya sabe qué es y busca por qué es mejor: el formato «producto al centro, beneficios alrededor» lo responde como un diagrama técnico.

## Anatomía

- **Título** centrado (`h2`), grande (tamaño del editor, 44 px por defecto) con la fuente de títulos del tema y `clamp()` para no desbordar a 375 px.
- **Escritorio (≥ 990 px):** grilla de 3 áreas `izquierda | foto | derecha` (1 : 2 : 1). Cada lado, la mitad de los beneficios apilados; la foto cuadrada con `object-fit: contain`. Cada beneficio: ícono en un círculo suave del acento → título (`h3`) → texto, centrados o a la izquierda.
- **Tablet (750–989 px):** foto a todo el ancho arriba y las dos listas lado a lado.
- **Móvil (375 px):** foto (máx. 420 px) y una sola lista de beneficios con el ícono a la izquierda, más legible que dos columnas estrechas.
- **Fondo de la foto:** ninguno, círculo suave (`--df-accent-soft`) o tarjeta; ayuda cuando la foto no viene recortada.
- **Sin foto:** los beneficios en dos columnas.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.image_with_benefits` (IA) | `heading` (`{count}` opcional), `benefits[]` con `icon`, `title`, `body` (4 o 6) |
| Bloques «Beneficio» del editor | respaldo: ícono, título, texto (máx. 6) |
| Ajustes de la sección | producto fuera de la ficha, título de respaldo, foto central, usar la del producto, fondo de la foto, alineación, tamaños, colores, rellenos |
| Producto (real) | foto destacada (`product.featured_image`) si el editor no tiene foto |
| Liquid | `{count}` = cantidad de beneficios mostrados |

Los beneficios se reparten mitad y mitad (con un número impar, la izquierda lleva uno más). Sin beneficios, la sección no se muestra (en el editor, un aviso).

## Comportamiento

- Estática, sin JS.
- Orden del DOM = orden de lectura: título → foto → beneficios 1..n (lista izquierda y luego derecha). La grilla solo los ubica en pantalla.
- Foto con `image_url` + `image_tag` (`widths` 360–1200, `sizes` según el ancho), `loading="lazy"` (está bajo el pliegue) y ancho y alto explícitos (sin saltos de diseño).
- Íconos decorativos (`aria-hidden`), textos escapados.

## Psicología de venta

- **Objeción:** «¿qué tiene de especial?», «¿vale lo que cuesta?», en plena evaluación.
- **Mapa mental del producto:** foto y texto asociados en el espacio se recuerdan mejor y dan percepción de ingeniería.
- **Valor por acumulación:** 4 o 6 razones distintas justifican el precio.
- **Fluidez cognitiva:** basta leer los títulos para captar el argumento.
- **Pregunta retórica:** «¿Por qué PosturaFit?» abre curiosidad; la sección la responde y construye marca.

La referencia leía «X icon» en cada ícono, cargaba una fuente decorativa extra solo para el título y su grilla móvil se desordenaba. Aquí los íconos son decorativos, se usa la fuente del tema y en móvil hay una sola lista.

## Reglas del copy (IA)

- **Título:** «¿Por qué [marca o producto]?» o «{count} razones para elegirlo», ≤ 40 caracteres, sin números escritos.
- **Beneficios:** 4 o 6, cada uno de un eje distinto (función principal, comodidad, material, facilidad de uso, versatilidad, cuidado).
  - `title`: 2 o 3 palabras, sustantivo + adjetivo concreto («Tela respirable»), ≤ 24 caracteres, sin punto final.
  - `body`: una oración de 40 a 110 caracteres, característica real → beneficio en tu día, con el momento de uso cuando aplique.
- **Al menos una tarjeta nombra el ingrediente, material o mecanismo que hace la diferencia del producto** (su diferenciador): en Deep Collagen, «Colágeno y péptidos».
- Solo características que están en la ficha del producto; sin números escritos (las medidas exactas quedan en la ficha).
- **Prohibido:** superlativos, porcentajes, «garantizado» sin remitir a la garantía real, claims de salud o terapéuticos («alivia dolores», «corrige la columna»), «aprobado por especialistas», certificaciones sin respaldo (Ley 19.496, art. 28).
