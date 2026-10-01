# Video UGC que detiene el scroll: la apertura manda y el video parece de teléfono

> Estado: **spec** (2026-10-01). Nada implementado.
> Base: `docs/spec-ganchos.md` (el agente de ganchos COD LatAm, rama `feat/hook-cod-latam`), `docs/spec-video-ugc.md` y el análisis «Humanizar el video UGC» (2026-10-01).
> Toca: `lib/hooks/`, `lib/video/` (`catalog.ts`, `prompts.ts`, `schemas.ts`, `render.ts`, `package.ts`), `lib/pipeline/video.ts`, `scripts/ugc-montage.py`, `lib/ads/meta/insights.ts`, la pestaña Videos y una migración.

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

1. **La apertura es un contrato, no una sugerencia.** El gancho elige la primera toma; el guion la ejecuta; el código lo comprueba en cada capa (gancho → guion → imagen clave → clip → montaje → métrica).
2. **Solo se promete lo que la IA puede hacer sin mentir.** Una demostración del efecto (el vaso que deja de vibrar, la mancha que desaparece) hecha con IA es una prueba inventada: es engañosa y sube el rechazo en la puerta. Esos ganchos piden grabación real y no van al video con IA.
3. **El aspecto de teléfono lo fija el código, en positivo.** Bloques fijos que describen lo que la foto *es* (el modelo dibuja lo que se nombra, aunque vaya negado: lección de la mascota). Lo que el modelo no debe escribir se rechaza en código, como `RISKY_SHAPE`.
4. **Natural no es engañoso.** El objetivo es que el video se vea como un video de teléfono, no hacer pasar a la persona de IA por una clienta (ver §9, D1).
5. **Se mide.** La tasa de gancho (reproducciones de 3 s / impresiones) decide, no el ojo.

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

`real_footage` no entra al video con IA (§3.3). La mascota no usa `shot`: su apertura es siempre el personaje con el problema en una escena graciosa (arco de `mascotSystem`), dicho con el gancho que elija.

### 3.3 El agente de ganchos decide la toma (`lib/hooks`)

- Cada gancho suma `opening_shot` (uno de §3.2) y `first_motion` (qué se mueve en el cuadro 0, en español, para el comerciante). `visual_first_3s` sigue siendo la descripción de la toma.
- El prompt explica las tomas posibles y la regla del principio 2: **una demostración que muestra el efecto o el resultado es `real_footage`**; una que muestra el uso (la mano aplicando, poniendo, abriendo) sí se puede hacer con IA. El lenguaje de la primera toma es de teléfono (cámara frontal, POV, en la casa), nunca «macro», «plano cenital de estudio» ni «cámara lenta».
- `hookProblems` suma: `opening_shot` válido; `real_footage` obligatorio cuando `needs_real_material` no es null; los patrones Bastidores y Confesión sin reseñas reales no pueden declarar otra toma; palabras de estudio en `visual_first_3s` (la lista de §5.3).
- `usableHooks(src, "ai_video")` deja fuera `real_footage`; los estáticos y el texto del anuncio siguen igual. Los ganchos de antes (sin `opening_shot`) valen como `selfie_talk`.
- Sube `HOOKS_PROMPT_VERSION`. La pantalla de Ángulos muestra la toma («Primera toma · POV de las manos») y marca «Necesita grabación real» en vez de «Falta material real» cuando corresponde.

### 3.4 El guion ejecuta la apertura (`lib/video`)

`ugcScriptSchema` reemplaza `hook_source` por un objeto:

```ts
opening: {
  hook_source: number | null; // el index del gancho (o null si ninguno servía)
  shot: "selfie_talk" | "pov_hands" | "problem_scene" | "product_in_place" | "mirror";
  keyframe: string;           // la imagen clave del cuadro 0
  first_motion: string;       // EN: qué se mueve desde el cuadro 0
}
```

Reglas nuevas en `openingProblems` (solo al generar, como hoy):

