# Spec: Creativos con Higgsfield (etapa opcional)

> Estado: **propuesta**, sin implementar.
> Fecha: 2026-09-23.
> Fuentes:
> - Agentes: `agentes-creativos/*.md` (README, angle-router, 6 `angulo-*`, `generador-estaticos`, `guionista-ugc`, `productor-clips`, `copywriter`). No están en el repo; los prompts viven en TS (`lib/angles/prompts.ts`, `lib/copy/prompts.ts`).
> - Higgsfield: catálogo `open.higgsfield.ai/explore` y docs `docs.higgsfield.ai` (revisados el 2026-09-23; precios con descuentos de lanzamiento).
> - Cierra la decisión abierta #4 de `spec-anuncios.md` §13 ("¿de dónde salen los creativos?").

## 0. Resumen

La etapa **Creativos** convierte los 2 desarrollos de ángulo aprobados en **anuncios de imagen y video listos para Anuncios**, generados con modelos de Higgsfield.

1. **Opcional y sin bloquear.** Igual que Reseñas y Anuncios: nunca bloquea Publicar. Va **entre Publicar y Anuncios** y se habilita cuando los **ángulos están aprobados** y el comerciante conectó **su propia clave de Higgsfield** en Ajustes. El comerciante puede saltársela y subir sus creativos a mano en Anuncios, como hoy.
2. **Claude decide, Higgsfield renderiza.** Los agentes `generador-estaticos`, `guionista-ugc` y `productor-clips` producen conceptos con prompts. Un **enrutador determinista en TS** (no un LLM) elige el modelo de Higgsfield según el tipo de pieza. El `copywriter` escribe el texto de Meta de cada creativo aprobado.
3. **La imagen sale completa del modelo** (decisión 3, 2026-09-23). El preset de Marketing Studio arma fondo, producto, titular, callouts y badges en una sola generación. No hay composición posterior, ni re-renders, ni texto incrustado después. Esto **reemplaza** la regla "texto nunca dentro de la imagen" de `generador-estaticos`. Consecuencias:
   - El texto exacto va en el prompt, entre comillas y en el idioma del mercado. Un QA con Claude (visión) lo compara letra por letra contra lo aprobado (§3.3).
   - Cada variante de titular o de proporción es **otra generación** con su costo, no una capa editable.
4. **El producto nunca se genera solo desde texto.** Toda imagen con producto usa la foto real como referencia (`imagesForGeneration`, imagen base primero). Si una toma altera el producto, se descarta.
5. **La IA propone, tú decides.** Cada pieza llega `generated`, con el ícono ✨. Solo las `approved` pasan a Anuncios.
6. **Costo visible antes de gastar.** Cada lote muestra la estimación de `POST /estimate/{endpoint}` y respeta un tope por producto.

**Primer corte propuesto:** estáticos (familias 1–8) y B-roll de video. Los clips hablados quedan para después de una prueba técnica, porque Higgsfield **no tiene lip-sync ni TTS** (§2.3).

---

## 1. Qué hay hoy

| Pieza | Dónde | Hoy |
|---|---|---|
| Etapas | `lib/products/stages.ts`, `StageKey` en `lib/types.ts:17` | 7 etapas; Reseñas y Anuncios son `optional` |
| Ángulos | `angle_rankings`, `angle_briefs` | Router + 2 desarrollos aprobados; handoff al guionista en `lib/angles/schemas.ts:122` |
| Generación de imagen o video | — | **No existe ningún proveedor.** `getProductImages` devuelve `[]` |
| Agentes creativos | — | `guionista-ugc`, `generador-estaticos`, `productor-clips` y `copywriter` sin implementar |
| Creativos de Anuncios | `ad_media`, bucket `ad-media`, `CreativeSlot` | Solo carga manual (`spec-anuncios.md` §7.2) |
| Trabajos largos | `after()` + `maxDuration = 300` | Sin cola ni webhooks para IA; hay `pg_cron` + `pg_net` |
| Costos | `ai_generations` | Solo tokens de Claude |

