# Spec: Video UGC en Creativos

> Estado: **implementado** (2026-09-26, rama `feat/video-ugc`), fases V1 a V4, más el formato mascota (§11). Verificado: tests puros (`lib/video/video.test.ts`), el guionista real con los datos de Deep Collagen (prompt v2: pasa al primer intento, US$0,25), las imágenes clave reales con `keyframeRequest` (cara, etiqueta y manos correctas) y `scripts/ugc-montage.py` con los clips de la POC (31 s, 7,4 MB). Pendiente: una corrida completa desde la pantalla con un producto real (la base local no tiene uno con ángulos aprobados) y aplicar la migración en producción.
> Reemplaza las fases F2–F4 de `docs/spec-creativos.md` §7 para el video hablado.
> Origen: POC del 2026-09-25/26 sobre Deep Collagen (`ea36e7bc…`, ángulo 3 «Cuando la base se mete en las líneas»), cinco rondas (B → E) hasta un resultado que el usuario aprobó. Sesión de mentoría del 2026-09-25: probar 3 ángulos con **formatos distintos** (UGC con IA, imagen, video real) y que el video sea 100 % específico a su ángulo.
> Toca: Creativos (`/products/[id]/creatives`), Higgsfield, Anuncios (`ad_media`), un script local nuevo.
> Decisiones del usuario (2026-09-26): (1) el **montaje es local** en esta primera iteración: la app entrega un paquete y un script de Python lo arma (cortes, zooms, subtítulos, música, compresión); (2) los tiempos de los subtítulos salen de **Whisper local**; (3) la **música se agrega en local**; (4) el comerciante revisa **el guion y las imágenes clave** antes de gastar en clips.

## 0. Resumen

Un video UGC de ~30 s por ángulo, hecho con IA y listo para Meta:

1. **Guion** (Claude, gratis para el comerciante salvo tokens): la voz, la actuación y las líneas de cada toma hablada, las tomas de apoyo (B-roll) ancladas a palabras, los textos en pantalla y la ficha del personaje. El comerciante lo edita y lo aprueba.
2. **Imágenes clave** (Flare, centavos): el personaje, cada escena y las tomas con el producto real. Claude las revisa (manos, producto idéntico, misma cara, sin texto) y el comerciante las aprueba o pide otra.
3. **Clips** (~$10): tomas habladas en Seedance 2.0 con voz y labios sincronizados, B-roll en Kling 2.5 Turbo sin audio.
4. **Paquete de montaje**: un JSON con todo lo que el script local necesita (URLs firmadas de los clips, guion, anclas, textos, cierre, color).
5. **Montaje local** (`scripts/ugc-montage.py`): Whisper para los tiempos, cortes con zoom, B-roll encima de la voz, subtítulos palabra por palabra, destellos, rótulo «Dramatización», cierre, música opcional y compresión para Meta.
6. **Video final**: se sube a la misma tarjeta del guion; aprobarlo lo copia a `ad_media` (`kind = 'video'`, 9:16, con su `angle_slot`) y queda listo en Anuncios.

## 1. Lo que aprendió la POC (es la base de los prompts)

