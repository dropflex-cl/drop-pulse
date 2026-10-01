# Ganchos COD LatAm

Fuente: `agentes-creativos/hook-cod-latam.md`, el agente que escribe los ganchos (0–3 s) a partir de 85 anuncios COD activos y longevos (≥ 21 días, mediana 136) en 9 países, transcritos y codificados. Esta spec dice cómo entra a DropFlex y qué se cambió del original.

## Dónde vive

Es un paso propio (`angle_hooks`), no una sección del agente de ángulo:

```
angulo-<forma> (effort high) → el desarrollo, SIN ganchos
        ▼
agente de ganchos (effort medium, foto base + desarrollo) → 10 tríadas, diagnóstico, top 3 → angle_briefs.payload.hooks
        ▼
video (UGC y mascota) · estáticos · chat · texto del anuncio
```

- Corre dentro de `runBrief` (`lib/pipeline/angles.ts`), justo después del desarrollo, con hasta 2 intentos (los dos van en la misma función de 300 s). Si no salen, el desarrollo se guarda igual con `hooks: []` y `hooks_error`, y se piden con «Otros ganchos». Nunca se vuelve a pagar el desarrollo por los ganchos.
- «Otros ganchos» (`POST /api/products/[id]/angles/briefs/[briefId]?part=hooks`, `regenerateHooks` en `lib/pipeline/hooks.ts`) reescribe solo los ganchos, en la misma solicitud, con hasta 3 intentos y los ganchos anteriores como «no repetir». No cambia la aprobación ni `edited_at`: los ganchos no los leen la Página ni las Imágenes, así que no las deja desactualizadas. Con el desarrollo aprobado no se ofrece: primero «Volver a revisar». Tope: 30 por comerciante en 24 h.
- Sin migración: todo va en `angle_briefs.payload` (`hooks`, `recommended_hook`, `hook_diagnosis`, `hook_top`, `hook_notes`, `hooks_version`, `hooks_error`). Los desarrollos de antes (`text`, `visual_first_3s`, `policy_ok`) se siguen leyendo.

## Qué se guarda por gancho

| Campo | Qué es |
|---|---|
| `pattern` | Uno de los 13 patrones (`HOOK_PATTERNS` en `lib/hooks/catalog.ts`) |
| `mechanism` | El mecanismo psicológico, en pocas palabras |
| `text` / `follow_up` | Hablado de 0 a 3 s (≤ 9 palabras) y segunda frase hasta los 6 s |
| `on_screen` | Texto en pantalla (≤ 6 palabras), legible sin sonido |
| `visual_first_3s` | La primera toma concreta |
| `scores` | Saliencia, relevancia, credibilidad y verificabilidad, de 1 a 5 |
| `risk`, `risk_reason` | Riesgo de Meta o de rechazo en la entrega |
| `needs_real_material` | Qué material real falta (testimonio, bodega, experto), o null |
| `opening_shot`, `first_motion` | La primera toma de un video con IA y qué se mueve en el cuadro 0 (`docs/spec-video-detener-scroll.md` §3). `real_footage` si muestra el efecto o pide material real: el video con IA no la usa |
| `mascot` | La versión del gancho para el video de mascota (lo que dice el personaje, su texto en pantalla y su escena), o null si el patrón no encaja (§3.7 del mismo spec) |
| `policy_ok` | Del modelo; en un gancho editado, de las reglas de código |
| `edited` | El comerciante cambió el hablado |

El recomendado (`recommended_hook`) es el primero del top 3.

## Reglas en código (`hookProblems`, `lib/hooks/schemas.ts`)

