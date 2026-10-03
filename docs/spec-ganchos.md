# Ganchos COD LatAm

Fuente: `agentes-creativos/hook-cod-latam.md`, el agente que escribe los ganchos (0–3 s) a partir de 85 anuncios COD activos y longevos (≥ 21 días, mediana 136) en 9 países, transcritos y codificados. Esta spec dice cómo entra a DropFlex y qué se cambió del original.

## Dónde vive

Es un paso propio (`angle_hooks`), no una sección del agente de ángulo:

```
angulo-<forma> (effort high) → el desarrollo, SIN ganchos
        ▼
agente de ganchos (effort medium, foto base + desarrollo + MATERIA PRIMA) → 10 tríadas ordenadas (rank) y diagnóstico
        ▼
crítico (effort low, solo lo que se ve y se oye) → su orden y qué entendió sin sonido; si detiene a < 4, una reescritura
        ▼                                                                           → angle_briefs.payload.hooks
        ▼
video (UGC y mascota) · estáticos · chat · texto del anuncio
```

- Corre dentro de `runBrief` (`lib/pipeline/angles.ts`), justo después del desarrollo, con hasta 2 intentos (los dos van en la misma función de 300 s). Si no salen, el desarrollo se guarda igual con `hooks: []` y `hooks_error`, y se piden con «Otros ganchos». Nunca se vuelve a pagar el desarrollo por los ganchos.
- «Otros ganchos» (`POST /api/products/[id]/angles/briefs/[briefId]?part=hooks`, `regenerateHooks` en `lib/pipeline/hooks.ts`) reescribe solo los ganchos, en la misma solicitud, con hasta 3 intentos y los ganchos anteriores como «no repetir». No cambia la aprobación ni `edited_at`: los ganchos no los leen la Página ni las Imágenes, así que no las deja desactualizadas. Con el desarrollo aprobado no se ofrece: primero «Volver a revisar». Tope: 30 por comerciante en 24 h.
- Sin migración: todo va en `angle_briefs.payload` (`hooks`, `recommended_hook`, `hook_diagnosis`, `hook_notes`, `hooks_version`, `hooks_error`; `hook_top` solo en los de antes de la versión 4). Los desarrollos de antes (`text`, `visual_first_3s`, `policy_ok`) se siguen leyendo.

## Qué se guarda por gancho

| Campo | Qué es |
|---|---|
| `pattern` | Uno de los 13 patrones (`HOOK_PATTERNS` en `lib/hooks/catalog.ts`) |
| `mechanism` | El mecanismo psicológico, en pocas palabras |
| `text` / `follow_up` | Hablado de 0 a 3 s (≤ 9 palabras) y segunda frase hasta los 6 s |
| `on_screen` | Texto en pantalla (≤ 6 palabras), legible sin sonido |
| `visual_first_3s` | La primera toma concreta |
| `silent_read` | Qué se entiende en 1 s sin sonido (versión 4) |
| `source_quote` | La frase de MATERIA PRIMA de la que parte, textual, o null (versión 4) |
| `delivery` | Cómo se dice (`HOOK_DELIVERIES`: confidencia, intriga, sorpresa, indignación contenida, seco, juguetón); manda en la voz de A1 (versión 4) |
| `scores` | Saliencia, relevancia, tensión y credibilidad, de 1 a 5 (hasta la versión 3: verificabilidad en vez de tensión) |
| `promises_only_what_arrives` | Lo que promete es lo que llega en la caja; false se reemplaza (versión 4) |
| `rank` | Su lugar, de 1 a 10: el del crítico o, si no corrió, el del agente. Los ganchos se guardan en ese orden (versión 4) |
| `review` | Lo que dijo el crítico: `stops`, `understood_muted` y `why` (versión 4) |
| `risk`, `risk_reason` | Riesgo de Meta o de rechazo en la entrega |
| `needs_real_material` | Qué material real falta (testimonio, bodega, experto), o null |
| `opening_shot`, `first_motion` | La primera toma de un video con IA y qué se mueve en el cuadro 0 (`docs/spec-video-detener-scroll.md` §3). `real_footage` si muestra el efecto o pide material real: el video con IA no la usa |
| `mascot` | La versión del gancho para el video de mascota (lo que dice el personaje, su texto en pantalla y su escena), o null si el patrón no encaja (§3.7 del mismo spec) |
| `policy_ok` | Del modelo; en un gancho editado, de las reglas de código |
| `edited` | El comerciante cambió el hablado |

