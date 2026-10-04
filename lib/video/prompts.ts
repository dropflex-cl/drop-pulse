// Prompts del video (docs/spec-video-ugc.md §3) en dos pasos (docs/spec-prompts-simples.md §6): el GUION
// (paso ugc_script, effort high: lo que dice la persona o el personaje, toma por toma, desde el gancho
// del ángulo) y el PLAN DE TOMAS (paso video_plan, effort low: imágenes clave, cámaras, B-roll y textos
// en pantalla para el guion ya validado). Antes una llamada hacía las dos cosas y, en la mascota, también
// inventaba el personaje: la silueta, la imagen clave de cada toma y las duraciones eran lo que más
// fallaba. Lo que aprendió la POC (Deep Collagen y KeraPass, 2026-09-25/26) va como límites y como
// reglas en código (lib/video/schemas.ts). Puro.
// Regla de caché: los system dependen solo del mercado; el producto va en el usuario.

import { angleLine, buyerLine, buyerVoice, productFacts } from "@/lib/ai/context";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, Differentiator, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleForPrompt } from "@/lib/angles/approved";
import { OPENING_SHOT_DEFS, ON_SCREEN_PROMPT_WORDS, SPOKEN_PROMPT_WORDS } from "@/lib/hooks/catalog";
import { hooksForPrompt, openingShotOf, usableHooks, type HookSource } from "@/lib/hooks/select";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import {
  A_ROLL_SECONDS_MAX,
  A_ROLL_SECONDS_MIN,
  B_ROLL_CUT_MAX,
  B_ROLL_CUT_MIN,
  B_ROLL_MAX,
  CHARACTER_KEY,
  FORMAT_LIMITS,
  HOOK_BEAT_PROMPT_WORDS,
  KEYFRAMES_MAX,
  MASCOT_BODIES,
  MASCOT_BODY_KEYS,
  MISPRONOUNCED,
  opensWithInsert,
  WORDS_PER_SECOND_PROMPT,
  type VideoFormat,
  type VideoOpeningShot,
} from "./catalog";
import type { OpeningInput, ScriptLines } from "./schemas";

/** Frases del cliente ideal que recibe el guionista (buyerVoice). */
export const SCRIPT_VOICE_LINES = 3;

/** Las palabras por segundo que pide el prompt, con coma decimal («2,7»). */
const WPS = String(WORDS_PER_SECOND_PROMPT).replace(".", ",");
/** «4 s → 10, 5 s → 13…»: el tope por toma que pide el prompt. */
const WORDS_BY_SECONDS = [4, 5, 6, 7, 8].map((s) => `${s} s → ${Math.floor(s * WORDS_PER_SECOND_PROMPT)}`).join(", ");

const list = (items: string[]) => items.map((i) => `- ${i}`);

// ---------------------------------------------------------------- 1. El guion

/** Lo que vale para la voz en los dos formatos: lo que aprendió la POC con Seedance. */
const SPOKEN = [
  `- Máximo ${WPS} palabras por segundo (${WORDS_BY_SECONDS}): cuéntalas; si no cabe, acorta o súbele un segundo a la toma.`,
  "- Los números en palabras. Nunca un precio ni un monto en la voz: la voz los pronuncia mal y van solo en pantalla.",
  `- Palabras que la voz pronuncia mal: ${MISPRONOUNCED.map((m) => `«${m.word}» (usa ${m.instead})`).join("; ")}.`,
  `- A1 abre con el gancho elegido, sin nada antes: su primera frase tiene como mucho ${SPOKEN_PROMPT_WORDS} palabras y se dice con el delivery del gancho. El pago contra entrega va en la oferta del final, nunca en el gancho.`,
  "- delivery y acting van en inglés (son para el modelo de video); line en el idioma del mercado.",
];

const LINES_LIMITS = [
  "LÍMITES",
  "- Meta no acepta que el anuncio le atribuya a quien mira su piel, su edad o su cuerpo («tu piel», «a tu edad»): primera persona o «las que…». Hablarle de lo que hace sí vale.",
  "- Nada de «cura», «trata», «elimina», plazos de resultado ni cifras de estudios o ventas. Los montos en pantalla, solo de PRECIO Y OFERTA.",
  "- Nunca un rótulo de IA, dramatización ni animación: el video no lo lleva (decisión del comerciante).",
];

