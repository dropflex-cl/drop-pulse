# Spec: prompts simples, mejores resultados

> Estado: en curso (2026-10-04): fase 0 lista; las decisiones abiertas (§11) se tomaron. Aplica a todos los pasos de IA después de Ángulos. Mantiene las
> funciones, el flujo y la UI; cambia cómo se le pide el trabajo al modelo.

## 0. Resumen

El orquestador de ángulos v9 (`docs/spec-angulos-testeo.md` §4.2) mostró un patrón: con **menos
contexto y menos reglas**, Opus propone mejores ángulos que con la ficha, el cliente ideal y 70 campos
que llenar. Un chat con cinco viñetas del proveedor le ganaba a un prompt de 50 líneas. Las causas
fueron cuatro, y se repiten en los demás pasos:

1. **El contexto se pega como JSON** (la ficha y el cliente ideal enteros) y el modelo copia sus frases
   en vez de pensar.
2. **Una llamada hace dos trabajos** (crear y encajar en un formato, o crear dos piezas distintas), y el
   segundo hace fallar al primero.
3. **Las taxonomías van como menú** (6 formas, 14 patrones con cuotas), y el modelo llena una de cada
   una en vez de buscar la mejor.
4. **Las reglas van antes de crear** (cientos de líneas de «nunca»), y el modelo juega a la defensiva.

Este spec aplica el mismo arreglo a Ganchos, Página del producto, Guion de video, Estáticos, Imágenes de
la página y Desarrollo de ángulo, en fases que se miden una por una.

## 1. Diagnóstico

### 1.1 Tamaño de cada prompt de sistema (mercado CL, medido el 2026-10-04)

| Paso | System | Reglas (líneas con viñeta) | Prohibiciones | Contexto del usuario |
|---|---|---|---|---|
| Página del producto (`page_copy`) | ~14.300 tokens, 335 líneas | 180 | 187 | ficha + cliente ideal en JSON, ~28.000 tokens |
| Ganchos (`angle_hooks`) | ~6.800 tokens, 183 líneas | 82 | 84 | ficha + cliente ideal en JSON |
| Imágenes de la página (`page_plan`) | ~3.200 tokens | 52 | 31 | ficha + cliente ideal en JSON, ~16.000 tokens |
| Guion de video (`ugc_script`) | ~2.700 tokens | 52 | 33 | ficha + cliente ideal en JSON |
| Estáticos (`creative_concepts`) | ~2.200 tokens | 46 | 28 | ficha + cliente ideal en JSON, ~18.000 tokens |
| Desarrollo de ángulo (`angle_brief`) | ~1.300 tokens | 45 | 18 | ficha + cliente ideal en JSON |
| Cliente ideal (`customer_avatar`) | ~1.350 tokens | 20 | 15 | la ficha |
| Ficha (`product_brief`) | ~1.000 tokens | 15 | 20 | lo del proveedor e imágenes |
| **Orquestador v9** (referencia) | **~440 tokens** | 12 | 6 | texto corto, sin JSON |

### 1.2 Respuestas rechazadas por el código (`ai_generations`, últimos 30 días)

| Paso | Rechazadas | Cuándo | Lo que más falla |
|---|---|---|---|
| Ganchos | 10 de 15 | 2 y 3 de octubre (versión actual) | La **versión de mascota** de cada gancho: forma que se lee sexual (14), palabras habladas de más (10). Material real que falta (11) |
| Guion de video | 8 de 16 | 26 de septiembre | La **silueta de la mascota** (6), qué imagen clave usa cada toma (4), la suma de duraciones (2) |
| Página del producto | 10 de 17 | 8 del 24 al 26 de septiembre, 1 el 3 de octubre | Topes de caracteres de campos de componentes |
| Estáticos | 6 de 10 | 24 y 26 de septiembre | Sin `problems` registrados: son anteriores a la columna |
| Imágenes de la página | 1 de 7 | 3 de octubre | Topes de caracteres de badges y callouts |

**Ojo:** buena parte de los rechazos son de versiones viejas de los prompts (antes de `promptLimit` y
de las correcciones por partes). La evidencia vigente y fuerte es la de Ganchos y la calidad de los
ángulos. Por eso cada fase de este spec **mide antes y después** (§9) y no se da por buena sin datos.