El recomendado (`recommended_hook`) es el primero que se puede usar (`isUsable`) en ese orden. Hasta la versión 3 era el primero del top 3.

## Reglas en código (`hookProblems`, `lib/hooks/schemas.ts`)

- 10 ganchos, al menos 5 patrones y como mucho 3 por patrón.
- Largos: hablado ≤ 9 palabras, segunda frase ≤ 9 y pantalla ≤ 6. El prompt pide 8 y 5 (`promptLimit`).
- Un puntaje de 2 o menos descarta el gancho: se pide otro.
- Política: segunda persona sobre el cuerpo, la edad o la salud (`SECOND_PERSON_BODY`, `lib/hooks/policy.ts`, la misma regla del guion), promesas de salud, plazos de resultado y montos fuera de PRECIO Y OFERTA. Los montos se revisan con símbolo («$24.990») y hablados («24 mil 990 pesos»).
- El pago contra entrega y el envío gratis no van en el gancho (`COD_IN_HOOK`): en el corpus, solo 5 de 85 lo decían ahí.
- Confesión y respuesta a comentario sin reseñas reales, Autoridad sin experto real y Bastidores siempre tienen que decir en `needs_real_material` qué falta.
- `rank` de 1 a 10, un lugar por gancho y sin empates (versión 4: reemplaza el top 3 con variantes A/B, que nadie medía).
- `silent_read` no vacío, `delivery` de la lista y `promises_only_what_arrives` true.
- Al menos 3 ganchos con `source_quote`: la cita está textual en MATERIA PRIMA (sin contar tildes, mayúsculas ni signos, `quoteFound`) y el gancho usa al menos 2 de sus palabras de 4 letras o más. Sin MATERIA PRIMA no se pide.

## Quién usa qué (`lib/hooks/select.ts`)

`usableHooks` deja fuera los que rozan la política, los de riesgo alto y los que piden material real: los pasos con IA no tienen ese material. Ordena así: el recomendado (lo puede cambiar el comerciante), después el top de los de antes, después por `rank` y al final por puntaje.

- **Video UGC y mascota** (`lib/video/prompts.ts`): reciben los usables con su tríada y eligen uno (`hook_source`). A1 abre con el hablado, sin nada antes, y su primera frase se dice con el `delivery` del gancho (el tono cálido del video empieza en la segunda); el primer texto en pantalla es el del gancho y se ancla en las primeras palabras de A1; la primera imagen es su visual (UGC: la imagen clave de A1 o B1; mascota: la escena del gancho). `scriptProblems(…, opening)` revisa al generar que `hook_source` sea de la lista, que la primera frase de A1 tenga como mucho 9 palabras y sea la primera frase del gancho (`opensWithHook`: el 60 % de sus palabras de 4 letras o más, sin cifras; versión 8), que el primer texto se ancle en las 5 primeras palabras (≈ 2 s) con 6 palabras como mucho y que el gancho no hable del pago contra entrega. Al editar un guion de antes no se piden. La mascota ya no recibe `handoff_to_ugc` (el vocero humano).
- **Estáticos**: el texto en pantalla y el visual son el punto de partida del headline y la escena.
- **Chat de WhatsApp**: la primera burbuja puede partir de un gancho del ángulo.
- **Texto principal del anuncio** (`adHookText`): el hablado del mejor gancho usable y su segunda frase, más la oferta y «Paga al recibir».

## Qué se adaptó del agente original

- **Sin voseo ni «usted»**: toda la app escribe en español neutro con tuteo (`marketBlock`). De la tabla por país (§7) se toman solo el formato del precio y cómo se nombran el pago y el envío (`LOCAL_NOTES`).
- **Montos**: solo los de PRECIO Y OFERTA, como en el resto de los pasos.
- **Ganchos por ángulo**: los 10 son del ángulo de testeo (dolor, segmento y promesa); la variedad está en el patrón. Las plantillas de la forma del ángulo (`frameHookTemplates`) entran como un patrón más.
- **Material real**: en vez de `[REQUIERE MATERIAL REAL]` en el texto, el campo `needs_real_material`. La UI lo muestra («Falta material real: …. Los anuncios con IA no lo usan.»).
- **Salida**: el formato §8 (diagnóstico, tabla y notas) es el esquema `hooksOutputSchema`. El top 3 con variantes A/B se cambió por `rank` (versión 4).
- **Modismos**: solo dentro de una cita textual de MATERIA PRIMA (decisión del comerciante, 2026-10-03): son palabras del comprador. El trato sigue en tuteo neutro.

## Detener el scroll (versión 4, 2026-10-03)

