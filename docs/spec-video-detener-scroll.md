# Videos que detienen el scroll: el gancho manda en la apertura y el UGC parece de teléfono

> Estado: **implementado** (2026-10-01, rama `feat/video-apertura-impl`, sobre `feat/video-apertura`, que trae el agente de ganchos). Verificado con tests puros (`lib/hooks/hooks.test.ts`, `lib/video/video.test.ts`) y el montaje con clips sintéticos (inserto, cara, mascota y un paquete versión 1). Pendiente: una corrida real con un producto (guion, imágenes clave y clips con la clave de Higgsfield).
> Sin medición ni A/B en esta versión (decisión del comerciante, 2026-10-01): los patrones de gancho ya vienen de anuncios ganadores (`agentes-creativos/hook-cod-latam.md`).
> Base: `docs/spec-ganchos.md` (el agente de ganchos COD LatAm), `docs/spec-video-ugc.md` y el análisis «Humanizar el video UGC» (2026-10-01). Los dos formatos de video, persona (`ugc`) y mascota (`mascot`), abren con un gancho de ese agente.
> Toca: `lib/hooks/`, `lib/video/` (`catalog.ts`, `prompts.ts`, `schemas.ts`, `render.ts`, `package.ts`), `lib/pipeline/video.ts`, `scripts/ugc-montage.py` y la pantalla de Ángulos. Sin migración.

## 1. El problema

Un video UGC tiene que detener el scroll. Para eso necesita dos cosas que hoy no están garantizadas:

1. **Que los primeros 3 s sean el gancho, completo.** El agente de ganchos entrega una tríada (hablado, texto en pantalla y primera toma), pero el guion solo usa el hablado y el texto. La primera toma queda como una sugerencia al guionista: el código no comprueba que la primera imagen sea esa. Un gancho como «Mira lo que pasa con el vaso» sobre una cara que habla no detiene a nadie: **el gancho tiene que orquestar la primera imagen**.
2. **Que no parezca IA.** La gente pasa de largo lo que parece anuncio, y lo que parece IA es peor: además de no detener el scroll, quita credibilidad. En pago contra entrega eso se paga dos veces: menos pedidos y más rechazo en la puerta. Hoy el aspecto de estudio sale de cada capa (el análisis lo detalla):
   - la imagen clave la hace un modelo de publicidad (`marketing-studio/image/flare`) con una sola línea genérica de «foto de teléfono» (`PHOTO`, `lib/video/render.ts`), y pesa más la escena que escribe Claude («soft morning light»);
   - el guionista pide «ventana con luz de mañana» y «el producto en macro» (`lib/video/prompts.ts`);
   - Kling tiende a lo cinematográfico y nada lo excluye (`B_ROLL_NEGATIVE`);
   - el movimiento de cámara de las tomas habladas lo escribe Claude y Seedance lo suaviza;
   - el montaje entrega imagen y audio demasiado limpios.

Y hay un tercer problema, técnico, que afecta a los dos: **Seedance y Kling son *image-to-video*: el primer cuadro es la imagen clave, casi quieta.** Si el video abre con la toma hablada, el primer medio segundo (el de la saliencia, filtro 1 del agente de ganchos) es una foto.

## 2. Principios

1. **La apertura es un contrato, no una sugerencia.** El gancho elige la primera toma; el guion la ejecuta; el código lo comprueba en cada capa (gancho → guion → imagen clave → clip → montaje).
2. **Solo se promete lo que la IA puede hacer sin mentir.** Una demostración del efecto (el vaso que deja de vibrar, la mancha que desaparece) hecha con IA es una prueba inventada: es engañosa y sube el rechazo en la puerta. Esos ganchos piden grabación real y no van al video con IA.
3. **El aspecto de teléfono lo fija el código, en positivo.** Bloques fijos que describen lo que la foto *es* (el modelo dibuja lo que se nombra, aunque vaya negado: lección de la mascota). Lo que el modelo no debe escribir se rechaza en código, como `RISKY_SHAPE`.
4. **Sin rótulo.** El video no lleva rótulo («Dramatización», «Animación» ni etiqueta de IA): decisión del comerciante del 2026-10-01 (`spec-video-ugc.md` §8). Sigue la regla de fondo: la persona de IA no se presenta como clienta, testimonio ni experta, ni dice su edad.
5. **La mascota también abre con un gancho del agente.** El agente escribe, para cada gancho que encaja, su versión dicha por el personaje y su escena (§3.7); la apertura de la mascota se orquesta y se comprueba igual que la del UGC.