### 1.3 El caso que lo demuestra

| Chat con 5 viñetas | Orquestador v8 con todo el contexto |
|---|---|
| «Tu mamá ya no te pregunta "¿qué?"… porque dejó de preguntar.» | «Mi papá se ríe medio segundo tarde. No entendió el chiste.» (frase textual del cliente ideal) |
| «Si la tele de tu papá se escucha desde la calle, esto es para ustedes.» | no existía |
| «Un audífono en un centro auditivo cuesta entre $400.000 y $1.500.000. Este no.» | rechazado por el código (monto fuera de PRECIO Y OFERTA) |

## 2. Principios

**P1. La pregunta de un experto, con poco contexto.** El system dice quién es el experto, qué le piden
y los límites que no se pueden comprobar en código. Nada más. El contexto es un resumen en texto de lo
que ese paso necesita (§3), nunca la ficha y el cliente ideal en JSON.

**P2. Una tarea por llamada.** Crear (effort alto) y encajar, clasificar o repartir (effort bajo) son
llamadas distintas. La segunda es barata y casi nunca falla.

**P3. Lo comprobable se revisa en código, después.** En el prompt solo van los límites que el código no
puede ver (la ley, el tono, lo que es creíble). Los topes, montos, palabras prohibidas y cuotas se
validan después y, si fallan, se corrige solo la parte que falló.

**P4. Sin taxonomías como menú.** Las formas, patrones y arquetipos sirven para **clasificar** lo que se
creó (para la UI y los pasos siguientes), no para que el modelo los llene. Nada de cuotas («al menos 5
patrones, máximo 3 por patrón»).

**P5. Los topes de caracteres los resuelve el paso de encaje.** El que crea escribe la idea; el que
encaja la ajusta a cada caja con `promptLimit`.

**P6. No agregar reglas sin un caso.** Una regla nueva en un prompt creativo necesita un ejemplo real de
producción que la pida, y entra en el validador si se puede comprobar.

## 3. Contexto compartido: `lib/ai/context.ts` (nuevo)

Reemplaza los `json(c.brief)` y `json(c.avatar)` de los 6 prompts (`lib/angles/prompts.ts`,
`lib/hooks/prompts.ts`, `lib/copy/prompts.ts`, `lib/creatives/prompts.ts`,
`lib/page-images/prompts.ts`, `lib/video/prompts.ts`). Funciones puras, con tests:

| Función | Qué devuelve |
|---|---|
| `productFacts(brief)` | Nombre, qué hace, cómo funciona y datos clave, en viñetas. Lo comprobado, no lo que promete el proveedor |
| `supplierText(baseInfo)` | El texto del proveedor tal cual, recortado (lo usa quien tiene que criticarlo) |
| `buyerLine(avatar)` | Una línea: quién compra y para quién (el `summary`) |
| `buyerVoice(avatar, n)` | Hasta `n` frases o momentos del cliente ideal, **solo** para los pasos que escriben con sus palabras (página, guion) |
| `proofLine(brief, reviews)` | Experto sí/no y cuántas reseñas reales hay |
| `reviewQuotes(reviews, n)` | Hasta `n` reseñas citables (solo donde se citan: página, chat de WhatsApp) |
| `angleLine(angle)` | Título, gancho, a quién le habla, tono y ancla de mercado (lo que hoy hace `angleMessage`) |

Qué recibe cada paso:

| Paso | productFacts | supplierText | buyerLine | buyerVoice | proofLine | reviewQuotes | angleLine | Precio |
|---|---|---|---|---|---|---|---|---|
| Orquestador (v9, ya está) | ✓ | ✓ | ✓ | | ✓ | | | ✓ |
| Desarrollo de ángulo | ✓ | | ✓ | 5 | ✓ | 3 | ✓ | ✓ |
| Ganchos | ✓ | | ✓ | 5 | ✓ | | ✓ | ✓ |
| Página: argumento | ✓ | | ✓ | 6 | ✓ | | todos | ✓ |
| Página: componentes | ✓ | | | | ✓ | ✓ | | ✓ |
| Guion de video | ✓ | | ✓ | 3 | | | ✓ | ✓ |
| Estáticos | ✓ | | ✓ | | ✓ | | todos | ✓ |
| Imágenes de la página | ✓ | | ✓ | | | | todos | |