---

## 2. Catálogo de Higgsfield y para qué sirve cada modelo aquí

API: `https://api.higgsfield.ai/{endpoint}`, `Authorization: Key KEY_ID:KEY_SECRET`, SDK `@higgsfield/client` (solo servidor). Todo es asíncrono (`queued → in_progress → completed | failed | nsfw | canceled`) y admite webhook (`?hf_webhook=`). Las URLs de salida duran ≥7 días, así que se copian a nuestro bucket. El límite es de **solicitudes concurrentes** por cuenta (ej. 4).

### 2.1 Imagen

| Modelo | Endpoint | Modos | Desde | Uso en DropFlex |
|---|---|---|---|---|
| **Marketing Studio Image** 2.0 Alpha / 2.5 Flare / 2.5 Sunburst | `marketing-studio/image[/flare\|/sunburst]` | Texto→imagen · edición con hasta 16 referencias · **preset** (`enhance_prompt` + `preset_id` + producto + modelo opcional) | Ver §4: con preset, 2k y calidad alta, **$0.32/img** | **Motor único de estáticos.** Es el único que acepta referencias del producto y tiene presets publicitarios que entregan la pieza terminada con texto. Proporciones nativas: 1:1, 3:4, 9:16 (sin 4:5)\* |
| Workflows **Product shots / Graphic ads / Marketplace design** | el mismo endpoint con un preset por defecto | Atajos de la web a 3 de los 75 presets | igual | Se usa el catálogo completo (§2.4); Marketplace design sirve para la etapa Imágenes, fuera de esta spec |
| **Soul 2** | `higgsfield-ai/soul/v2/standard` | Texto→imagen, `style_id`, lote de 4, seed, `custom_reference_id` | $0.0032/img | Personaje de IA (ficha de `productor-clips`) y escenas sin producto |
| **Soul ID** | `POST /v1/custom-references` | Personaje consistente desde 1–100 fotos | $2.50 | Fija la identidad del narrador o demostrador en todos los keyframes |
| Soul Standard / Soul Cinema | `higgsfield-ai/soul/standard`, `/cinema` | Estilo con `style_strength` y referencia | $0.094/img | Alternativa si Soul 2 no respeta el estilo |
| **Recraft 4.1** | `recraft/v4.1[/pro]/text-to-image` | Vectorial o ilustración, paleta `colors[]` | $0.035/img | Primer cuadro de la animación de mecanismo en video (§3.2). Los estáticos ya no pasan por aquí: todos van a Marketing Studio |
| Ideogram 4.0 | `ideogram/v4.0` | Texto legible, remix | $0.03/img | Plan B de familias 4 y 6 (titular o carta sin producto) si Marketing Studio escribe mal el texto |
| Qwen Image 3 / Grok Image 2.0 | `alibaba/qwen-image-3/{text-to-image,edit}`, `xai/grok-imagine-image-2.0` | Edición con 1–3 o hasta 10 referencias | $0.04/img | Plan B de edición con producto si Marketing Studio falla en fidelidad |
| Z-Image Turbo | `z-image/turbo` | Texto→imagen rápido | $0.015/img | Bocetos baratos de escena (sin producto) |

\* Marketing Studio no ofrece 4:5, y recortar un 3:4 cortaría el texto horneado. Meta recorta el feed a 4:5 como máximo vertical, así que se generan **1:1 para el feed y 9:16 para Stories/Reels**, ambas nativas. El 3:4 de algunos presets se pide en 1:1 o 9:16.

### 2.2 Video