| Tema | Aprendizaje |
|---|---|
| Estructura | 4 tomas de 7 s = «monótono, lento». Lo que funciona: **A-roll** hablando (la voz continua) + **B-roll** de 1,2–1,8 s encima de la voz, zoom alterno por frase, subtítulos palabra por palabra, destellos al cambiar de idea. ~28 planos en 30 s. |
| Voz | «Rápida, enérgica, exasperada» → golpeada y molesta. «Cálida, suave» → plana y aburrida. Lo que funcionó: **entusiasta y cálida, sonriendo, entonación melódica, énfasis en palabras clave, como contarle un descubrimiento a una amiga; ritmo natural**, más **una indicación de entrega por línea** (qué palabra remarcar, qué tono). |
| Idioma | Español latino **neutro**, sin modismos. Números escritos en palabras dentro de la línea. |
| Precios | Seedance pronuncia mal las cifras («cincuenta y cinco mil novecientos noventa» → «cuenta y 5.990»). **El precio nunca se dice**: va solo en pantalla. Palabras que pronuncia mal de forma consistente se cambian («Rinde» → «Te dura»). |
| Largo | 2,7–3,0 palabras/s con la voz entusiasta de la variante E (medido con Whisper). Seedance no deja silencios: el largo del video ≈ suma de las tomas habladas. |
| Imágenes clave | La cara se mantiene con la imagen del personaje (K1) como referencia; el producto se mantiene con la foto base como referencia. Una imagen clave salió con **tres manos**: la QA y la revisión humana van antes de pagar el clip. Pedir «una sola mano visible» cuando la escena no necesita dos. |
| Proveedores | Seedance 2.0 i2v: 4–15 s, 720p, `generate_audio: true`, habla con labios sincronizados desde el prompt. Kling 2.5 Turbo std i2v: 5 o 10 s, sin audio, ~$0,18. Seedance 2.5: 4–30 s, más caro (~$0,46/s a 720p). |
| Costos reales | Seedance 2.0 a 720p 9:16 ≈ $0,30/s (tokens: `ceil(w×h×s×24/1024)` × $0,014/1000). Un video: ~30 s de A-roll ($9) + 8 B-roll ($1,50) + ~10 imágenes clave (centavos) ≈ **$11**. Rehacer solo las voces ≈ $9. |
| Envío | Un envío a Seedance devolvió 500 una vez (no cobró): se reintenta. |
| Transcripción | Whisper escribe dígitos («7») y oye mal palabras: el texto de los subtítulos sale **del guion**; Whisper solo aporta los tiempos (alineación por `difflib`). |
| Compresión | Para Meta: H.264 `veryslow` CRF 25 (VMAF 98,5, peor cuadro 93,6, −48 %). Mínimo razonable CRF 28 (6 MB en 30 s). |

## 2. Flujo en la pantalla

Creativos gana una pestaña **Videos** (junto a **Imágenes**, lo de hoy). Dentro, una tarjeta por ángulo aprobado (slot 1–3) con 5 pasos en fila, cada uno con su estado:

```
Guion ──► Imágenes clave ──► Clips ──► Montaje (local) ──► Video final
 gratis     ~$0,30              ~$10     script Python       sube y aprueba
```

1. **Guion**: «Escribir guion» → Claude. Se muestra como tabla (toma | lo que dice | cómo lo dice | lo que se ve). Editable por línea. «Aprobar guion» lo congela; editarlo después invalida lo de abajo.
2. **Imágenes clave**: «Generar imágenes clave (≈ $0,30)». Grilla 9:16 con la QA de cada una. Aprobar / «Otra» por imagen. «Aprobar todas» cuando pasan.
3. **Clips**: «Generar clips (≈ $X)» con el costo calculado por tokens antes de gastar. Cada clip se ve y se puede rehacer suelto (costo de ese clip).
4. **Montaje**: «Descargar paquete» (JSON) y el comando para correr el script. Texto: «El montaje se hace en tu equipo con el script de DropFlex».
5. **Video final**: «Subir video montado» (MP4). Se muestra con su duración y peso; «Aprobar» lo manda a Anuncios con su ángulo. Descartar lo borra.

Un ángulo puede quedarse en «Imagen» o «Video real» (sin guion de IA): la mentoría pide formatos distintos por ángulo. La tarjeta muestra el formato sugerido por el guionista (§3.3) y el comerciante decide.

## 3. Guionista (`ugc_script`)

### 3.1 Entradas

Por ángulo, lo mismo que ya leen Creativos y Página del producto:

- Brief del ángulo aprobado (`angle_briefs.payload`): `handoff_to_ugc`, `hooks` (con `visual_first_3s` y `policy_ok`), `recommended_hook`, `body_beats`, `objection_handling`, `proof_to_show`, `compliance_flags`, `details`.
- Mensaje del ángulo (`chosen_angles`): dolor o deseo, segmento, promesa, momento gatillo.
- Cliente ideal aprobado: `voice_of_customer`, `problems.trigger_moments`, objeciones, identidad.
- **Diferenciador confirmado** (`getDifferentiator`). Hoy Creativos no lo lee: se agrega aquí y en los estáticos.
- Precio y packs aprobados (`pricingBlock`), mercado e idioma.
- La foto base del producto (visión) para describir el producto y el kit.

### 3.2 Salida (`ugcScriptSchema`, zod)