**Por qué.** En el amplificador de sonido (producto `fd3c463e…`, ángulos 1 y 3), los 20 ganchos salieron planos: ninguno nombraba el problema en pantalla, 5 abrían con una característica («Se engancha, giras la perilla y listo»), 19 de 20 tenían 4 en saliencia y el recomendado de los dos ángulos era el titular del orquestador («Es la idea con la que el comerciante eligió el ángulo»). El video abrió con «Todos se rieron.», tres palabras de contexto, dicho sonriendo. El mejor material («¿ah? como diez veces», «se fue a lavar la loza») estaba en el cliente ideal y el AIDA y no llegó a los primeros 3 s.

**Qué cambió.**

1. **Prompt** (`lib/hooks/prompts.ts`): un bloque LO QUE DETIENE EL SCROLL (la primera frase lleva la tensión; el problema se nombra; una característica nunca abre, salvo en Oferta; el texto en pantalla no es una etiqueta; pares ✗/✓ de otras categorías). La regla de atributos personales aclara que protege a quien mira, no al ser querido: en tercera persona el problema se nombra. La idea del ángulo es material, no molde (antes: «al menos 3 de 10 son esa idea y el top incluye una»), y su tono no manda en el gancho. MATERIA PRIMA (`rawMaterial`): cómo lo dice el comprador, sus momentos, la apertura del ángulo (orquestador y desarrollo) y las reseñas reales.
2. **Puntajes**: verificabilidad sale de los puntajes (empujaba a las características) y pasa a un sí/no (`promises_only_what_arrives`); entra `tension`. El orden es forzado (`rank`): ordenar obliga a comparar.
3. **Crítico** (`lib/hooks/critic.ts`, paso `hook_critic`, effort low): alguien del cliente ideal recorriendo Reels ve cada gancho como se ve (en pantalla, primera imagen, lo que se dice), sin mecanismo, puntajes ni orden del autor. Dice qué entendió sin sonido, si se detiene y por qué, y ordena los 10. Su orden manda. Si detiene a menos de `CRITIC_MIN_STOPS` (4), se reescriben una vez los que no, conservando los que sí (`critiqueFor` → `hooksTail`); si la reescritura detiene a menos, queda la anterior. Todo dentro de la función de 300 s (`HOOKS_FUNCTION_BUDGET_MS`): sin tiempo no se llama al crítico ni se reescribe. Después del desarrollo casi nunca alcanza la reescritura; con «Otros ganchos», sí. Si el crítico falla, los ganchos quedan en el orden del agente.
4. **Guion** (`lib/video`, versión 8): A1 abre con la primera frase del gancho (`opensWithHook`) y la dice con su `delivery`.
5. **Orquestador** (`lib/angles`, versión 8): el gancho del ángulo tiene hasta 14 palabras (antes 24), dicho y con tensión; la escena va en `aida.attention`. El título tiene hasta 6 palabras y se corta por palabra.
6. **Pantalla**: el recomendado muestra «Sin sonido se entiende: …»; un gancho con el que el crítico no se detuvo dice «No detiene el scroll: …». «Otros ganchos» cuesta el agente más el crítico.

Lo generado antes no cambia solo: se rehace con «Otros ganchos» y después «Otro guion».

## Pantalla

Cada gancho muestra el hablado (y la segunda frase), el patrón y el texto en pantalla; el recomendado, también la primera toma y lo que se entiende sin sonido. Desde la versión 4 van en su orden (el primero detiene más) y los que el crítico pasó de largo lo dicen. Los que piden material real o tienen riesgo alto lo dicen en color de advertencia (`text-warning`), con el ícono de alerta. Bajo el título van el arquetipo y la objeción principal. «Otros ganchos» va al pie de la lista, con su costo. Editar sigue siendo una línea por gancho: un gancho cambiado conserva el patrón, el texto en pantalla y el visual de su posición, queda «Editado» y su `policy_ok` sale de las reglas de código.

## Versiones

`HOOKS_PROMPT_VERSION` (2: la primera toma y la versión de mascota; 4: detener el scroll), `HOOK_CRITIC_PROMPT_VERSION` (1), `ANGLE_ROUTER_PROMPT_VERSION` (8: el gancho de 14 palabras), `ANGLE_BRIEF_PROMPT_VERSION` (5: sin ganchos), `UGC_PROMPT_VERSION` y `MASCOT_PROMPT_VERSION` (8: A1 abre con la frase del gancho), `CREATIVES_PROMPT_VERSION` (6) y `CHAT_PROMPT_VERSION` (3).