| Modelo | Endpoints / modos | Desde | Uso en DropFlex |
|---|---|---|---|
| **Kling 3.0** (10 modos) | `kling-video/v3.0/{std,pro,4k}/{text,image}-to-video`, `v3.0-turbo/*`, `v3/motion-control/{std,pro}`; `multi_shots` (1–6 tomas), `last_image_url`, `sound` | $0.042/s | **B-roll por defecto** (image→video desde un keyframe con producto). `last_image_url` para transiciones antes→después |
| **Seedance 2.5** (5 modos) | `bytedance/seedance-2.5/{text-to-video,image-to-video,reference-to-video,video-edit,video-extend}`; 4–30 s, audio, hasta 30 img + 10 video + 10 audio de referencia | $0.144/s | Clips premium, **candidato a clip hablado** (referencia de audio), y `video-edit`/`video-extend` para iterar un ganador |
| Seedance 2.0 | t2v, i2v, r2v, hasta 4k | $0.0985/s | Alternativa barata a 2.5 |
| **Cinema Studio 4.0** | `higgsfield/cinema-studio/4.0`; referencias `<<<image_1>>>`, dirección de escena (género, luz, lente, 33 movimientos de cámara, 50 paletas), audio | $0.2057/s | Pieza hero cinematográfica (familia 8 en video). Cara: solo a pedido |
| **Genjutsu** Motion Transfer / Object Swap | `higgsfiled/genjutsu/{motion-transfer,object-swap}/v1.0`; 1 video (4–30 s) + 1–8 imágenes | $0.159/s | **"Remix de ganador":** toma el movimiento de un video propio que funcionó y cambia el producto o el personaje. Ver guardrail de derechos (§5) |
| Grok Imagine Video 1.5 | `xai/grok-imagine-video/v1.5/reference-to-video`; hasta 7 img + `audio_url` | $0.08/s | Candidato a clip hablado (acepta audio de entrada) |
| Wan 3.0 / Prime, MiniMax H3, LTX 2.5, Happy Horse | t2v/i2v/r2v | $0.03–0.12/s | Alternativas; Wan 3.0 es el más barato para B-roll de relleno |

### 2.3 Lo que Higgsfield no tiene

- **No hay lip-sync, avatar hablante ni TTS.** El guion UGC hablado necesita voz de otro proveedor (ej. ElevenLabs), y un modelo que acepte audio de referencia (Seedance 2.5 r2v, Grok Video 1.5, Wan 3.0) tiene que sincronizar labios. No está verificado: requiere prueba técnica.
- **No hay montaje.** La pauta de montaje (EDL) de `productor-clips` se ejecuta en otro lado (ffmpeg en un worker, o exportación a CapCut).
- **No publica el catálogo de presets ni de estilos Soul en la documentación.** Se leen en tiempo real (`GET /marketing-studio/image/presets`); los UUID no se hardcodean.

### 2.4 Presets de Marketing Studio (leídos con la API el 2026-09-23)

Hay 75 presets `ads` en 5 grupos (`metadata.group_name`). Cada uno trae `cover_image` (sirve de miniatura en la pantalla) y su proporción natural. El grupo decide la familia de `generador-estaticos`:

| Grupo | Presets | Familias | Ángulos donde rinde | Ejemplos |
|---|---|---|---|---|
| **Hero Spotlight** | 32 | 8 Hero, 1 Oferta, 4 Titular | oferta, edad-identidad | Masthead Float, Giant Pack Stage (packs), Headline Wedge, Stacked Shout, Pink Flat Lay |
| **Proof & Specs** | 19 | 3 Explicativo | mecanismo-unico, autoridad | Callout Fan ("Inside one capsule"), Capsule Ring, Pill Callouts, Ingredient Halo, Benefit Ladder, Weightless Spec Grid |
| **Problem Solved** | 11 | 2 Problema→solución | mecanismo-unico, historia-personal | Problem → Solution, Lilac Question, Search Bar Answer, In-Hand Detail |
| **Compare & Switch** | 7 | 7 Comparativa | enemigo-comun | Old Way New Way, Comparison (tabla ✓/✗), Orange Tape Diptych |
| **Social Proof** | 6 | 7 Prueba | historia-personal (**solo con reseñas reales**) | Bracketed Review, Five-Star Handoff, Trust Stack |