- 10 ganchos, al menos 5 patrones y como mucho 3 por patrón.
- Largos: hablado ≤ 9 palabras, segunda frase ≤ 9 y pantalla ≤ 6. El prompt pide 8 y 5 (`promptLimit`).
- Un puntaje de 2 o menos descarta el gancho: se pide otro.
- Política: segunda persona sobre el cuerpo, la edad o la salud (`SECOND_PERSON_BODY`, `lib/hooks/policy.ts`, la misma regla del guion), promesas de salud, plazos de resultado y montos fuera de PRECIO Y OFERTA. Los montos se revisan con símbolo («$24.990») y hablados («24 mil 990 pesos»).
- El pago contra entrega y el envío gratis no van en el gancho (`COD_IN_HOOK`): en el corpus, solo 5 de 85 lo decían ahí.
- Confesión y respuesta a comentario sin reseñas reales, Autoridad sin experto real y Bastidores siempre tienen que decir en `needs_real_material` qué falta.
- Top 3: tres ganchos distintos, ninguno con riesgo alto ni `policy_ok` false, cada uno con su variante A/B de una sola variable.

## Quién usa qué (`lib/hooks/select.ts`)

`usableHooks` deja fuera los que rozan la política, los de riesgo alto y los que piden material real: los pasos con IA no tienen ese material. Ordena así: el recomendado, después el resto del top y después los demás por puntaje.

- **Video UGC y mascota** (`lib/video/prompts.ts`): reciben los usables con su tríada y eligen uno (`hook_source`). A1 abre con el hablado; el primer texto en pantalla es el del gancho y se ancla en las primeras palabras de A1; la primera imagen es su visual (UGC: la imagen clave de A1 o B1; mascota: la escena del gancho). `scriptProblems(…, opening)` revisa al generar que `hook_source` sea de la lista, que la primera frase de A1 tenga como mucho 9 palabras, que el primer texto se ancle en las 5 primeras palabras (≈ 2 s) con 6 palabras como mucho y que el gancho no hable del pago contra entrega. Al editar un guion de antes no se piden. La mascota ya no recibe `handoff_to_ugc` (el vocero humano).
- **Estáticos**: el texto en pantalla y el visual son el punto de partida del headline y la escena.
- **Chat de WhatsApp**: la primera burbuja puede partir de un gancho del ángulo.
- **Texto principal del anuncio** (`adHookText`): el hablado del mejor gancho usable y su segunda frase, más la oferta y «Paga al recibir».

## Qué se adaptó del agente original

- **Sin voseo ni «usted»**: toda la app escribe en español neutro con tuteo (`marketBlock`). De la tabla por país (§7) se toman solo el formato del precio y cómo se nombran el pago y el envío (`LOCAL_NOTES`).
- **Montos**: solo los de PRECIO Y OFERTA, como en el resto de los pasos.
- **Ganchos por ángulo**: los 10 son del ángulo de testeo (dolor, segmento y promesa); la variedad está en el patrón. Las plantillas de la forma del ángulo (`frameHookTemplates`) entran como un patrón más.
- **Material real**: en vez de `[REQUIERE MATERIAL REAL]` en el texto, el campo `needs_real_material`. La UI lo muestra («Falta material real: …. Los anuncios con IA no lo usan.»).
- **Salida**: el formato §8 (diagnóstico, tabla, top 3 y notas) es el esquema `hooksOutputSchema`.

## Pantalla

Cada gancho muestra el hablado (y la segunda frase), el patrón y el texto en pantalla; el recomendado, también la primera toma. Los que piden material real o tienen riesgo alto lo dicen en color de advertencia (`text-warning`), con el ícono de alerta. Bajo el título van el arquetipo y la objeción principal. «Otros ganchos» va al pie de la lista, con su costo. Editar sigue siendo una línea por gancho: un gancho cambiado conserva el patrón, el texto en pantalla y el visual de su posición, queda «Editado» y su `policy_ok` sale de las reglas de código.

## Versiones

`HOOKS_PROMPT_VERSION` (2: la primera toma y la versión de mascota), `ANGLE_BRIEF_PROMPT_VERSION` (5: sin ganchos), `UGC_PROMPT_VERSION` y `MASCOT_PROMPT_VERSION` (7), `CREATIVES_PROMPT_VERSION` (6) y `CHAT_PROMPT_VERSION` (3).