- `shot` es el `opening_shot` del gancho elegido (si `hook_source` no es null).
- `selfie_talk` y `mirror`: `opening.keyframe` es la imagen clave de A1 y **no es K1**. K1 es el retrato neutro que fija la cara; la apertura necesita a la persona en medio del gesto del gancho (una imagen clave más, centavos).
- `pov_hands`, `problem_scene` y `product_in_place`: existe B1, parte de `opening.keyframe`, se ancla a la **primera** palabra de A1 y tapa entre `B_ROLL_CUT_MIN` y `B_ROLL_CUT_MAX` (1–2 s). Después entra la cara.
- El primer texto en pantalla se ancla a la primera palabra de A1 (hoy: una de las 5 primeras).
- La primera frase de A1 tiene ≤ 9 palabras y no lleva muletillas (§4.2).
- Sube `UGC_PROMPT_VERSION` y `MASCOT_PROMPT_VERSION` (la mascota solo cambia `hook_source` → `opening.hook_source`; su `shot` no se valida).

`hookBlock` (`lib/video/prompts.ts`) cambia «la primera imagen es el visual del gancho» por la receta de su `shot`, y el gancho llega con `opening_shot` y `first_motion`.

### 3.5 La imagen clave de la apertura

- `keyframeRequest` agrega, solo a la imagen clave de la apertura, el bloque `FIRST_FRAME`: «The first frame of a phone video: the action is already happening» más el `first_motion` del guion.
- El QA de esa imagen suma `matches_hook`: ¿se ve lo que dice la primera toma del gancho? Este criterio **bloquea** (con el reintento automático de siempre): si la apertura no muestra el gancho, todo lo demás se paga en vano.

### 3.6 El clip y el montaje de la apertura

- **Abrir con un B-roll** (`pov_hands`, `problem_scene`, `product_in_place`): Kling tiene movimiento cuando la toma empieza; el montaje ya salta el arranque quieto (0,6 s). B1 se pega en el segundo 0 aunque la primera palabra empiece a los 0,2 s.
- **Abrir con la cara** (`selfie_talk`, `mirror`): Seedance abre desde la foto. El prompt de A1 pide la acción en marcha desde el primer cuadro (`first_motion`) y el montaje suma un *punch-in* (zoom 1,15 → 1,0 en 7 cuadros, el mismo del cierre) y la sacudida que ya tiene la apertura.
- El texto del gancho está en pantalla desde el cuadro 0, no desde que se dice su palabra.
- El paquete sube a `PACKAGE_VERSION` 2 y trae `opening` (`shot`, B-roll de apertura si hay). `scripts/ugc-montage.py` acepta 1 y 2.

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

`STUDIO_WORDS` (como `RISKY_SHAPE`, ignorando lo negado con `NEGATED`): *studio, softbox, soft light, golden hour, cinematic, bokeh, shallow depth of field, macro, slow motion, color graded, professional photo, commercial, editorial, beauty shot, flawless, perfect skin*. Se revisa en `keyframes[].prompt`, `character.setting`, `character.look` y en `motion` de A-roll y B-roll. `scriptProblems` también exige un `camera` válido por imagen clave y que el B-roll sea `pov`, `propped` o una escena sin persona.

### 4.4 Clips

- **Kling** (`bRollRequest`): `B_ROLL_NEGATIVE` suma *cinematic, bokeh, shallow depth of field, slow motion, studio lighting, color grading, film look* (en un campo negativo sí sirve nombrarlo). El prompt fijo pasa de «Realistic handheld smartphone footage» a un bloque por `camera`.
- **Seedance** (`aRollRequest`): un bloque fijo de cámara de teléfono: microtemblor de la mano, pequeños reencuadres, exposición automática que se ajusta al moverse. El `motion` de Claude va después.

### 4.5 QA de las imágenes clave