La familia 5 (foto nativa) y la 6 (carta) no tienen preset. Van por edición directa (`enhance_prompt: false`), con la foto del producto y el texto en el prompt.

---

## 3. Cómo se reutiliza cada agente

### 3.1 Flujo

```
angle_briefs aprobados (primario + secundario)
   │
   ├──► generador-estaticos ──► creative_concepts (kind=static, 6–9 por ángulo)
   │         │
   │         ▼ enrutador (§3.2) ──► Higgsfield: pieza terminada con texto (1:1 + 9:16) ──► QA de texto y producto
   │
   └──► guionista-ugc ──► creative_concepts (kind=script)
             │
             ▼
        productor-clips ──► ficha de personaje, keyframes, clips, EDL
             │
             ▼ enrutador ──► Soul 2 (+ Soul ID) ─► Marketing Studio (keyframe con producto) ─► Kling / Seedance (clip)
                                                                                             │
                                                              selección de tomas (QA §3.3) ◄─┘
   creativo aprobado ──► copywriter ──► 5 textos + 5 títulos + descripción + botón
                     ──► Anuncios (CreativeSlot, sección "Generados")
```

`generador-estaticos` y `guionista-ugc` corren en paralelo (solo necesitan el brief). `productor-clips` espera el guion aprobado. `copywriter` corre una vez por creativo aprobado.

### 3.2 Enrutador de modelos (`lib/creatives/route.ts`, puro y testeado)

Es un mapeo desde los campos que ya entregan los agentes. No hace falta cambiar sus formatos de salida.

**Estáticos:** todos van a Marketing Studio con la foto base del producto en `image_urls[0]`. El enrutador solo elige el modo y el grupo de presets según `concept.family`:

| Familia (`generador-estaticos`) | Modo | Grupo de presets (§2.4) |
|---|---|---|
| 1 Oferta y bundle | Preset | Hero Spotlight (packs: Giant Pack Stage) |
| 2 Antes/después | Preset | Problem Solved. Sin personas: estados del problema o del producto |
| 3 Explicativo | Preset | Proof & Specs |
| 4 Titular de identidad o garantía | Preset | Hero Spotlight (Headline Wedge, Stacked Shout, Ghost Word) |
| 5 Foto nativa | Edición directa | — (escena casera, sin personas identificables) |
| 6 Carta o nota | Edición directa | — (papel o nota, producto al costado) |
| 7 Prueba (tabla, ranking, reseña) | Preset | Compare & Switch o Social Proof |
| 8 Hero | Preset | Hero Spotlight |
| Cualquiera con `real_customer_photo` | No se genera | Se sube; la IA no la genera jamás |

`generador-estaticos` propone 2–3 presets por concepto a partir del catálogo real (nombre, grupo, portada), y el comerciante puede cambiarlo antes de generar.

**Video**, según `clip.type` y `spokesperson.type` (`productor-clips`):

| Pieza | Modelo | Por qué |
|---|---|---|
| Referencias del personaje (frente y 3/4) | Soul 2, lote de 4 → el comerciante elige → **Soul ID** | Consistencia de identidad entre todos los keyframes |
| Keyframe con producto | Marketing Studio, edición con `image_urls = [producto, personaje]` | Único modelo con referencia de producto y personaje a la vez |
| Keyframe sin producto | Soul 2 + `custom_reference_id` | Barato y consistente |
| B-roll (2–4 s) | Kling 3.0 std image→video; Seedance 2.5 i2v como "calidad alta" | $0.042/s contra $0.144/s |
| Animación de mecanismo | Recraft (frame) → Kling i2v con `last_image_url` | "Illustration" en pantalla |
| Clip hablado (1 frase + acción) | **Pendiente de prueba técnica** (§7, F3): TTS externo + Seedance 2.5 r2v o Grok Video 1.5 con `audio_url` | No hay lip-sync nativo |
| Hero cinematográfico | Cinema Studio 4.0 | Solo a pedido y con costo visible |
| Remix de ganador | Genjutsu Motion Transfer / Object Swap | Reusa un movimiento probado con el producto propio |
| Iterar un ganador | Seedance 2.5 `video-edit` / `video-extend` | Cambia el hook sin rehacer el cuerpo |