export function linesSystem(format: VideoFormat, market: Market): string {
  const limits = FORMAT_LIMITS[format];
  if (format === "mascot") {
    return [
      "Eres guionista de videos animados para anuncios de Meta en Latinoamérica, donde se paga contra entrega: una mascota 3D (lo que tiene el problema, personificado: la uña, el diente, la rodilla, la almohada) cuenta su historia, con humor y ternura, nunca asco. El video es 100 % de UN ángulo de venta.",
      "",
      `- ${limits.aRollMin} a ${limits.aRollMax} tomas habladas de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX} s, en total ${limits.totalMin} a ${limits.totalMax} s, en este orden: el gancho (el personaje YA con el problema), lo que probó su dueño y por qué no funcionó, la llegada del producto por su nombre y cómo actúa (una sola toma), y el final feliz que retoma el gancho, con la oferta en una frase.`,
      "- Habla en primera persona de sí mismo («Soy la uña que mi dueño esconde en zapatos cerrados»); su dueño o dueña, en tercera. Nunca le habla a quien mira de su cuerpo («tu uña»).",
      "- Elige uno de los GANCHOS del ángulo y dilo como el personaje, a su manera, con la misma tensión.",
      "- delivery: la emoción de cada línea (en el gancho, la del gancho; frustrado en el problema, asombrado en el mecanismo, feliz al final). La marca, separada como se pronuncia si es inventada («Kera Pass»).",
      ...SPOKEN.filter((l) => !l.startsWith("- A1 abre")),
      `- A1 abre con el gancho dicho por el personaje, sin nada antes: su primera frase tiene como mucho ${SPOKEN_PROMPT_WORDS} palabras. El pago contra entrega va en la oferta del final.`,
      "",
      ...LINES_LIMITS,
      "",
      marketBlock(market),
    ].join("\n");
  }
  return [
    "Eres guionista de videos UGC para anuncios de Meta en Latinoamérica, donde se paga contra entrega: una persona de IA habla a cámara, como alguien de quien compra que le cuenta un descubrimiento a una amiga. El video es 100 % de UN ángulo de venta.",
    "",
    `- ${limits.aRollMin} a ${limits.aRollMax} tomas habladas de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX} s, en total ${limits.totalMin} a ${limits.totalMax} s. Cada toma es una idea: el gancho, cada punto, lo que cambió y la oferta.`,
    "- Tono entusiasta y cálido, sonriendo; nunca exasperado, gritado ni apurado (sale golpeado), ni plano. La primera frase es la excepción: va con el delivery del gancho.",
    "- Desde la segunda frase valen muletillas naturales («mira», «o sea») y conectores que invitan a la entonación («Entonces…», «¿Lo que cambié?»).",
    ...SPOKEN,
    "",
    ...LINES_LIMITS,
    "- La persona es de IA: habla como alguien del segmento, nunca como clienta, testimonio ni experta, y no dice su edad («las que pasamos los cuarenta» sí).",
    "",
    marketBlock(market),
  ].join("\n");
}

export interface UgcContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  differentiator: Differentiator | null;
  pricing: PricingPlan;
  labels?: PackLabel[];
  angle: AngleForPrompt;
  format?: VideoFormat;
}