El diferenciador confirmado y las fechas comerciales siguen yendo donde van hoy. `marketBlock`,
`pricingBlock` y la imagen base (`imagesForGeneration`) no cambian.

## 4. Fase 1: Ganchos

**Hoy** (`lib/hooks/prompts.ts`, `lib/hooks/schemas.ts`, `lib/pipeline/hooks.ts`): una llamada escribe
10 tríadas con 14 patrones (con plantillas), 6 arquetipos, 6 primeras tomas, cuotas de patrones, 4
puntajes, `rank`, riesgo, material real, cita de MATERIA PRIMA, lectura sin sonido, `delivery` **y la
versión de mascota de cada uno**. Después, el crítico las ordena.

**Cambio**

1. **Prompt corto.** El experto en ganchos recibe el ángulo con su gancho v9 (`angleLine`), los hechos,
   quién compra, 5 frases del cliente ideal y el precio. Le piden: «10 ganchos para video que detengan
   el scroll: al menos 3 son el gancho del ángulo dicho para video; los demás, otras entradas a la misma
   idea». Los límites: Meta, salud, nada inventado, pago contra entrega fuera de los primeros 3 s, sin
   lenguaje de estudio.
2. **La versión de mascota sale de esta llamada.** La escribe el guion de mascota (§6), que ya valida la
   silueta. Es la causa de 24 de los ~37 problemas registrados.
3. **Sin cuotas de patrones.** `pattern` sigue en el esquema (la UI lo muestra), pero sin «al menos 5
   patrones, máximo 3 por patrón» y sin la biblioteca de plantillas en el prompt. La variedad la pide la
   frase «otras entradas a la misma idea», y el crítico la ordena.
4. **El esquema se queda con lo que alguien lee**: `text`, `follow_up`, `on_screen`, `silent_read`,
   `delivery`, `visual_first_3s`, `opening_shot`, `first_motion`, `pattern`, `risk`, `risk_reason`,
   `needs_real_material`, `policy_ok`, `rank` y `source_quote`. Se quitan `promises_only_what_arrives`,
   `production_notes` y `diagnosis.core_pain`, que nadie lee. `scores` y `mechanism` se quitan del
   esquema nuevo y se siguen leyendo en los ganchos de antes (`lib/hooks/select.ts`).
5. **El crítico se queda igual** (`lib/hooks/critic.ts`).

**Lo que no cambia en la UX:** los 10 ganchos por ángulo, su orden, el recomendado, «Otros ganchos», la
edición, la etiqueta del patrón, la primera toma y los avisos de material real o riesgo.

**Lo que cambia en la UI:** el gancho deja de mostrar la marca «Mascota». En Videos › Mascota el guion
muestra su apertura igual que hoy.

**Validación** (`hookProblems`): se quitan las reglas de la versión de mascota y de las cuotas de
patrones. Se quedan los largos, la política, los montos (con el ancla de mercado), el material real, el
pago contra entrega fuera del gancho, el lenguaje de estudio y `rank` sin empates. «Al menos 3 citas de
MATERIA PRIMA» queda como decisión abierta (§11).

**Versión:** `HOOKS_PROMPT_VERSION` 6.

## 5. Fase 2: Página del producto

**Hoy** (`lib/copy/prompts.ts`, `lib/copy/write.ts`, `lib/pipeline/copy.ts`): una sola llamada escribe la
ficha y 16 componentes. Cada componente trae en el system su manual completo (dónde va, qué objeción
responde, palancas, datos reales, reglas, prohibiciones y un ejemplo de otro producto): 51.000
caracteres antes de escribir.

**Cambio: dos pasos, como en los ángulos.**

1. **El argumento** (paso nuevo `page_argument`, effort high). Un redactor de respuesta directa escribe
   el argumento de venta de la página: el titular, la promesa central desde el diferenciador, lo que
   aporta cada ángulo aprobado (un momento, un beneficio, una respuesta), las 5 a 8 objeciones con su
   respuesta y el cierre con el pago al recibir. Texto libre en secciones cortas, sin topes de
   caracteres ni componentes. Prompt de ~30 líneas.