`spokesperson.type = real_creator | real_expert` **no se genera**: la pantalla muestra el shot list para grabar (`shot_list_real_version`) y un espacio para subir el video.

### 3.3 Selección de tomas (QA automático + humano)

Cada imagen o clip generado pasa por un chequeo con Claude (visión) antes de mostrarse. Es el `take_checklist` de `productor-clips` y el checklist de `generador-estaticos`:

- producto idéntico a la foto de referencia (forma, color, piezas y **etiqueta legible**);
- **texto exacto:** cada texto del prompt aparece escrito igual (tildes, ¿, ñ); no hay texto de más, inventado ni en otro idioma; no aparece ninguna promesa que no estaba en el prompt;
- manos con 5 dedos;
- mismo personaje que en la ficha;
- nada importante en las zonas seguras (9:16: 250 px arriba, 340 px abajo).

Una toma que falla se marca `rejected_qa` con el motivo, no se cobra otra vez al comerciante y el sistema pide una toma nueva (máximo 2 reintentos). El comerciante elige entre las que pasan.

### 3.4 Qué cambia en los agentes

Son cambios pequeños en los prompts (sube `*_PROMPT_VERSION`):

- `generador-estaticos`: es el cambio más grande, por la decisión 3.
  - Sale la regla "texto nunca dentro de la imagen" y la plantilla por capas.
  - Cada concepto entrega un `render_prompt` en inglés: la escena, el producto "from the reference image, kept exactly as it is", y **cada texto en el idioma del mercado entre comillas**, con su rol (titular, callout, badge) y "No other text".
  - Entrega `preset_candidates` (ids del catálogo real que recibe en el prompt) y `ratios: ["1:1", "9:16"]`.
  - Las 5 variantes de titular pasan a ser 2–3, porque cada una es una generación.
- `productor-clips`: `cost_estimate_usd` usa la tabla de precios de §4 en vez de los $0.30 fijos por clip. Los `keyframes[].references` mapean a `image_urls` en orden (producto primero).
- `guionista-ugc` y `copywriter`: sin cambios.

---

## 4. Costo estimado por producto

**Precios reales de `/estimate`** (cuenta del comerciante, 2026-09-23, con un 15% de descuento aplicado). Los "desde" del catálogo son el caso más barato (1k, calidad baja, sin preset) y **no sirven** para presupuestar anuncios terminados:

| Llamada | USD por unidad |
|---|---|
| Marketing Studio 2.0 **con preset**, 2k, alta (el preset fuerza calidad alta) | **$0.320** |
| Marketing Studio 2.0 con preset, 1k | $0.171 |
| Marketing Studio 2.0 sin preset, 2k, media | $0.089 |
| Marketing Studio 2.0 sin preset, 2k, baja | $0.030 |
| Marketing Studio 2.5 Flare / Sunburst | Por tokens (imagen de salida $30/1M); `/estimate` no da monto |
| Kling 3.0 std image→video, 5 s | $0.357 ($0.071/s) |

| Lote | Cálculo | USD aprox. |
|---|---|---|
| Estáticos: 2 ángulos × 5 conceptos × 2 proporciones × 2 tomas, preset 2k | 40 × $0.32 | **~$12.80** |
| Lo mismo, pero probando en 1k y subiendo a 2k solo lo aprobado | 40 × $0.171 + 10 × $0.32 | **~$10.00** |
| Personaje: Soul 2 (4) + Soul ID | $0.013 + $2.50 | ~$2.51 |
| Video de 30 s con B-roll: 8 keyframes × 2 tomas + 8 clips × 4 s × 2 tomas en Kling std i2v | 16 × $0.089 + 64 s × $0.071 | **~$6.00** |