```ts
{
  format_fit: { recommended: "ugc_ai" | "static" | "real_video", why: string },
  voice: string,            // dirección general (§1 Voz), en inglés para el modelo de video
  performance: string,      // actuación general
  character: { look: string, wardrobe: string, setting: string },   // → K1
  keyframes: [{ key: "K1".."K9", uses_product: boolean, uses_character: boolean,
                prompt: string, one_hand: boolean }],
  a_roll: [{ key: "A1".."A6", keyframe: "K…", seconds: 4..8,
             line: string,          // lo que dice, en el idioma del mercado
             delivery: string,      // entonación y palabra a remarcar
             acting: string,        // gestos y expresión
             motion: string }],     // cámara y movimiento, en inglés
  b_roll: [{ key: "B1".."B10", keyframe: "K…", anchor: string,   // palabra de una línea
             cut_s: 1.0..2.0, motion: string }],
  text_beats: [{ anchor: string, until: string | null, text: string }],
  end_card: { title: string, subtitle: string, cta: string, small_print: string[] },
  compliance_notes: string[]
}
```

### 3.3 Reglas que valida el código (`scriptProblems`, puro y testeado)

- 4 a 6 tomas habladas; total entre 24 y 32 s; cada línea ≤ 3 palabras por segundo de su toma.
- **Ningún monto en las líneas habladas** (dígitos o cifras en palabras); los montos de los textos en pantalla salen de `allowedAmounts` (como `textProblems`).
- Promesas prohibidas y regex de salud de `lib/creatives/schemas.ts` (`FORBIDDEN`) sobre líneas, textos y cierre.
- Cada `anchor` de B-roll y de texto existe en alguna línea; los B-roll de una misma toma no se pisan.
- Cada `keyframe` referido existe; `K1` es el personaje (`uses_character`, sin producto); toda toma con producto tiene `uses_product`.
- Si hay persona de IA: el rótulo «Dramatización» es obligatorio (lo pone el montaje), ninguna línea en segunda persona sobre la edad o la piel de quien mira (heurística: `tu piel`, `tus arrugas`, `a tu edad`…) y la persona no dice su edad («tengo cuarenta y dos», «a mis 42»): la primera corrida real lo hizo, y el desarrollo del ángulo lo prohíbe.
- Palabras que Seedance pronuncia mal (`MISPRONOUNCED`, empieza con `rinde`): se piden cambiar.
- Si falla: hasta 2 correcciones con la lista de problemas (patrón de `writePage`). Nunca se recorta en silencio.

## 4. Render (Higgsfield, clave del comerciante)

| Pieza | Endpoint | Entrada | Costo |
|---|---|---|---|
| K1 personaje | `marketing-studio/image/flare` 1k low 9:16, `enhance_prompt: false` | solo texto | ~$0,03–0,10 |
| Resto de imágenes clave | igual | `image_urls: [K1]` y/o `[K1, foto base]` | ~$0,03–0,10 c/u |
| Toma hablada | `bytedance/seedance-2.0/image-to-video`, 720p, `generate_audio: true`, `duration = seconds` | `image_url` = su imagen clave; prompt = `motion` + `acting` + «saying exactly: «line»» + `delivery` + `voice` | ≈ $0,30/s |
| B-roll | `kling-video/v2.5-turbo/standard/image-to-video`, 5 s | `image_url` = su imagen clave; `negative_prompt` fijo (texto, etiqueta deformada, dedos extra) | ≈ $0,18 |

- El prompt lo arma el código (`lib/video/render.ts`, puro y testeado), no el modelo: bloque de voz fijo + regla de etiqueta del producto + regla de manos, igual que `lib/creatives/render.ts`.
- K1 primero; las demás imágenes clave esperan a K1 (usan su URL). Los clips esperan a que su imagen clave esté aprobada.
- Mismo mecanismo que hoy: `after()` + sondeo con lease sobre `updated_at`, sin webhooks. Seedance tarda 3–6 min: el sondeo de la pantalla termina lo que quedó esperando.
- Costo: Seedance por tokens con el alto y ancho reales del resultado; Kling por el precio de `/estimate` (texto) guardado como constante; Flare con `IMAGE_COST_USD`. Todo con `recordAiGeneration` (`step: "video_keyframe" | "video_clip"`, `cost_estimated`).
- QA de imágenes clave (Claude visión, `effort: "low"`): cantidad de manos y dedos, producto idéntico a la foto base, misma cara que K1, sin texto impreso. Una repetición automática si falla (como los estáticos).
- Topes por comerciante en 24 h: 6 guiones, 60 imágenes clave, 40 clips. Tope por producto: `merchant_settings.ai_cost_cap` si existe.

