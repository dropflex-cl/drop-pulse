# Análisis: humanizar el video UGC

> Estado: **análisis** (2026-10-01). Nada implementado todavía.
> Problema: el video UGC (Creativos › Videos, `docs/spec-video-ugc.md`) sale bien, pero se nota que es IA: la luz y las tomas parecen de estudio profesional, no de un UGC doméstico.
> Toca: `lib/video/render.ts`, `lib/video/prompts.ts`, `lib/video/schemas.ts`, `lib/video/catalog.ts`, `scripts/ugc-montage.py`.

## 1. Diagnóstico: de dónde sale el aspecto de estudio

No hay una sola causa: el aspecto de estudio aparece en cada capa del pipeline, y la principal es la imagen de partida.

### 1.1 La imagen clave manda, y la hace un modelo de publicidad

Seedance (tomas habladas) y Kling (B-roll) son *image-to-video*: copian la luz, el lente, el desenfoque y el encuadre del primer cuadro. Ese cuadro lo genera `marketing-studio/image/flare` (`KEYFRAME_ENDPOINT`, `lib/video/catalog.ts`), un modelo hecho para piezas de marketing pulidas.

Además, la parte fija del prompt que pide «foto de teléfono» es una sola línea genérica (`PHOTO` en `lib/video/render.ts`):

> Vertical 9:16 realistic smartphone UGC photo, unpolished, natural light, like a frame from a TikTok video.

En cambio, la escena que escribe Claude tiene entre 40 y 90 palabras (`keyframe.prompt` en `lib/video/schemas.ts`), y ahí suelen aparecer frases como «soft morning light». Pesa más la escena de Claude que esa línea fija.

### 1.2 El prompt del guionista empuja hacia lo «lindo»

- `PICTURES` en `lib/video/prompts.ts` dice «ventana con luz de mañana»: justo la luz dorada y favorecedora que delata a la IA.
- Nada pide fondos desordenados, una persona común, piel con textura o ropa gastada.
- Como `persona` y `character.look` salen del cliente ideal, el modelo tiende a describir a alguien con cara de modelo.

### 1.3 El B-roll pide tomas de comercial

- `STRUCTURE` sugiere «el producto en macro»; el macro es lenguaje de anuncio.
- Kling tiende a la cámara lenta cinematográfica. `B_ROLL_NEGATIVE` (`lib/video/render.ts`) excluye texto y manos de más, pero no excluye lo cinematográfico, el desenfoque de fondo ni la cámara lenta.
- `bRollRequest` solo agrega «Realistic handheld smartphone footage».

### 1.4 La cámara de las tomas habladas queda a criterio de Claude

`aRollRequest` solo fija «Handheld vertical smartphone selfie video». El movimiento real (`motion`) lo escribe el modelo y Seedance lo suaviza, así que termina pareciendo estabilizador.

### 1.5 El montaje entrega una imagen y un audio demasiado limpios

El estilo de edición de `scripts/ugc-montage.py` (subtítulos palabra por palabra, zoom por frase, entrada de golpe del B-roll) sí es nativo de TikTok y conviene mantenerlo. Lo que delata es el material: sin grano, nitidez perfecta y una voz sin el eco de la habitación ni el ruido de un micrófono de teléfono.

## 2. Propuesta, de menor a mayor costo

### A. Un bloque fijo de «teléfono real» en el código (`lib/video/render.ts`)

Reemplaza la línea `PHOTO` por una descripción concreta, siempre igual (la arma el código, no el modelo):

- Cámara frontal a un brazo de distancia, lente gran angular con leve deformación en los bordes.
- Todo el fondo enfocado (un teléfono no desenfoca el fondo como un lente de estudio).
- Luz mezclada: ampolleta cálida del techo más la luz de una ventana; la ventana algo quemada y ruido en las sombras.
- Encuadre levemente torcido o con la cabeza un poco cortada.
- Persona: piel con poros y tono disparejo, ojeras, pelo suelto, ropa de casa.
- Fondo vivido: una toalla, frascos, un cable, algo sin ordenar.