Tope por defecto: **$25 por producto** (editable en Ajustes). Al llegar al 80%, se avisa antes de lanzar el lote. Recomendación: generar el primer lote en **1k** y re-generar en 2k solo los conceptos aprobados. Eso es otra generación, no un reescalado, y el QA vuelve a correr.

---

## 5. Guardrails (heredados de los agentes + nuevos)

1. **Fidelidad del producto.** Referencia real en cada pieza con producto, más el QA de §3.3.
2. **Personas de IA.** Solo narrador, demostrador o dramatización etiquetada. Nunca cliente con testimonio, experto con credencial ni antes/después de una persona. `ai_disclosure_required` se propaga a Anuncios y la etiqueta "AI-generated" se compone en el video.
3. **El texto horneado es texto publicitario.** Pasa por las mismas reglas que el copy:
   - claims de salud solo con "ayuda a", "apoya" o "diseñado para";
   - sin atributos personales en segunda persona;
   - sin cifras, estrellas ni garantías que no estén en la ficha.
   El QA de §3.3 rechaza cualquier texto que el modelo agregue por su cuenta.
4. **Antes/después:** sin cuerpos ni personas reales. Muestra estados del problema o del producto; si aparece un cuerpo, solo ilustrado y con "Ilustración. Los resultados varían."
5. **Genjutsu:** solo con videos **propios o con licencia**. Nunca con anuncios de terceros sacados de bibliotecas de anuncios (derechos de autor e imagen de la persona).
6. **Sin parecidos** a personas reales, famosos ni marcas de terceros en prompts o referencias.
7. **`moderation: "auto"`.** Un resultado `nsfw` se muestra como "Higgsfield rechazó la imagen" y no se reintenta con el mismo prompt.
8. **Cifras, estrellas y garantías** que se escriben en el prompt salen de la ficha (`needs_data` si faltan). Los presets de Social Proof solo se ofrecen con reseñas reales aprobadas.

---

## 6. Modelo de datos y arquitectura

### 6.1 Tablas (migración `20261004000000_creatives.sql`)

- **`creative_runs`**: una corrida por agente (`agent` ∈ `static_generator | ugc_writer | clip_producer | copywriter`). Tiene la forma común de las otras corridas (`status pipeline_run_status`, `input jsonb`, `error_code`, `error_message`, `started_at`, `finished_at`) y una activa por producto y agente (índice único parcial).
- **`creative_concepts`**: salida de los agentes. `kind` (`static | script | production_plan | ad_copy`), `angle_brief_id`, `payload jsonb`, `status content_status`, `prompt_version`.
- **`creative_assets`**: una fila por pieza renderizada o compuesta.
  - Origen: `concept_id`, `parent_asset_id` (keyframe → clip), `role` (`static | character_ref | keyframe | clip | final_video`), `preset_id`, `ratio`, `baked_texts jsonb` (los textos pedidos, para el QA).
  - Parámetros: `provider = 'higgsfield'`, `endpoint`, `input jsonb`, `ratio`, `take`.
  - Cola: `hf_request_id` (único), `hf_status`, `status content_status`, `qa jsonb`.
  - Resultado y costo: `storage_path`, `cost_usd`.
- **`hf_character_refs`**: la Soul ID por producto (`hf_reference_id`, imágenes elegidas, estado).
- Costos: agregar `provider` y `cost_usd` a **`ai_generations`**, para que Claude y Higgsfield queden en un solo registro.
- Bucket privado **`creative-media`** bajo `<user_id>/<product_id>/`. `lib/products/delete.ts` debe borrarlo (hoy tampoco borra `ad-media`: arreglarlo junto).

### 6.2 Cola y webhooks