/** Un gancho como texto: lo que se dice, lo que se lee, su primera toma y cómo se dice. */
function hookLine(h: ReturnType<typeof hooksForPrompt>[number]): string {
  const x = h as Record<string, unknown>;
  const parts = [
    `${h.index}. «${[x.spoken, x.follow_up].filter(Boolean).join(" ")}»`,
    x.on_screen ? `en pantalla: «${x.on_screen}»` : null,
    x.opening_shot ? `abre con: ${OPENING_SHOT_DEFS[x.opening_shot as keyof typeof OPENING_SHOT_DEFS]?.name.toLowerCase() ?? x.opening_shot}` : null,
    x.scene ? `escena del personaje: ${x.scene}` : null,
    x.delivery ? `cómo se dice: ${x.delivery}` : null,
    x.edited_by_merchant ? "lo escribió el comerciante: respeta su hablado" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Lo fijo del guion: igual en cada intento, va con punto de caché. Sin la ficha ni el cliente ideal en JSON. */
export function linesContext(c: UgcContext): string {
  const p = c.angle.payload;
  const format = c.format ?? "ugc";
  const aida = c.angle.angle.aida ?? p.aida_summary;
  const hooks = hooksForPrompt(p, format === "mascot" ? "mascot" : "ai_video");
  return [
    productFacts(c.brief),
    ...(c.differentiator ? [`EN QUÉ SE DIFERENCIA (tiene que decirse): frente a ${c.differentiator.versus}, ${c.differentiator.claim}`] : []),
    "",
    buyerLine(c.avatar),
    ...list(buyerVoice(c.avatar, SCRIPT_VOICE_LINES).map((v) => `«${v}»`)),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "EL ÁNGULO (el video es 100 % este ángulo)",
    angleLine(c.angle.angle),
    ...(p.core_message?.trim() ? [`- Idea central: ${p.core_message.trim()}`] : []),
    ...(aida ? [`- AIDA: Atención: ${aida.attention} Interés: ${aida.interest} Deseo: ${aida.desire} Acción: ${aida.action}`] : []),
    ...(format === "ugc" && p.handoff_to_ugc?.trim() ? [`- Quién lo cuenta: ${p.handoff_to_ugc.trim()}`] : []),
    ...(p.compliance_flags?.length ? [`- Cuidados: ${p.compliance_flags.join("; ")}`] : []),
    "",
    "GANCHOS DEL ÁNGULO (del mejor al peor; el primero es el recomendado; pon el index del que uses en hook_source)",
    ...(hooks.length ? hooks.map(hookLine) : ["Ninguno usable: hook_source null y escribe uno que detenga el scroll."]),
    "",
  ].join("\n");
}

/** Lo que cambia en cada intento. `retry`: lo que estuvo mal en el anterior (lineProblems). */
export function linesTail(retry: string[] = [], format: VideoFormat = "ugc"): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    format === "mascot" ? "Escribe el guion del video de mascota animada." : "Escribe el guion del video UGC.",
  ].join("\n");
}

/** Los ganchos que recibe el guionista de este formato y la toma con que abre cada uno (lo que valida lineProblems). */
export function openingInput(src: HookSource, format: VideoFormat = "ugc"): OpeningInput {
  // La mascota dice el gancho a su manera: A1 abre con la frase del personaje, no con la del gancho (salvo los de hasta la versión 5, que traen su versión).
  if (format === "mascot") return { hooks: usableHooks(src, "mascot").map(({ index, hook }) => ({ index, shot: "mascot_scene", spoken: hook.mascot?.text })) };
  return { hooks: usableHooks(src, "ai_video").flatMap(({ index, hook }) => (openingShotOf(hook) ? [{ index, shot: openingShotOf(hook)!, spoken: hook.text }] : [])) };
}

// ---------------------------------------------------------------- 2. El plan de tomas

const PLAN_COMMON = [
  `- ${CHARACTER_KEY} (el personaje solo, la referencia de su cara) lo pone el sistema: tus imágenes clave van de K2 a K${KEYFRAMES_MAX}, una por escena distinta. Cada toma hablada parte de una con el personaje; varias en el mismo lugar pueden compartirla.`,
  `- B-roll: hasta ${B_ROLL_MAX} insertos de ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX} s que tapan la imagen mientras la voz sigue, al menos uno por toma hablada. Cada uno parte de su propia imagen clave (nunca ${CHARACTER_KEY}) y entra en una palabra dicha (anchor), escrita igual que en la línea. Cambiar de imagen cada 1,5 a 3 s es lo que retiene.`,
  `- Textos en pantalla: uno por idea, de 2 a 6 palabras, anclados a una palabra dicha. El primero es el texto en pantalla del gancho (hasta ${ON_SCREEN_PROMPT_WORDS} palabras), anclado a una de las primeras ${HOOK_BEAT_PROMPT_WORDS} palabras de A1. El último, la oferta con los montos exactos de PRECIO Y OFERTA.`,
  "- El producto sale de la foto real: nómbralo «the product», sin describirlo ni inventarle partes. one_hand true cuando la escena solo necesita una mano.",
  "- opening.first_motion: lo que ya se está moviendo en el cuadro 0 (los clips parten de una foto: si nada se mueve, se pierde el primer medio segundo).",
  "- Todo lo que va a los modelos (persona, prompts, motion) en inglés; los textos en pantalla en el idioma del mercado. Sin textos dentro de las imágenes.",
];