## 5. Paquete de montaje y script local

### 5.1 `GET /api/products/[id]/videos/[scriptId]/package`

JSON (versión `1`), solo con el guion aprobado y todos los clips listos:

```json
{
  "version": 1,
  "product": { "id": "…", "title": "Deep Collagen" },
  "angle": { "slot": 3, "title": "…" },
  "language": "es",
  "accent_color": "#F2C230",
  "label": "Dramatización",
  "script": { "a_roll": [ { "key": "A1", "line": "…", "url": "https://…signed…" } ],
              "b_roll": [ { "key": "B1", "anchor": "minutos", "cut_s": 1.2, "url": "…" } ],
              "text_beats": [ … ] },
  "end_card": { "image_url": "…foto base…", "title": "…", "subtitle": "…", "cta": "Comprar", "small_print": ["…"] },
  "expires_at": "…"
}
```

URLs firmadas de `creative-media` por 24 h (el paquete se descarga de nuevo si vencen).

### 5.2 `scripts/ugc-montage.py`

Generaliza `edit.py` de la POC:

```bash
python3 scripts/ugc-montage.py paquete.json --music pista.mp3 --out video.mp4
```

- Descarga los clips, transcribe cada toma con `mlx_whisper` (o `openai-whisper` si no es Mac) y alinea al guion.
- Recorta, zoom alterno por frase, B-roll con entrada de golpe, destellos en los `text_beats` que empiezan con número, sacudida en el hook, subtítulos (grupos de 3, activa en `accent_color`), rótulo, cierre con zoom.
- Música opcional: −14 LUFS la voz, bajada automática bajo la voz (`sidechaincompress`), golpe alineado al primer destello (tempo por autocorrelación), sube en el cierre.
- Salida para Meta: H.264 `veryslow` CRF 25, AAC 128k, `+faststart`. Imprime duración y peso.
- Requisitos: `ffmpeg`, `Pillow`, `numpy`, `mlx-whisper`. Sin `drawtext` (el ffmpeg de Homebrew no lo trae): textos con Pillow.

### 5.3 Video final

- `POST …/videos/[scriptId]/final` (URL firmada de subida, igual que los medios de Anuncios) → `PUT` confirma: se lee con `sniffMedia` (mp4), se exige 9:16 (`ratioOf`), ≤ 100 MB y 10–60 s. El ancho, el alto y la duración los lee el navegador (`mediaFacts`, como Anuncios).
- «Aprobar» copia a `ad-media` e inserta `ad_media { kind: "video", mime_type: "video/mp4", ratio: "9:16", duration_s, width, height, size_bytes, angle_slot, name: "Video UGC · <ángulo>" }`. Descartar lo quita de Anuncios (si no se subió a Meta).
- `removeAdCopies` pasa a respetar también `meta_video_id`.

## 6. Modelo de datos (migración `20261024000000_video_ugc.sql`)

```sql
create table public.video_scripts (
  id uuid pk, product_id → products cascade, user_id → auth.users cascade,
  angle_slot smallint not null check (angle_slot between 1 and 3),
  status public.pipeline_run_status not null default 'queued',   -- generación del guion
  error_code text, error_message text,
  payload jsonb,                          -- UgcScript (§3.2)
  input jsonb not null default '{}',      -- brief id/edited_at, avatar, pricing, provider
  approved_at timestamptz, edited_at timestamptz, superseded_at timestamptz,
  final_storage_path text, final_width int, final_height int, final_duration_s numeric,
  final_size_bytes bigint, final_status public.content_status, final_decided_at timestamptz,
  ad_media_id uuid → ad_media on delete set null,
  prompt_version smallint, model text, started_at, finished_at, created_at, updated_at
);
-- uno vigente por (producto, ángulo, formato): migración 20261027000000_video_script_format.sql (§11)
create unique index video_scripts_active on video_scripts (product_id, angle_slot, format) where superseded_at is null;

create table public.video_shots (
  id uuid pk, script_id → video_scripts cascade, product_id, user_id,
  key text not null,                      -- K1…, A1…, B1…
  kind text not null check (kind in ('keyframe','a_roll','b_roll')),
  attempt smallint not null default 1,
  endpoint text not null, input jsonb not null,
  render_status text not null default 'queued' check (… queued/running/succeeded/failed),
  hf_request_id text unique, submitted_at, finished_at,
  storage_path text, width int, height int, duration_s numeric, size_bytes bigint,
  cost_usd numeric(10,6), qa jsonb,
  status public.content_status not null default 'generated',   -- aprobación de imágenes clave
  error_code text, error_message text, created_at, updated_at
);
create index video_shots_script on video_shots (script_id, key, created_at desc);
create index video_shots_pending on video_shots (user_id, render_status) where render_status in ('queued','running');
```