`keyframeQaSchema` suma `phone_look` (¿parece una foto de teléfono en una casa, o de estudio o campaña?). **No bloquea** en esta versión: se muestra como aviso («Parece foto de estudio») con «Otra» a mano, y se registra en `ai_generations` para medir cuántas marca. Si los falsos positivos son pocos, pasa a bloquear en la apertura. Sube `KEYFRAME_QA_PROMPT_VERSION`.

### 4.6 Montaje (`scripts/ugc-montage.py`)

`--look phone|clean|both` (por defecto `both` mientras dura la prueba de §8):

- **Imagen:** nitidez y saturación un poco más bajas y una leve respiración de la exposición. Grano solo muy leve y con `-tune grain`: a CRF 25 y con la recompresión de Meta, el grano fuerte sale manchado y pesa más.
- **Audio:** micrófono de teléfono (pasa-altos ~150 Hz, pasa-bajos ~8 kHz, una compresión suave) y un ruido de habitación bajo. Sin eco marcado: sobre una voz generada suena más artificial.
- `both` deja `…-telefono.mp4` y `…-limpio.mp4`, del mismo material.

## 5. Medición

### 5.1 Qué se mide

- **Tasa de gancho** = reproducciones de 3 s / impresiones. Es la métrica de la apertura.
- **Retención** = ThruPlays / reproducciones de 3 s. Dice si el video sostiene lo que el gancho prometió.
- Las de siempre: CTR, costo por pedido y, en contra entrega, la tasa de entrega.

### 5.2 Cómo

- `lib/ads/meta/insights.ts`: `actions` ya se pide; se lee `video_view` (reproducciones de 3 s) y se suma el campo `video_thruplay_watched_actions`. `Metrics` y `ad_insights_daily` ganan `video_views_3s` y `thruplays` (migración).
- `ad_media.creative_meta jsonb` (misma migración): para un video, `{ format, hook: { pattern, text, shot }, look }`. Lo llena «Aprobar» del video final (el guion sabe su gancho; el `look` lo dice el comerciante al subir: «Versión: Teléfono | Limpia», precargado por el nombre del archivo). Se borra con el producto (`ad_media` ya cae en cascada).
- Videos: un guion acepta hasta 2 videos finales (uno por `look`), para el A/B.
- Anuncios y la pantalla de la campaña muestran «Tasa de gancho» y «Retención» por anuncio de video, con el patrón del gancho.

### 5.3 Para después

Con datos de varios productos, la tasa de gancho por patrón y por toma alimenta el agente de ganchos (qué patrones abren mejor en cada arquetipo). No entra en esta versión.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `lib/hooks/catalog.ts` | `OPENING_SHOTS`, `STUDIO_WORDS` (compartida con video) |
| `lib/hooks/prompts.ts`, `schemas.ts`, `select.ts` | `opening_shot`, `first_motion`, reglas, `usableHooks(…, "ai_video")` |
| `lib/video/catalog.ts` | `CAMERAS`, tope de corte del B-roll de apertura |
| `lib/video/prompts.ts` | `hookBlock` por toma, `PICTURES`, `STRUCTURE`, persona, actuación, muletillas |
| `lib/video/schemas.ts` | `opening`, `camera`, `openingProblems`, `STUDIO_WORDS`, `phone_look` y `matches_hook` en el QA |
| `lib/video/render.ts` | `HOME_PHONE`, bloques por cámara, variante de belleza, `FIRST_FRAME`, Seedance y Kling |
| `lib/video/package.ts`, `scripts/ugc-montage.py` | Paquete v2 (`opening`), apertura en el segundo 0, punch-in, `--look` |
| `lib/pipeline/video.ts` | Gancho y toma al guion; `matches_hook` solo en la apertura; hasta 2 videos finales |
| `lib/ads/meta/insights.ts`, `lib/pipeline/ads-sync.ts` | `video_views_3s`, `thruplays` |
| Migración | `ad_insights_daily.video_views_3s`, `.thruplays`; `ad_media.creative_meta` |
| Pantallas | Ángulos (toma del gancho), Videos (versión al subir, aviso de `phone_look`), Anuncios (tasa de gancho) |