## 3. La apertura (0–3 s)

### 3.1 Qué es

Los primeros 3 s del video: el **hablado** del gancho (≤ 9 palabras), su **texto en pantalla** (≤ 6, desde el segundo 0) y su **primera toma**, que ya tiene movimiento en el primer cuadro.

### 3.2 Tomas que la IA puede hacer

Una lista cerrada (`OPENING_SHOTS`, `lib/hooks/catalog.ts`). Cada una sabe con qué se hace y de qué imagen clave parte:

| `shot` | Qué se ve en el cuadro 0 | Se hace con | Patrones típicos |
|---|---|---|---|
| `selfie_talk` | La persona a cámara, YA en medio del gesto (se inclina, levanta una ceja, levanta el producto) | A1 (Seedance) desde su propia imagen clave | contrario, identidad, curiosidad, dolor en primera persona |
| `pov_hands` | Cámara trasera mirando hacia abajo, la mano con el producto o haciendo la acción | B1 (Kling) | demostración de uso, curiosidad, oferta |
| `problem_scene` | El problema en su lugar real (la lavadora que tiembla, la manguera tensa), sin resultado | B1 (Kling) | dolor, miedo |
| `product_in_place` | El producto donde se usa, en una mano o sobre el lavamanos, nunca en pose de catálogo | B1 (Kling) | curiosidad, novedad |
| `mirror` | Selfie en el espejo, cuerpo entero o medio cuerpo | A1 desde su imagen clave | prueba puesta, identidad |
| `real_footage` | Algo que la IA no puede mostrar sin inventar: el efecto o el resultado, una prueba de estrés, la bodega, un testimonio | Grabación real | demostración del efecto, bastidores, confesión |

`real_footage` no entra al video con IA (§3.3). La mascota tiene su propia toma, `mascot_scene` (§3.7).

### 3.3 El agente de ganchos decide la toma (`lib/hooks`)

- Cada gancho suma `opening_shot` (uno de §3.2) y `first_motion` (qué se mueve en el cuadro 0, en español, para el comerciante). `visual_first_3s` sigue siendo la descripción de la toma.
- El prompt explica las tomas posibles y la regla del principio 2: **una demostración que muestra el efecto o el resultado es `real_footage`**; una que muestra el uso (la mano aplicando, poniendo, abriendo) sí se puede hacer con IA. El lenguaje de la primera toma es de teléfono (cámara frontal, POV, en la casa), nunca «macro», «plano cenital de estudio» ni «cámara lenta».
- `hookProblems` suma: `opening_shot` válido; `real_footage` obligatorio cuando `needs_real_material` no es null y siempre en Bastidores; `first_motion` no vacío; palabras de estudio en `visual_first_3s` y `first_motion` (`studioWord`, §4.3).
- `usableHooks(src, "ai_video")` deja fuera `real_footage`; los estáticos y el texto del anuncio siguen igual. Los ganchos de antes (sin `opening_shot`) valen como `selfie_talk`.
- `HOOKS_PROMPT_VERSION` 2. La pantalla de Ángulos muestra la toma del recomendado («Primera toma (las manos con el producto): …»), «También mascota» y «Necesita grabación real» (en los `real_footage` sin material pendiente: «los videos con IA no lo usan»; los estáticos sí).

### 3.4 El guion ejecuta la apertura (`lib/video`)

`ugcScriptSchema` reemplaza `hook_source` por un objeto:

```ts
opening: {
  hook_source: number | null; // el index del gancho (o null si ninguno servía)
  shot: "selfie_talk" | "pov_hands" | "problem_scene" | "product_in_place" | "mirror" | "mascot_scene";
  keyframe: string;           // la imagen clave del cuadro 0
  first_motion: string;       // EN: qué se mueve desde el cuadro 0
}
```