- `POST /api/products/[id]/creatives/generate` valida el tope de costo, pide `/estimate`, inserta los `creative_assets` en `queued` y los envía respetando la concurrencia de la cuenta. Las filas que no caben quedan en `queued` local.
- Webhook: `POST /api/webhooks/higgsfield?token=<HMAC(asset_id)>`. Responde en <10 s, deduplica por `hf_request_id + status`, descarga el resultado a `creative-media`, corre el QA y envía el siguiente de la cola.
- Respaldo: `pg_cron` cada 2 min llama a `/api/cron/creatives-sync` (consulta `GET /requests/{id}/status` de lo que lleva más de 5 min, envía lo pendiente y expira lo trabado a los 30 min).
- La pantalla consulta cada 2.5 s, como `copy.tsx`.

### 6.3 Credenciales

**Clave propia de cada comerciante** (decisión 1):

- **Vault:** `TokenKind` (`lib/integrations/tokens.ts:9`) agrega `"higgsfield"`. Se guarda `KEY_ID:KEY_SECRET` como un solo secreto; nunca llega al navegador.
- **Conexión:** tabla `higgsfield_connections` (`user_id`, `key_id_hint` con los últimos 4 caracteres, `status`, `concurrency_limit`, `checked_at`, `last_error`). Sigue el patrón de `meta_connections`.
- **Ajustes:** `ConnectionCard` "Higgsfield" con un campo para la clave y un enlace a `console.higgsfield.ai`.
  - Al guardar, se valida con una llamada barata (`GET /marketing-studio/image/presets?size=1`): 401 → "La clave no es válida"; 404/423/503 → "Tu cuenta no tiene acceso a este modelo".
  - Muestra el estado con `StateChip` y ofrece "Desconectar", que borra el secreto de Vault.
- **Durante la generación:**
  - Si Higgsfield responde 401 a mitad de un lote, la conexión pasa a `invalid`, el lote se detiene y la etapa vuelve a `locked` con "Vuelve a conectar Higgsfield en Ajustes".
  - Un error de créditos insuficientes se muestra tal cual, con el enlace a su consola; no se reintenta.
  - La concurrencia es **por comerciante**: la cola de §6.2 usa su propio `concurrency_limit` (por defecto 4, y se ajusta al primer 400 de "Maximum number of concurrent requests").
- **Variables de la plataforma:** `higgsfieldEnv()` en `lib/integrations/env.ts` solo lleva `HF_WEBHOOK_SECRET`, para firmar el token del webhook, y va documentada en `.env.example`.
- **Tope de costo (§4):** sigue existiendo aunque pague el comerciante. Evita sorpresas en su cuenta.
- **Borrado:** el cron diario de conexiones (`/api/cron/connections`) también revalida la clave. `lib/products/delete.ts` no toca la clave, que es por comerciante y no por producto.

### 6.4 Código

| Módulo | Contenido |
|---|---|
| `lib/integrations/higgsfield/client.ts` | `submit`, `status`, `cancel`, `estimate`, `uploadUrl`, `listPresets`, `createReference` (fetch directo con `Key`; el SDK TS v2 solo expone `subscribe`) |
| `lib/creatives/route.ts` (+ test) | Enrutador de §3.2 |
| `lib/creatives/prompts.ts`, `schemas.ts` | Los 4 agentes, con `marketBlock` y `pricingBlock` |
| `lib/integrations/higgsfield/presets.ts` | Catálogo de presets por comerciante, cacheado 24 h (nombre, grupo, portada, proporción) |
| `lib/creatives/qa.ts` | QA visual con Claude |
| `lib/creatives/store.ts` | `start*`, `run*`, `expireStale*` |
| `lib/data/creatives.ts` | Getter de la pantalla |

### 6.5 Etapa en el pipeline

- `StageKey` agrega `"creativos"`, con segmento `creatives` en `STAGE_SEGMENT` y ruta `/products/[id]/creatives`.
- Posición: **entre Publicar y Anuncios**, porque alimenta Anuncios.
- En `stages.ts`, `creativesStage(anglesDone, f.creatives)` con `optional: true` y medidor `"optional"`. `stages.test.ts` pasa a 8 elementos.