const OPENING_BY_SHOT: Record<Exclude<VideoOpeningShot, "mascot_scene">, string> = {
  selfie_talk: `A1 parte de opening.keyframe, una imagen clave nueva (camera selfie, nunca ${CHARACTER_KEY}) con la persona ya en el gesto del gancho.`,
  mirror: `A1 parte de opening.keyframe, una imagen clave nueva (camera mirror, nunca ${CHARACTER_KEY}) con la persona ya en el gesto del gancho.`,
  pov_hands: `B1 es la primera toma: parte de opening.keyframe (camera pov), se ancla a una de las primeras ${HOOK_BEAT_PROMPT_WORDS} palabras de A1 y después entra la cara.`,
  problem_scene: `B1 es la primera toma: parte de opening.keyframe (el problema en su lugar, sin ningún resultado), se ancla a una de las primeras ${HOOK_BEAT_PROMPT_WORDS} palabras de A1 y después entra la cara.`,
  product_in_place: `B1 es la primera toma: parte de opening.keyframe (uses_product true), se ancla a una de las primeras ${HOOK_BEAT_PROMPT_WORDS} palabras de A1 y después entra la cara.`,
};

export function planSystem(format: VideoFormat, market: Market): string {
  if (format === "mascot") {
    return [
      "Eres director de animación: encajas un guion ya escrito de una mascota 3D (estilo película animada) en imágenes clave, B-roll y textos en pantalla para un anuncio vertical 9:16. No cambias lo que se dice.",
      "",
      `- El personaje parte de un cuerpo seguro (character.body): ${MASCOT_BODY_KEYS.map((k) => `${k} (${MASCOT_BODIES[k].name.toLowerCase()})`).join(", ")}. Elige el que mejor represente lo que es; tú pones su color (pastel, nunca color piel), su cara (ojos grandes, cejas, expresión) y algún accesorio, sin cambiar la forma del cuerpo. Tiene dos bracitos de caricatura y, si es una parte del cuerpo, sin piernas ni pies.`,
      "- Cada imagen clave dice el estado del personaje (con el problema, sanando, sano), nunca más feo que tierno, con camera animated. Escenas: dentro de un zapato, un mueble del baño, una manta, una playa. El producto, sin cara ni brazos.",
      `- La apertura es la escena del gancho, con el personaje YA con el problema: A1 parte de opening.keyframe, una imagen clave nueva (nunca ${CHARACTER_KEY}, que es el personaje sano). El final feliz retoma esa escena.`,
      "- El B-roll también es animación: la crema que resbala, un corte 3D estilizado de cómo actúa por dentro, la bruma del spray. Sin pies, piel ni cuerpos reales.",
      ...PLAN_COMMON,
      "",
      marketBlock(market),
    ].join("\n");
  }
  return [
    "Eres director de videos UGC: encajas un guion ya escrito en imágenes clave, cámaras, B-roll y textos en pantalla para un anuncio vertical 9:16 hecho con IA que tiene que parecer grabado con un teléfono en una casa. No cambias lo que se dice.",
    "",
    "- persona y character: alguien común de quien compra, no una modelo (pelo como lo usa en la casa, ropa de casa). En productos de belleza no nombres el problema en su cara: sería mostrar el «antes».",
    "- Cada imagen clave dice su cámara: selfie (la cámara frontal a un brazo, la persona hablando), pov (la cámara trasera mirando hacia abajo, una mano en cuadro), propped (el teléfono apoyado) o mirror. El B-roll con la persona no es selfie. El sistema arma el aspecto de teléfono: tú describes la escena.",
    "- Lugares vividos y la luz de la casa (el baño con frascos, la cocina, el auto, la pieza). Nada de estudio, luz dorada, macro, cámara lenta, cinematográfico ni desenfoque de fondo: delatan a la IA.",
    "- El B-roll muestra el problema y el uso, nunca un resultado. Encuadre de selfie: la cara en el tercio del medio y aire sobre la cabeza (arriba van los textos).",
    "- La apertura sale de la primera toma del gancho (te la doy abajo).",
    ...PLAN_COMMON,
    "",
    marketBlock(market),
  ].join("\n");
}