Reglas nuevas en `openingProblems` (solo al generar, como hoy):

- `shot` es el `opening_shot` del gancho elegido (si `hook_source` no es null).
- `selfie_talk` y `mirror`: `opening.keyframe` es la imagen clave de A1 y **no es K1**. K1 es el retrato neutro que fija la cara; la apertura necesita a la persona en medio del gesto del gancho (una imagen clave más, centavos).
- `selfie_talk` va con `camera` selfie y `mirror` con `camera` mirror.
- `pov_hands`, `problem_scene` y `product_in_place`: existe B1, parte de `opening.keyframe`, se ancla a una de las primeras palabras de A1 (`HOOK_BEAT_MAX_WORD` = 5; el prompt pide las 3 primeras) y tapa entre `B_ROLL_CUT_MIN` y `B_ROLL_CUT_MAX` (1–2 s). El montaje lo pone en el segundo 0. `pov_hands` va con `camera` pov y `product_in_place` muestra el producto. Después entra la cara.
- El primer texto en pantalla se ancla a una de las primeras 5 palabras de A1; el montaje lo muestra desde el cuadro 0.
- La primera frase de A1 tiene ≤ 9 palabras y no lleva muletillas (§4.2).
- `UGC_PROMPT_VERSION` y `MASCOT_PROMPT_VERSION` 7 (las reglas propias de la mascota, en §3.7).
- Los ganchos que recibe el guionista y su toma salen de `openingInput(payload, format)` (`lib/video/prompts.ts`); `scriptProblems(…, opening)` los valida. Al editar un guion no se piden estas reglas (los de antes no traen `opening` ni `camera`).

`hookBlock` (`lib/video/prompts.ts`) da la receta de cada `shot`, y el gancho llega con `opening_shot` y `first_motion`.

### 3.5 La imagen clave de la apertura

- `keyframeRequest` agrega, solo a la imagen clave de la apertura, «This is the very first frame of the video: the action is already happening (…)» con el `first_motion` del guion (`firstFrame` en `lib/video/render.ts`).
- El QA de esa imagen suma `matches_hook`: ¿se ve lo que dice la primera toma del gancho? `keyframeQaUser` le pasa el `first_motion` y la primera frase de A1. Este criterio **bloquea** (con el reintento automático de siempre): si la apertura no muestra el gancho, todo lo demás se paga en vano.

### 3.6 El clip y el montaje de la apertura

- **Abrir con un B-roll** (`pov_hands`, `problem_scene`, `product_in_place`): Kling tiene movimiento cuando la toma empieza; el montaje ya salta el arranque quieto (0,6 s). B1 se pega en el segundo 0 aunque la primera palabra empiece a los 0,2 s.
- **Abrir con la cara** (`selfie_talk`, `mirror`): Seedance abre desde la foto. El prompt de A1 pide la acción en marcha desde el primer cuadro (`first_motion`) y el montaje abre con un acercamiento suave (1,02 → 1,16, que frena al final); antes era un *punch-in* con sacudida, que se veía como un error de cámara. Con un inserto, el prompt de B1 también arranca en movimiento.
- El texto del gancho está en pantalla desde el cuadro 0, no desde que se dice su palabra.
- El paquete sube a `PACKAGE_VERSION` 2 y trae `opening` (`{ shot, insert }`: la clave del B-roll de apertura, o null) y `look`. `scripts/ugc-montage.py` acepta 1 y 2; un paquete versión 1 sale igual que antes.

### 3.7 La mascota abre con el gancho

Hoy la mascota recibe los ganchos del ángulo, pero son de una persona: «Pensé que era puro cuento» o «Como dermatóloga…» no los puede decir una uña. Su apertura la inventa el guionista con el arco de `mascotSystem` («el personaje YA con el problema, en una escena graciosa»). Desde ahora sale del agente de ganchos, como la del UGC.

**El agente de ganchos escribe la versión de la mascota** (`lib/hooks`):