| Condición | Estado | Descripción |
|---|---|---|
| Ángulos sin aprobar | `locked` | "Después de aprobar los ángulos" |
| Higgsfield sin configurar | `locked` | "Conecta Higgsfield en Ajustes" |
| Nada generado | `available` | "Genera anuncios de imagen y video" |
| Generando | `current` | "Generando 12 de 30" |
| Hay piezas `generated` | `review` | "8 por revisar" |
| ≥1 aprobado | `done` | "6 imágenes · 2 videos" |

- **Anuncios:** `CreativeSlot` agrega la pestaña "Generados" con los `creative_assets` aprobados. Al elegir uno, se copia a `ad-media` y se usan sus textos de `copywriter` como textos por defecto (`spec-anuncios.md` §7.3).

### 6.6 Pantalla (`components/screens/creatives.tsx`)

- Pestañas **Imágenes** y **Videos**, agrupadas por ángulo (primario o secundario).
- **Imágenes:** tarjeta por concepto con familia, palanca, preset (con su portada) y los textos que se van a hornear, editables **antes** de generar. Después: carrusel de tomas × proporciones, el resultado del QA, `StatusBadge`, "Aprobar" y "Otra toma". Cambiar un texto después de generar es "Generar de nuevo con este texto", con su costo a la vista.
- **Videos:** guion de 30 s en tabla (tiempo | visual | voz | texto), ficha de personaje con las 4 opciones de Soul, y clips por escena con sus tomas.
- Una acción primaria por vista: "Generar lote (≈ $X)". El costo siempre está a la vista.
- Estados vacíos y bloqueados con el motivo en texto; ✨ en todo lo generado.
- Fixtures en `app/dev/screens/creatives/` con `?state=…`.

---

## 7. Fases

| Fase | Alcance | Criterio de salida |
|---|---|---|
| **F0 · Spike (1–2 días)** | Cliente Higgsfield + script: 3 estáticos con Marketing Studio (edición y preset), 1 B-roll con Kling i2v, `/estimate`, webhook. Listar presets reales | Fidelidad del producto aceptable en ≥2 de 3 tomas; costo real contra la tabla §4 |
| **F1 · Estáticos** | Etapa, tablas, `generador-estaticos`, enrutador, catálogo de presets, QA de texto y producto, aprobación, "Generados" en Anuncios, `copywriter` | Un producto real pasa de ángulos aprobados a un anuncio de imagen lanzado en pausa |
| **F2 · Video B-roll** | `guionista-ugc` + `productor-clips`, Soul ID, keyframes, clips Kling, video "demo satisfactoria" sin voz, con música + subtítulos compuestos | Video de 15–30 s sin narrador, exportado 1080×1920 |
| **F3 · Clips hablados** | Prueba de TTS + Seedance 2.5 r2v / Grok Video con audio; si no sincroniza, narrador en off sobre B-roll | Decisión documentada con 3 muestras |
| **F4 · Montaje y remix** | EDL → ffmpeg en worker, variantes de hook, Genjutsu con video propio, Seedance `video-edit` para iterar | Variantes de hook sin rehacer el cuerpo |

---

## 8. Decisiones

**Tomadas (2026-09-23):**

1. **Cuenta de Higgsfield:** clave propia de cada comerciante (§6.3). El costo de generación lo paga su cuenta; DropFlex no revende créditos.
2. **Posición de la etapa:** entre Publicar y Anuncios (§6.5), porque alimenta Anuncios.
3. **La imagen sale completa del modelo:** preset + foto del producto + textos exactos en el prompt. Sin composición, re-renders ni texto incrustado después (§0.3, §2.4). Proporciones nativas 1:1 y 9:16.

**Abiertas:**

4. **Voz para F3:** proveedor de TTS (ElevenLabs u otro), con voces de catálogo, nunca clonadas de terceros.
5. **Tope de costo por producto:** $25 por defecto (§4).
6. **Resolución del primer lote:** 1k para elegir y 2k solo para lo aprobado (propuesta), o 2k directo.