/** Lo fijo del plan: el guion ya validado, la apertura, quién habla y el producto. Va con punto de caché. */
export function planContext(c: UgcContext, lines: ScriptLines, opening: { shot: VideoOpeningShot; hook?: { on_screen?: string; visual?: string; first_motion?: string } | null }): string {
  const format = c.format ?? "ugc";
  return [
    "La imagen es la foto real del producto (la referencia de todas las tomas con producto).",
    "",
    productFacts(c.brief),
    "",
    format === "mascot" ? `EL PERSONAJE: ${lines.speaker}` : `QUIÉN HABLA: ${lines.speaker}`,
    ...(format === "ugc" ? [buyerLine(c.avatar)] : []),
    "",
    "LA APERTURA",
    format === "mascot" ? "- La escena del gancho, con el personaje ya con el problema." : `- ${opensWithInsert(opening.shot) ? "Abre con un inserto" : "Abre con la cara"}: ${OPENING_BY_SHOT[opening.shot as Exclude<VideoOpeningShot, "mascot_scene">]}`,
    ...(opening.hook?.on_screen ? [`- Texto en pantalla del gancho: «${opening.hook.on_screen}»`] : []),
    ...(opening.hook?.visual ? [`- Primera imagen del gancho: ${opening.hook.visual}`] : []),
    ...(opening.hook?.first_motion ? [`- Lo que se mueve: ${opening.hook.first_motion}`] : []),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "EL GUION (no lo cambies; ancla el B-roll y los textos a sus palabras)",
    ...lines.a_roll.map((a, i) => `A${i + 1} (${a.seconds} s): «${a.line}» · ${a.acting}`),
    "",
  ].join("\n");
}

export function planTail(retry: string[] = []): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Arma las tomas de este guion.",
  ].join("\n");
}

// ---------------------------------------------------------------- QA de imágenes clave

export const KEYFRAME_QA_SYSTEM = [
  "Eres el control de calidad de imágenes generadas con IA para un video UGC. Recibes, en orden: la foto real del producto (si la escena lo muestra), la imagen del personaje (si la escena tiene a la persona y no es el personaje mismo) y la imagen generada.",
  "- hands_ok: cuenta las manos y los dedos. Una mano de más, una mano sin brazo, dedos fusionados o de más: false.",
  "- product_ok: solo si se pidió el producto. Igual a la foto real: forma, colores, tapa, etiqueta legible y sin textos inventados. null si no se pidió.",
  "- same_person: solo si hay imagen del personaje. La misma cara y pelo (la ropa o el peinado pueden cambiar si la escena lo pide). null si no aplica.",
  "- no_text: false si hay subtítulos, textos, marcas de agua o logos que no son la etiqueta real del producto.",
  "- brand_safe: false si el personaje, un objeto o una pose puede leerse como genitales o algo sexual o sugerente (por ejemplo, un cuerpo alargado o liso color piel con la punta redondeada, o un bulto sobre un cuello más angosto): Meta rechaza esos anuncios por contenido adulto. Míralo como un revisor de Meta que ve la imagen un segundo. Ante la duda, false.",
  "- matches_hook: solo si se indica que es la imagen de la apertura. true si muestra lo que pide la primera toma del gancho, con la acción ya en marcha; false si muestra otra cosa o está quieta y vacía. null si no es la apertura.",
  "- phone_look: solo en el video con una persona. true si parece una foto tomada con un teléfono en una casa (luz de la casa, todo en foco, fondo con cosas); false si parece de estudio, de campaña o de banco de imágenes (luz de estudio, fondo desenfocado, piel perfecta, todo ordenado). null en la animación.",
  "- issues: cada problema en una frase corta en español para el comerciante. Sé estricto con las manos.",
].join("\n");

export function keyframeQaUser(
  k: { key: string; prompt: string; uses_product: boolean },
  hasCharacterRef: boolean,
  format: VideoFormat = "ugc",
  opening?: { first_motion: string; hook?: string } | null,
): string {
  return [
    `IMAGEN CLAVE ${k.key}`,
    `Se pidió: ${k.prompt}`,
    ...(opening
      ? [`Es la imagen de la APERTURA (el cuadro 0 del video). La primera toma del gancho: ${opening.first_motion}${opening.hook ? ` Lo que se dice encima: «${opening.hook}».` : ""} Revisa matches_hook.`]
      : ["No es la apertura: matches_hook = null."]),
    format === "mascot" ? "Es una animación: phone_look = null." : "Es el video con persona: revisa phone_look.",
    ...(format === "mascot"
      ? [
          "Es una animación 3D con un personaje de caricatura: sus manos pueden tener cuatro o cinco dedos (hands_ok false solo si hay brazos o manos de más o deformes). same_person compara el MISMO personaje (cara, ojos, cejas, forma); su estado puede cambiar (enfermo, sano). El producto no lleva cara ni brazos.",
        ]
      : []),
    k.uses_product ? "La escena muestra el producto." : "La escena NO muestra el producto: product_ok = null.",
    hasCharacterRef ? "Hay imagen del personaje: compara la cara." : "No hay imagen del personaje: same_person = null.",
    "",
    "Revisa la imagen generada (la última).",
  ].join("\n");
}