- Cada gancho suma `mascot`: `{ text, on_screen, scene, first_motion }`, o `null` si el patrón no encaja.
  - `text`: el mismo gancho dicho por el personaje sobre sí mismo o «mi dueño», en primera persona, como mucho 9 palabras (el prompt pide 8). Por ejemplo: «Soy la uña que mi dueño esconde en zapatos cerrados».
  - `on_screen`: como mucho 6 palabras.
  - `scene`: la escena graciosa del cuadro 0, con el personaje YA con el problema (asomándose de un zapato cerrado, escondido bajo el pelo).
  - `first_motion`: qué se mueve desde el cuadro 0.
- Encajan dolor, curiosidad, contrario, vergüenza con humor, miedo, identidad y oferta. No encajan los que piden una persona o material real: confesión, autoridad, bastidores, respuesta a comentario y `real_footage`.
- El prompt del agente explica el formato: la parte del cuerpo o la cosa con el problema, personificada, con humor y ternura, nunca asco. La escena describe la situación, no la forma del personaje: la silueta la fija el guionista con sus reglas (`RISKY_SHAPE`, `MASCOT_SHAPE`).
- `hookProblems` suma:
  - al menos 3 ganchos con versión de mascota, en al menos 2 patrones;
  - largos de `text` y `on_screen`;
  - `hookTextProblems` sobre `text` y `on_screen`, más la regla de la mascota: no le habla a quien mira de su cuerpo («tu uña», «tus pies»);
  - `riskyShape` sobre `scene`, ignorando lo negado;
  - `mascot` en `null` en los patrones que no encajan.
- `usableHooks(src, "mascot")` devuelve los usables con versión de mascota, en el mismo orden. Ángulos muestra un chip «También mascota» en esos ganchos.

**El guion de la mascota la ejecuta** (`mascotSystem`, `openingProblems(…, "mascot")`):

- El paso 1 del arco (GANCHO) deja de ser libre: es el gancho elegido. El paso 4 (FINAL FELIZ) sigue retomando el gancho («si se escondía en zapatos, ahora va en sandalias»).
- `opening.shot` es `mascot_scene` y `opening.hook_source` es uno de los ganchos de mascota.
- A1 abre con el `mascot.text` del gancho, con la primera frase de 9 palabras como mucho. El primer texto en pantalla es su `mascot.on_screen` y se ancla a una de las primeras palabras de A1.
- **`opening.keyframe` es la imagen clave de A1 y nunca es K1.** En la mascota, K1 es el personaje SANO que fija su cara. La apertura necesita al personaje con el problema en la escena del gancho: otra imagen clave con `uses_character`, generada con K1 de referencia.
- La imagen clave de la apertura es el cuadro 0 con el `first_motion` (`firstFrame`), y el QA suma `matches_hook`, que bloquea igual que en el UGC. Todas las imágenes clave de la mascota van con `camera` animated.

**El montaje** abre con la mascota hablando (A1). Seedance también parte de la imagen quieta, así que va con el acercamiento suave de la apertura (§3.6; antes un *punch-in* con sacudida).

**No cambia:** el estilo de animación (`ANIMATED`), la voz (`voiceBlock(…, "mascot")`), la silueta segura y los límites de `FORMAT_LIMITS.mascot`. La parte de «que parezca de teléfono» (§4) es solo para el UGC.

## 4. Que parezca de teléfono (solo formato `ugc`)

La mascota no se toca: su `ANIMATED` pide luz cinematográfica a propósito.

### 4.1 Imágenes clave (`lib/video/render.ts`)

Cada imagen clave suma `camera` (lo elige el guionista, lo valida el código) y el render arma un bloque fijo por cámara, en positivo:

| `camera` | Bloque (resumen; el texto exacto vive en `render.ts`) |
|---|---|
| `selfie` | Front phone camera at arm's length, slight wide-angle edge distortion, everything in focus, eye level or slightly above, the top quarter of the frame shows the room behind the head (aire para el texto). |
| `pov` | Rear phone camera held in one hand looking down, the other hand in frame, everything in focus. |
| `propped` | Phone propped on a counter or shelf, a little low and slightly tilted, wider view of the room. |
| `mirror` | Phone visible in the mirror, bathroom or bedroom mirror with small smudges. |

Más un bloque común `HOME_PHONE` que reemplaza `PHOTO`: luz mezclada de la casa (ampolleta cálida y una ventana algo quemada), ruido en las sombras, colores tal como salen del teléfono, un fondo vivido (una toalla, frascos, un cable, algo fuera de lugar). La persona: alguien común del segmento, piel con textura natural, pelo y ropa de casa.