## 7. Fases

| Fase | Entrega | Gasto de prueba |
|---|---|---|
| H0 · Medir | Tasa de gancho y retención en Anuncios; `creative_meta`. Sin esto no se sabe si lo demás sirve | — |
| H1 · Montaje | `--look`, apertura en el segundo 0, punch-in. Se prueba sobre un video que ya existe: dos versiones del mismo material en Meta | Solo el pauteo |
| H2 · Apertura | `opening_shot` en el agente de ganchos, `opening` en el guion, `matches_hook` | Un guion (~US$0,25) + imágenes clave (centavos) |
| H3 · Aspecto de teléfono | Bloques por cámara, `STUDIO_WORDS`, Kling, Seedance, `phone_look` | Imágenes clave primero; clips solo si convencen (~US$11 por video) |
| H4 · Modelo (aparte) | K1 con Soul 2 frente a Flare, con la clave del comerciante | Centavos (Soul ID US$2,50 si se adopta) |

Cada fase se prueba con un producto real (Deep Collagen) antes de la siguiente. H2 y H3 comparan imágenes clave lado a lado **antes** de gastar en Seedance: descargar las actuales primero, porque la pantalla muestra solo la última.

H4 es una hipótesis: Flare vuelve a dibujar la cara desde K1 en las escenas con producto, y puede volver a embellecerla. Si K1 de Soul y las escenas de Flare no parecen la misma foto, no sirve.

## 8. Cómo se decide si funcionó

Mismo producto, mismo ángulo, mismo público, mismo presupuesto, en un conjunto ABO:

1. **H1:** limpio contra teléfono, del mismo material. Gana el de mejor tasa de gancho si el costo por pedido no empeora.
2. **H2 + H3:** el video nuevo contra el ganador de H1.

Tamaño mínimo antes de decidir: ~5.000 impresiones por variante para la tasa de gancho; el costo por pedido necesita más y se lee aparte. Crear y publicar en Meta gasta dinero real: cada prueba con autorización del comerciante.

## 9. Decisiones abiertas

- **D1 · El rótulo «Dramatización».** El commit `cfcde35` (2026-09-26) lo sacó del montaje, pero el paquete todavía manda `label` (`lib/video/package.ts`), el prompt dice que «el montaje la rotula todo el video» (`lib/video/prompts.ts`) y `docs/spec-video-ugc.md` §8.1 lo declara obligatorio. Con un video que parece de teléfono, una persona de IA hablando en primera persona se lee como clienta real: es el caso que la regla quiere evitar, y la ley de consumo de cada país lo mira. Opciones:
  - **a) Volver a ponerlo (recomendada):** un rótulo chico y fijo dentro de la zona segura de Reels, fuera de la franja del gancho (15–26 %) y de los subtítulos (60 %), para que no compita con la apertura. Se puede medir su efecto en la tasa de gancho con el mismo A/B.
  - **b) Sin rótulo:** cambiar la regla de forma explícita en el prompt, en `spec-video-ugc.md` y en `CLAUDE.md`, con la razón.
  Cualquiera de las dos corrige la contradicción de hoy.
- **D2 · `--look` por defecto** después de la prueba: `phone` si gana; si empata, `phone` igual (no cuesta y se ve menos IA).
- **D3 · `phone_look` bloquea o avisa:** empieza avisando; se decide con lo que registre `ai_generations`.

## 10. Fuera de esta versión

- Grabación real guiada: los ganchos `real_footage` como pauta para el comerciante (qué grabar en 3 s con su teléfono) y su subida como apertura del video con IA.
- Variantes de gancho sobre el mismo video (rehacer solo A1 y su imagen clave).
- Aprender de la tasa de gancho por patrón entre productos (§5.3).
- Montaje en la nube.
