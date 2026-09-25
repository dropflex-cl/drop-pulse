# pain-block — Lo que te pasa

Bloque de dolor: «¿Esto es para mí? ¿Entienden lo que me pasa?». Un título, **exactamente 3 momentos** del cliente (uno por ángulo de venta) y un remate que lleva del dolor al diferenciador del producto. Archivo: `sections/df-pain-block.liquid`. Contrato: [`content.ts`](content.ts). Origen: `docs/spec-angulos-testeo.md` › 5.3.

## Dónde va y por qué

Primer bloque del cuerpo: después de la galería y la ficha y **antes de `image-with-benefits`**. La página recibe tráfico de 3 anuncios distintos; antes de explicar el producto, quien llega desde cualquiera se reconoce en una escena suya. Recién después la foto con razones responde «¿qué tiene de especial?».

## Anatomía

- **Título** centrado (`h2`), una pregunta de reconocimiento («¿Te pasa esto frente al espejo?»). `**palabra**` va en el color del acento.
- **Momentos** (`ul` semántica, 3 como máximo): cada uno es una tarjeta suave (`--df-surface`) con una marca del acento (`df-accent-vars`), su título (`h3`) y 1 o 2 oraciones. `**…**` → `<strong>`.
  - **Móvil y tablet:** lista vertical, marca vertical a la izquierda.
  - **Escritorio (≥ 990 px):** 3 tarjetas en columnas con la marca arriba (ajuste «Momentos en escritorio» = «Tres tarjetas», por defecto) o la misma lista vertical («Lista»).
- **Remate** centrado, en la fuente de títulos y más grande, bajo un filete corto del acento: es el paso del dolor al producto.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.pain_block` (IA) | `heading`, `moments[]` con `slot` (1..3, el ángulo al que le hace puente; no se muestra), `title`, `text` (3), `bridge` |
| Ajustes y bloques «Momento» del editor | respaldo: título (por defecto «¿Te pasa esto?»), remate y hasta 3 momentos |
| Ajustes de la sección | producto fuera de la ficha, diseño en escritorio, tamaño del título, colores, rellenos |

No hay datos reales: es solo texto, sin cifras, plazos ni tokens. Sin imagen en v1 (la spec deja una foto opcional para más adelante). Sin momentos, la sección no se muestra (en el editor, un aviso).

## Comportamiento

- Estática, sin JS y sin animaciones (nada que apagar con `prefers-reduced-motion`).
- Orden del DOM = orden de lectura: título → momentos → remate. La marca es decorativa (`aria-hidden`).
- Texto mínimo de 15 px; el texto del momento usa `--df-muted` sobre `--df-surface` (contraste AA del design system).
- Todo texto del metafield se imprime escapado; la negrita sale de `**…**` convertido en Liquid.

## Psicología de venta

- **Reconocimiento:** una escena concreta con las palabras del cliente hace sentir «me entienden».
- **Un momento por ángulo:** cada anuncio del testeo encuentra su escena en la página común.
- **Dolor antes que producto:** la solución vale más con el problema ya nombrado.
- **Puente al diferenciador:** el remate dice qué faltaba; la página sigue con el producto que lo trae.

## Reglas del copy (IA)

- **Título:** pregunta de reconocimiento, 8 a 48 caracteres.
- **Momentos:** exactamente 3, `slot` distintos (uno por ángulo de venta; sin tercer ángulo, el tercero sale de los momentos del cliente ideal).
  - `title`: la escena en 3 a 6 palabras, 8 a 40 caracteres.
  - `text`: 1 o 2 oraciones, 30 a 160 caracteres, en **primera** («me lavo la cara…») o **tercera persona** («quienes ya usan crema…»), con palabras de `voice_of_customer` y `trigger_moments` del cliente ideal.
- **Remate** (`bridge`): 20 a 120 caracteres; lleva al **diferenciador**, no a la oferta.
- Sobrio: sin exclamaciones ni mayúsculas sostenidas.
- **Prohibido:** diagnosticar al lector («tienes la piel deshidratada»), cifras y plazos (validado: sin dígitos), promesas de resultado y afirmaciones de salud, humillar («tu cara se ve vieja»), segunda persona sobre edad, salud o peso.