**Belleza y cuidado personal:** la textura es natural, sin nombrar ni acercar el problema que el producto resuelve (ojeras, manchas, arrugas): eso sería mostrar el «antes», y la regla de no antes/después lo prohíbe. `brief.category` es texto libre, así que el código la clasifica (`isAppearanceCategory`: belleza, piel, cabello, cuidado personal, cosmética) y `render.ts` usa en esos productos una variante del bloque de la persona sin esos rasgos.

**Encuadre y textos:** los textos grandes van entre el 15 y el 26 % del alto y los subtítulos al 60 % (`ugc-montage.py`). Por eso nada de «la cabeza un poco cortada»: el bloque `selfie` deja la cara en el tercio del medio.

### 4.2 Guionista (`lib/video/prompts.ts`)

- `PICTURES`: lugares vividos (el baño con cosas en el lavamanos, el auto, la cocina, la entrada) en vez de «ventana con luz de mañana»; cada imagen clave declara su `camera`.
- `STRUCTURE`: el B-roll es POV de la misma persona («con la otra mano, mirando hacia abajo»), no «el producto en macro».
- Persona y `character.look`: una persona común del segmento con rasgos reales, no una modelo.
- Actuación: menos ensayada (mira un segundo fuera de cámara, se acomoda el pelo, un gesto que se corta).
- Líneas: muletillas naturales («mira», «o sea») permitidas desde la segunda frase de A1, dentro del tope de palabras por segundo. Nunca en la primera frase: es el gancho.

### 4.3 Reglas en código (`lib/video/schemas.ts`)

`studioWord` (`lib/hooks/policy.ts`, junto a `riskyShape`, ignorando lo negado con `NEGATED`, en inglés y en español): *studio, softbox, soft light, golden hour, cinematic, bokeh, shallow depth of field, macro, slow motion, color graded, professional photo, commercial, editorial, beauty shot, flawless, perfect skin* y sus equivalentes en español (estudio, luz dorada, cámara lenta, desenfoque de fondo…). Se revisa en `keyframes[].prompt`, `character.setting`, `character.look` y en `motion` de A-roll y B-roll. `scriptProblems` también exige un `camera` válido por imagen clave y que el B-roll con persona no sea selfie. Solo al generar y solo en el UGC.

### 4.4 Clips

- **Kling** (`bRollRequest`): `B_ROLL_NEGATIVE` suma *cinematic, bokeh, shallow depth of field, slow motion, studio lighting, color grading, film look* (en un campo negativo sí sirve nombrarlo). El prompt fijo pasa de «Realistic handheld smartphone footage» a un bloque por `camera`.
- **Seedance** (`aRollRequest`): un bloque fijo de cámara de teléfono: microtemblor de la mano, pequeños reencuadres, exposición automática que se ajusta al moverse. El `motion` de Claude va después.

### 4.5 QA de las imágenes clave

`keyframeQaSchema` suma `phone_look` (¿parece una foto de teléfono en una casa, o de estudio o campaña?; null en la mascota). **No bloquea**: si lo demás pasa, queda como aviso en la tarjeta («Parece foto de estudio: si no te convence, pide otra.») y no dispara el reintento automático. `KEYFRAME_QA_PROMPT_VERSION` 3.

### 4.6 Montaje (`scripts/ugc-montage.py`)

El paquete trae `look`: `phone` en el UGC y `clean` en la mascota. `--look phone|clean` lo cambia.