2. **Los componentes** (`page_copy`, effort medium). Reparte el argumento en la ficha y los componentes.
   Cada componente recibe una guía de 3 líneas (dónde va, qué objeción responde, su forma) en vez del
   manual. Los topes, tokens y reglas los cuidan el esquema y `pageProblems`, y la corrección por partes
   de `writePage` sigue igual. Sin ejemplos de otros productos.

**Lo que no cambia:** se escriben todos los componentes como hoy (el comerciante sigue viéndolos antes de
activarlos), `page_components`, los modos de reescritura (`CopyMode`: lo no aprobado, toda la página o un
componente), «Volver a escribir con IA», los tokens de hechos, las reseñas por id, la vista previa y el
color. Reescribir un componente usa el argumento guardado y no lo vuelve a pagar.

**Datos:** `copy_runs.payload.argument` guarda el argumento. Un `component.content.ts` conserva sus
reglas para el validador y su `examples` para los tests; lo que entra al prompt se arma con una función
`componentBrief(c)`.

**Versión:** `COPY_PROMPT_VERSION` +1. **Costo:** se agrega `page_argument` a `AI_STEPS`.

## 6. Fase 3: Guion de video (UGC y mascota)

**Hoy** (`lib/video/prompts.ts`, `lib/video/schemas.ts`): una llamada escribe a la vez lo que se dice y
toda la producción (tomas de 4–8 s, 24–32 s en total, K1, imágenes clave por toma, cámara, anclas del
B-roll, textos en pantalla, apertura) y, en la mascota, inventa el personaje.

**Cambio**

1. **El guion** (`ugc_script`, effort high): lo que dice la persona o el personaje, toma por toma, con
   su entrega, desde el gancho del ángulo y el AIDA. Pocas reglas en el prompt: 3 palabras por segundo,
   sin montos en la voz, la persona de IA no dice su edad, la primera frase es el gancho. En la mascota,
   esta llamada escribe también su versión del gancho (lo que hoy hace Ganchos).
2. **El plan de tomas** (paso nuevo `video_plan`, effort low): las imágenes clave, la cámara de cada
   una, el B-roll anclado a palabras del guion y los textos en pantalla. Recibe el guion ya validado.
   Lo que es pura regla (cada toma hablada usa una imagen clave con el personaje, K1 solo el personaje,
   duraciones) lo arma el código cuando se puede y se valida igual que hoy.
3. **La mascota parte de siluetas seguras** (`MASCOT_BODIES` en `lib/video/catalog.ts`): 6 a 8 cuerpos
   redondos o anchos con su descripción en inglés probada en Flare (gota, nube, frasco, almohada…). El
   modelo elige uno y le pone cara, color (nunca piel) y accesorios. Elimina la falla más común sin
   pedirle nada nuevo al comerciante.

**Lo que no cambia:** los 5 pasos de Videos, los dos formatos por ángulo, la edición de líneas, las
imágenes clave, los clips, el paquete de montaje, `scriptProblems` (dividido entre los dos pasos) y los
topes por comerciante.

**Versión:** las versiones del guion UGC y de mascota +1. **Costo:** `video_plan` en `AI_STEPS`.

## 7. Fase 4: Estáticos

**Hoy** (`lib/creatives/prompts.ts`): cada uno de los 6 conceptos trae, además de la idea y los textos,
la dirección de arte completa (paleta, tipografía, `layout`, unidades, partes del kit y ubicación de
cada texto), con `product_look` y `kit` del producto.

**Cambio**

1. **Los conceptos** (`creative_concepts`, effort high): por ángulo, la idea del anuncio, la familia, el
   titular y los textos horneados, y por qué va a vender. Prompt corto.
2. **La dirección de arte** (paso nuevo `creative_art`, effort low): por concepto, la paleta, la
   tipografía, el `layout`, las unidades, las partes del kit y la ubicación de cada texto, con la foto
   base. `product_look` y `kit` se piden una vez por producto y se guardan.
3. `conceptProblemsByConcept` se divide: lo de los textos (largos, montos, salud) revisa el paso 1; lo
   de la dirección de arte (callouts solo hacia partes visibles, kit), el paso 2. Cada uno corrige solo
   lo suyo.

**Lo que no cambia:** 6 conceptos, las familias, el render en `lib/creatives/render.ts`, el QA, los dos
proveedores, «Proponer otros», el chat de WhatsApp y la pantalla.