Va **en positivo**: el repo ya aprendió que «el modelo dibuja lo que se nombra, aunque vaya negado» (regla de la mascota en `lib/video/prompts.ts`). Se describe lo que la foto *es*, no lo que no es.

### B. Ajustar el prompt del guionista (`lib/video/prompts.ts`)

- **Lugares:** vividos en vez de estéticos (el baño con cosas en el lavamanos, el auto, la cocina), sin «luz de mañana».
- **Persona:** una persona común del segmento, no una modelo; `look` con rasgos reales.
- **Actuación:** menos ensayada; a veces mira fuera de cámara, gestos que se interrumpen, se acomoda el pelo.
- **B-roll:** en primera persona, como si la misma persona grabara con la otra mano mirando hacia abajo (el producto sobre el lavamanos, la mano aplicándolo), en vez de macro.
- **Líneas:** permitir muletillas naturales («mira», «o sea») dentro del tope de palabras por segundo (`WORDS_PER_SECOND_PROMPT`).

Esto sube `UGC_PROMPT_VERSION` (`lib/video/schemas.ts`).

### C. Video (`lib/video/render.ts`)

- **Kling:** sumar a `B_ROLL_NEGATIVE` lo cinematográfico (*cinematic*), el desenfoque de fondo (*bokeh, shallow depth of field*), la cámara lenta (*slow motion*), la luz de estudio (*studio lighting*) y la corrección de color (*color grading*). Es un campo negativo: ahí sí sirve nombrarlo.
- **Seedance:** un bloque fijo de cámara de teléfono en `aRollRequest`: microtemblor de la mano, pequeños reencuadres, exposición automática que se ajusta.

### D. Control de calidad de las imágenes clave

Sumar al QA (`keyframeQaSchema` y su prompt) un criterio de «parece foto de estudio o de campaña» para que reintente antes de gastar en clips. Esto sube `KEYFRAME_QA_PROMPT_VERSION`.

### E. Un look de teléfono en el montaje (`scripts/ugc-montage.py`)

Una opción (`--look phone`, a decidir si va por defecto):

- **Imagen:** grano leve, nitidez y saturación un poco más bajas, una leve variación de exposición.
- **Audio:** un poco de eco de habitación con ruido de fondo bajo la voz.

Es gratis y se puede probar **sobre el video que ya existe**, sin regenerar nada.

### F. Prueba de modelo (aparte)

`docs/spec-creativos.md` ya tenía previsto **Soul 2** de Higgsfield (`higgsfield-ai/soul/v2/standard`) para el personaje: está orientado al realismo, tiene estilos que se leen desde la API (nunca se hardcodean) y cuesta unos US$0,003 por imagen.

La prueba sería generar K1 con Soul 2 y mantener Flare, con K1 de referencia, para las escenas con producto (Flare respeta la foto base del producto). Si las escenas sin producto también salen mejor con Soul, la consistencia de la cara pide Soul ID (US$2,50 por personaje).

Es una hipótesis: hay que probarla con la clave del comerciante antes de cambiar el pipeline.

## 3. Cómo validarlo sin gastar mucho

1. **E primero, gratis:** correr el montaje con el look de teléfono sobre el paquete del video actual y comparar.
2. **A, B, C y D:** con un guion ya aprobado, regenerar solo las imágenes clave (centavos) y compararlas lado a lado con las actuales **antes** de gastar los ~US$9 de Seedance.
3. **Clips:** si las imágenes clave convencen, rehacer una sola toma hablada y un B-roll para confirmar que el movimiento de cámara no vuelve a sentirse de estudio.
4. **F:** prueba aparte, solo K1, con Soul 2 frente a Flare.

## 4. Lo que no cambia

El objetivo es que el video se vea natural, no hacerlo pasar por una clienta real. El rótulo «Dramatización» durante todo el video y la regla de no presentar a la persona como clienta, testimonio o experta se mantienen: los exige el propio repo (`RULES` en `lib/video/prompts.ts`, `docs/spec-video-ugc.md`) y, para personas generadas con IA, también las políticas de Meta.

## 5. Recomendación

Implementar A a E juntos en una rama y dejar F como una prueba aparte.