- RLS «dueño lee» en las dos; escrituras solo con `service_role`.
- Bucket `creative-media`: agrega `video/mp4` y sube el límite a 100 MB.
- `deleteProducts`: las rutas `video_shots.storage_path` y `video_scripts.final_storage_path` entran en el borrado de `creative-media` (el prefijo `<uid>/<pid>/` ya lo cubre; se agregan a la consulta explícita). Las filas se van en cascada.
- `lib/data/ai-costs.ts`: `video_scripts` en `RUN_TABLES`. `AI_STEPS`: `ugc_script` «Guion de video», `video_keyframe` «Imagen clave de video», `video_qa` «Revisión de imagen clave», `video_clip` «Clip de video».

## 7. Código

```
lib/video/
  schemas.ts        ugcScriptSchema, scriptProblems, MISPRONOUNCED (puro, tests)
  prompts.ts        ugcSystem(market), ugcUser(ctx, problems)
  render.ts         keyframeRequest, aRollRequest, bRollRequest, VOICE_BLOCK (puro, tests)
  cost.ts           seedanceCostUsd(w, h, s), KLING_TURBO_5S_USD (puro, tests)
  package.ts        buildPackage(script, shots, urls) (puro, tests)
  store.ts          filas, vistas, expireStaleVideos, purge
lib/pipeline/video.ts   startScript, runScript, editScript, approveScript,
                        startKeyframes, startClips, processShot, syncVideos,
                        decideKeyframe, uploadFinal, decideFinal
app/api/products/[id]/videos/…   route.ts (GET estado + sync, POST guion),
                                 [scriptId]/route.ts (PATCH editar/aprobar),
                                 [scriptId]/keyframes, [scriptId]/clips, shots/[shotId],
                                 [scriptId]/package, [scriptId]/final
components/screens/creatives-videos.tsx   pestaña Videos
scripts/ugc-montage.py
```

`creativesState` suma `videos: VideoCardView[]` para que la pantalla lea un solo estado; la pestaña Videos sondea con el mismo `POLL_MS`.

## 8. Guardrails

Los de `spec-creativos.md` §5, más:

1. Persona de IA solo como **dramatización**, rotulada durante todo el video. Nunca como clienta, testimonio ni experta.
2. Nada de antes/después de la piel o del cuerpo; el B-roll muestra aplicación, no resultado.
3. Ningún monto hablado; los montos en pantalla solo de precio y packs aprobados.
4. El producto sale siempre de la foto base (nunca inventado); lo que no está en la foto no aparece impreso.
5. La música la pone el comerciante con licencia comercial (el script lo recuerda).

## 9. Fases

| Fase | Entrega | Gasto de prueba |
|---|---|---|
| V1 | Migración, guionista con validación y tests, pestaña Videos con guion editable y aprobable | Tokens de Claude |
| V2 | Imágenes clave (Flare) + QA + aprobación | ~$0,30 por guion |
| V3 | Clips (Seedance + Kling) con costo previo, rehacer suelto | ~$10 por guion |
| V4 | Paquete + `scripts/ugc-montage.py` + subir video final + aprobar a Anuncios | — |

Cada fase se prueba sola en local y con un producto real (Deep Collagen) antes de pasar a la siguiente.

## 10. Fuera de esta iteración