**Versión:** la de creativos +1. **Costo:** `creative_art` en `AI_STEPS`.

## 8. Fase 5: Imágenes de la página y Desarrollo de ángulo

Son los que mejor funcionan hoy. Solo:

- **Contexto compartido** (§3) en vez de la ficha y el cliente ideal en JSON.
- **Imágenes de la página:** los textos del badge y el callout pasan por `promptLimit` (son lo único que
  falla). El director sigue eligiendo el mundo visual y un beneficio por ángulo.
- **Desarrollo de ángulo:** las 6 guías (`GUIDES`) se quedan como estructura opcional (la v9 ya dice
  que el gancho y el tono mandan). Se quitan del esquema `go` y `fit_reason`, que nadie lee.

## 9. Medición

Cada fase se mide antes de pasar a la siguiente.

**Métricas automáticas** (`npm run ai:metrics -- [--step …] [--days …]`, `scripts/ai-metrics.ts`: solo lee
`ai_generations` por `step` y `prompt_version`, la columna de la migración
`20261031000000_ai_generation_prompt_version.sql`; las filas de antes no la traen y se separan por fecha):

- Tasa de rechazo (intentos con `error_code` / intentos).
- Costo por resultado aceptado (suma de los intentos / resultados guardados).
- Tiempo hasta el resultado.

**Métricas del comerciante** (lo que de verdad importa):

| Paso | Señal |
|---|---|
| Ganchos | % de ganchos editados, «Otros ganchos» por desarrollo, posición del gancho que termina en el anuncio |
| Página | % de componentes reescritos o editados antes de aprobar |
| Guion | Líneas editadas, «Otro guion» por ángulo |
| Estáticos | Piezas aprobadas / generadas, «Proponer otros» |

**Comparación a ciegas:** `scripts/eval-hooks.ts` y `scripts/eval-models.ts` se extienden para correr la
versión vieja y la nueva sobre 3 a 5 productos reales (con una clave de Anthropic de scripts) y mostrar
los resultados lado a lado sin decir cuál es cuál.

**Criterio para quedarse con la versión nueva:** la tasa de rechazo baja, el costo por resultado no sube
más de un 20 % (hay una llamada más, pero barata) y, en la comparación, el comerciante prefiere la nueva
en la mayoría de los productos.

## 10. Lo que no cambia (invariantes)

- El flujo y las pantallas de cada etapa. Todo cambio visible está nombrado en su fase.
- Las reglas que no se negocian: Meta, salud, nada inventado, precios de PRECIO Y OFERTA (más el ancla
  de mercado verificada en ángulos y ganchos), tokens de hechos en la página, pago al recibir, imagen
  base primero, clave del comerciante, `recordAiGeneration` con `problems`, `retryableContent` en los
  reintentos y `promptLimit` en los topes.
- Los contratos que lee la UI y los pasos siguientes (`angle_briefs.payload.hooks`, `page_components`,
  `video_scripts`, `creative_concepts`). Lo que se quita de un esquema se sigue leyendo en lo guardado.
- Los topes por comerciante en 24 h.

## 11. Decisiones (tomadas por el comerciante, 2026-10-04)

1. **Citas de MATERIA PRIMA en los ganchos:** pasan de cuota («al menos 3») a opcionales («puede
   citar»). Se mide cuántos citan (`npm run ai:metrics -- --step angle_hooks`, columna `con_cita`).
2. **La marca «Mascota» en el gancho:** desaparece de la lista de ganchos. La apertura de la mascota se
   sigue viendo en Videos › Mascota.
3. **La página sigue escribiendo todos los componentes**, no solo los activos.

## 12. Plan

| Fase | Qué | Archivos principales | Medir |
|---|---|---|---|
| 0 | Contexto compartido (`lib/ai/context.ts`) y consulta de métricas | `lib/ai/context.ts`, `scripts/` | Línea base de cada paso |
| 1 | Ganchos | `lib/hooks/*`, `lib/pipeline/hooks.ts`, `lib/angles/store.ts` | Rechazo y ganchos editados |
| 2 | Página del producto | `lib/copy/*`, `lib/pipeline/copy.ts`, `lib/ai/costs.ts` | Rechazo y componentes reescritos |
| 3 | Guion de video y siluetas de mascota | `lib/video/*`, `lib/pipeline/video.ts` | Rechazo y líneas editadas |
| 4 | Estáticos | `lib/creatives/*`, `lib/pipeline/creatives.ts` | Rechazo y piezas aprobadas |
| 5 | Imágenes de la página y Desarrollo de ángulo | `lib/page-images/*`, `lib/angles/*` | Rechazo |