- **Imagen** (`PHONE_VIDEO`): nitidez y saturación un poco más bajas y una leve respiración de la exposición. Grano solo muy leve y con `-tune grain`: a CRF 25 y con la recompresión de Meta, el grano fuerte sale manchado y pesa más. Va antes de la marca de agua, que queda nítida.
- **Audio** (`phone_audio`): micrófono de teléfono (pasa-altos 150 Hz, pasa-bajos 8 kHz, una compresión suave) y un ruido de habitación bajo. Va sobre la voz, antes de la música, que en TikTok se agrega limpia. Sin eco: sobre una voz generada suena más artificial.
- En un paquete de mascota, `--look phone` no se aplica: la animación no se ensucia.

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `lib/hooks/catalog.ts` | `OPENING_SHOTS`, `OPENING_SHOT_DEFS`, `MASCOT_PATTERNS`, `MIN_MASCOT_HOOKS` |
| `lib/hooks/policy.ts` | `studioWord`; `riskyShape` y `NEGATED` (antes en `lib/video/schemas.ts`), en inglés y en español |
| `lib/hooks/prompts.ts`, `schemas.ts`, `select.ts` | `opening_shot`, `first_motion`, versión `mascot` de cada gancho, reglas, `usableHooks(…, "ai_video" \| "mascot")` |
| `lib/video/catalog.ts` | `CAMERAS`, `VIDEO_OPENING_SHOTS`, `opensWithInsert`, `PACKAGE_VERSION` 2 |
| `lib/video/prompts.ts` | `hookBlock` por toma (también `mascot_scene`), el GANCHO del arco de la mascota desde el agente, `PICTURES`, `STRUCTURE`, persona, actuación, muletillas |
| `lib/video/schemas.ts` | `opening`, `camera`, `openingProblems`, `phoneLookProblems`, `phone_look` y `matches_hook` en el QA |
| `lib/video/render.ts` | `HOME_PHONE`, `CAMERA_BLOCKS`, persona común (variante de belleza, `isAppearanceCategory`), `firstFrame`, Seedance y Kling por cámara, `B_ROLL_NEGATIVE_UGC` |
| `lib/video/package.ts`, `scripts/ugc-montage.py` | Paquete v2 (`opening`, `look`), apertura en el segundo 0, punch-in, `--look` |
| `lib/pipeline/video.ts` | `openingInput` al guion; `appearance` en el input del guion; la cámara y la apertura a cada toma; `matches_hook` en la imagen de la apertura |
| Pantallas | Ángulos: la toma del gancho, «También mascota» y «Necesita grabación real». Videos: el aviso de `phone_look` en la tarjeta de la imagen clave (sin cambios de componente) |

## 6. Cómo probarlo con un producto real

1. Ángulos › «Otros ganchos» en un desarrollo (o uno nuevo): los ganchos traen su toma y su versión de mascota.
2. Videos › «Otro guion» en los dos formatos: el guion abre con un gancho de la lista y su imagen clave de apertura.
3. Generar las imágenes clave (centavos) y revisarlas antes de los clips (~US$11 por video): la apertura muestra el gancho, el UGC parece de teléfono.
4. Clips, «Descargar paquete» y `python3 scripts/ugc-montage.py paquete.json`: el gancho desde el cuadro 0 y el aspecto de teléfono.

## 7. Decisiones

- **Tomada · Sin rótulo** (2026-10-01): el video no lleva «Dramatización», «Animación» ni etiqueta de IA. En esta rama ya se sacó del paquete (`label`), de los prompts del guionista y del agente de ángulo, y de `CLAUDE.md`, `spec-video-ugc.md` y `spec-creativos.md`. No se vuelve a proponer.
- **Tomada · Sin medición ni A/B** (2026-10-01): los ganchos ya salen de anuncios ganadores; no se agregan la tasa de gancho, la retención ni dos videos finales por guion.
- **Tomada · `look` por defecto:** `phone` en el UGC, `clean` en la mascota.
- **Tomada · `phone_look` avisa, no bloquea:** lo que bloquea es que la apertura no muestre el gancho (`matches_hook`).

## 8. Fuera de esta versión

- Grabación real guiada: los ganchos `real_footage` como pauta para el comerciante (qué grabar en 3 s con su teléfono) y su subida como apertura del video con IA.
- Variantes de gancho sobre el mismo video (rehacer solo A1 y su imagen clave).
- Soul 2 para K1 (`higgsfield-ai/soul/v2/standard`, con la clave del comerciante): prueba aparte. Flare vuelve a dibujar la cara desde K1 en las escenas con producto y puede volver a embellecerla; si no parecen la misma foto, no sirve.
- Medir la tasa de gancho por patrón y por toma.
- Montaje en la nube.