- Montaje en la nube (Vercel + ffmpeg o un worker): el script local ya define el contrato (`package.json` → mp4).
- Voz consistente entre tomas con referencia de audio (Seedance 2.5 `reference-to-video` + `audio_urls`).
- Variantes de hook sobre el mismo video y remix de un ganador (Genjutsu).
- Video con creadora real: el guion sirve como pauta de grabación; la subida del video final ya lo cubre.

## 11. Formato mascota (2026-09-26)

Un segundo formato de video, con el mismo flujo, las mismas tablas y los mismos modelos: **una mascota 3D estilo Pixar** (lo que tiene el problema, personificado: la uña, la rodilla, el diente) cuenta su historia en primera persona. Sale de un anuncio de la competencia (KeraPass, spray antihongos, TikTok) y de una POC que el usuario aprobó («la voz se escucha perfecto»): 4 tomas habladas de Seedance con voz + 5 B-roll de Kling, 24 s, ~US$9.

| Tema | Lo que cambia respecto del UGC |
|---|---|
| Elección | **Cada ángulo tiene los dos videos, cada uno con su avance** (2026-09-26): la persona y la mascota del mismo ángulo conviven, y escribir uno nunca reemplaza ni borra el otro. La columna `video_scripts.format` (`ugc` por defecto; migración `20261027000000_video_script_format.sql`, que copia lo que había en `input.format`) entra en el índice único: un guion vigente por producto, ángulo y formato. `videosState` devuelve una tarjeta por ángulo y formato. En la pantalla, bajo la cabecera del ángulo, `SegmentedControl` «Formato del video» Persona / Mascota animada («Mascota» en la columna de pasos del escritorio) cambia de video sin perder nada; sin elegir, abre el del guion más reciente. «Otro guion» y «Reintentar» solo reemplazan el guion de su formato. `format_fit.recommended` suma `mascot`: si el guionista recomienda el otro formato, la pantalla ofrece «Escribir como mascota» (o «con persona»), que escribe ese video y pasa a él, o «Ver el video con mascota» si ya existe. |
| Guion | `mascotSystem` (`lib/video/prompts.ts`, `MASCOT_PROMPT_VERSION`): arco fijo gancho con el problema → lo que no funcionó y por qué → llegada y mecanismo en una toma → final feliz que retoma el gancho + oferta. El personaje habla de sí mismo o de «mi dueño»; todo es animación (sin pies ni piel reales). Mismo esquema (`ugcScriptSchema`). |
| Largo | `FORMAT_LIMITS.mascot`: 3 a 5 tomas y 20 a 26 s habladas (la POC: 23 s + 2 s de cierre; el usuario no quiso más). |
| Reglas | `scriptProblems(…, format)`: además de las del UGC, la segunda persona sobre el cuerpo cubre uñas, pies, dientes, rodillas, pelo, hongos… y ninguna línea ni texto promete plazos («al día tres», «en dos semanas»); aplica también al UGC. |
| Imágenes | `keyframeRequest(…, "mascot")`: cuadro de película animada 3D (no foto de teléfono), el personaje por su descripción sin ropa, el producto **sin cara ni brazos** (la etiqueta se deforma) y solo sus dos bracitos. Lección de la POC: pedir «el personaje ES un solo dedo que sube desde el borde de abajo, sin piernas ni pies», o sale con piernas y deditos propios. |
| QA | `keyframeQaUser(…, "mascot")`: acepta manos de caricatura de 4 o 5 dedos; «la misma persona» es el mismo personaje aunque cambie su estado. |
| Voz | `voiceBlock(…, "mascot")`: voz de personaje animado, femenina joven, juguetona, timing de comedia. Igual en todas las tomas; en la POC sonó consistente aunque el personaje cambiara de enfermo a sano. |
| Montaje | El paquete lleva `label: "Animación"` en lugar de «Dramatización». El resto del script es el mismo (los textos largos ahora se achican o se parten en dos líneas). |
| Anuncios | `ad_media.name` = «Video mascota · <ángulo>». Los dos videos de un ángulo pueden estar en Anuncios a la vez, en el conjunto de ese ángulo. |
| Paquete | Lleva `format`; se descarga como `video-angulo-N-mascota.json` (`montageFile`), para no pisar el de la persona. |

Costo: ~US$8–9 por video (Seedance manda: ~23 s habladas).