Cada fase sube su versión de prompt, actualiza `CLAUDE.md` y su spec, y lleva tests de los validadores
y del contexto que recibe el modelo (que no traiga la ficha ni el cliente ideal en JSON).

## 13. Avance

### Fase 0 (2026-10-04): contexto compartido y línea base

- `lib/ai/context.ts` (con tests): `productFacts`, `productFactLines`, `supplierText`, `buyerLine`,
  `buyerVoice`, `proofLine`, `reviewQuotes`, `angleLine` y `marketAnchorLine` (que vivía en
  `lib/angles/prompts.ts`). El orquestador v9 ya los usa, con el mismo texto que antes.
- `ai_generations.prompt_version` (`PROMPT_VERSIONS` en `lib/ai/versions.ts`; el guion de mascota pasa
  la suya) y `npm run ai:metrics`.

**Línea base en producción** (2026-09-24 al 2026-10-04, sin versión registrada todavía):

| Paso | Intentos | Rechazo | US$ por resultado aceptado | Lo que más falla |
|---|---|---|---|---|
| Ganchos (`angle_hooks`) | 19 (3 sin créditos) | 58 % (11) | 0,71 | Versión de mascota: forma sexual (14) y palabras de más (13); material real (11) |
| Página (`page_copy`) | 17 | 59 % (10) | 0,92 | Topes de caracteres de componentes |
| Guion (`ugc_script`) | 16 | 50 % (8) | 0,45 | Silueta de la mascota (6), imagen clave de cada toma (4), duraciones (2) |
| Estáticos (`creative_concepts`) | 10 | 60 % (6) | 0,64 | Sin `problems` (anteriores a la columna) |
| Imágenes (`page_plan`) | 7 | 14 % (1) | 0,35 | Topes de badges y callouts |
| Desarrollo (`angle_brief`) | 19 | 0 % | 0,30 | — |

Ganchos en los desarrollos vigentes: ninguno de la versión 4 o 5; de los 151, 0 editados y 0
con cita del comprador.

### Fase 1 (2026-10-04): Ganchos, versión 6

- Prompt corto (~20 líneas) con el contexto de `lib/ai/context.ts` y la pregunta del §4; sin
  patrones como menú, arquetipos, cuotas, puntajes, ejemplo ni versión de mascota.
- `normalizeHooks` arregla en código lo que es regla (material real que falta, `real_footage`, citas
  que no están o no se usan, orden): en la línea base eran 13 problemas pagados.
- La mascota dice el gancho a su manera (`MASCOT_PROMPT_VERSION` 9); «También mascota» sale de la
  lista. Citas opcionales.
- Esquema: fuera `mechanism`, `scores`, `promises_only_what_arrives`, `mascot`, `production_notes`,
  `diagnosis.core_pain` y `diagnosis.secondary_archetype`; lo guardado se sigue leyendo.
- Medir después: `npm run ai:metrics -- --step angle_hooks` (rechazo de la v6 frente al 58 % y
  `con_cita`) y la comparación a ciegas de `scripts/eval-hooks.ts`.

### Fase 2 (2026-10-04): Página del producto, `COPY_PROMPT_VERSION` 8

- `page_argument` (nuevo, `lib/copy/argument.ts`, US$0,15 por defecto en `AI_STEPS`): el argumento en
  texto, con `argumentProblems` y un reintento. Se guarda en `copy_runs.payload.argument` y se reusa al
  reescribir un componente o lo no aprobado si nada cambió.
- `page_copy` reparte el argumento con `componentBrief` (3 líneas por componente) en vez del manual; el
  system bajó de ~51.000 caracteres a menos de 15.000 (test). Sin la ficha ni el cliente ideal en JSON.
- `scripts/eval-models.ts` corre los dos pasos y, con `savedPage`, deja la comparación a ciegas.
- Medir después: `npm run ai:metrics -- --step page_copy` y `--step page_argument` (rechazo frente al
  59 %, costo por página aceptada frente a US$0,92).
