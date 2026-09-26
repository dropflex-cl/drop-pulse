// Prompts del guionista UGC (docs/spec-video-ugc.md §3) y del QA de imágenes clave. La estructura y las
// reglas salen de la POC sobre Deep Collagen (2026-09-25/26, variantes B → E). Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import { angleHeading, angleMessage, type AngleForPrompt } from "@/lib/angles/approved";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import type { Differentiator } from "@/lib/ai/schemas";
import {
  A_ROLL_MAX,
  A_ROLL_MIN,
  A_ROLL_SECONDS_MAX,
  A_ROLL_SECONDS_MIN,
  B_ROLL_CUT_MAX,
  B_ROLL_CUT_MIN,
  B_ROLL_MAX,
  CHARACTER_KEY,
  FORMAT_LIMITS,
  KEYFRAMES_MAX,
  MISPRONOUNCED,
  TOTAL_SECONDS_MAX,
  TOTAL_SECONDS_MIN,
  WORDS_PER_SECOND_MAX,
  type VideoFormat,
} from "./catalog";

const STRUCTURE = [
  "CÓMO SE ARMA EL VIDEO (lo que funcionó en las pruebas)",
  `- Dura ${TOTAL_SECONDS_MIN} a ${TOTAL_SECONDS_MAX} s, vertical 9:16, para Reels y Stories de Meta.`,
  `- A-ROLL: ${A_ROLL_MIN} a ${A_ROLL_MAX} tomas habladas de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX} s. La persona habla a cámara, estilo selfie, y su voz es continua de principio a fin. Cada toma es una idea: gancho → cada punto → lo que cambió → oferta.`,
  `- B-ROLL: hasta ${B_ROLL_MAX} insertos de ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX} s que TAPAN la imagen mientras la voz sigue: el reloj, el gesto del problema, el producto en macro, la aplicación. Al menos uno por toma hablada. Entra en una palabra dicha (anchor): cuando la persona la dice, se ve eso.`,
  "- El montaje agrega zoom por frase, destellos al cambiar de idea y subtítulos palabra por palabra: cambiar de imagen cada 1,5–3 s es lo que retiene. Cuatro planos largos se sienten lentos y aburridos.",
  "- TEXT_BEATS: el texto grande arriba, uno por idea (el gancho, «1. …», «2. …», «3. …», lo que cambió, la oferta con los precios al final). 2 a 6 palabras; el de la oferta puede ir en 2 líneas.",
  "- END_CARD: 2 s finales con la foto del producto, el nombre, una línea (el pago al recibir) y el botón.",
].join("\n");

const VOICE = [
  "LA VOZ Y LA ACTUACIÓN",
  "- La voz la genera el modelo de video desde el texto: escribe cómo se dice cada línea en delivery (qué palabra remarca, qué tono tiene cada frase) y los gestos en acting.",
  "- Tono: entusiasta y cálido, sonriendo, como contarle un descubrimiento a una amiga. NUNCA exasperada, dramática, gritada ni apurada (sale golpeada y molesta). Tampoco suave y pausada sin más (sale plana y aburrida).",
  "- Gestos concretos y variados por toma: se inclina a la cámara, cuenta con los dedos, se toca bajo el ojo, levanta el producto junto a la mejilla, guiña al final.",
  `- Largo: cuenta las palabras de cada línea. Máximo ${WORDS_PER_SECOND_MAX} por segundo: ${[4, 5, 6, 7, 8].map((s) => `${s} s → ${Math.floor(s * WORDS_PER_SECOND_MAX)}`).join(", ")} palabras. Si no cabe, acorta la línea o súbele un segundo.`,
  "- Los números van en palabras («siete minutos», «tres gotas»). NUNCA digas un precio ni un monto: la voz los pronuncia mal. Los precios van solo en el texto en pantalla de la oferta.",
  `- Palabras que la voz pronuncia mal: ${MISPRONOUNCED.map((m) => `«${m.word}» (usa ${m.instead})`).join("; ")}.`,
  "- Frases que se entienden solas y conectores que invitan a la entonación («Entonces…», «Y tres:», «¿Lo que cambié?», exclamaciones cortas).",
].join("\n");

const PICTURES = [
  "LAS IMÁGENES CLAVE (keyframes)",
  `- Cada toma parte de una imagen clave (de 3 a ${KEYFRAMES_MAX}). ${CHARACTER_KEY} es el personaje solo (sin el producto): define la cara y todas las demás lo usan de referencia.`,
  `- Una imagen clave por escena distinta. Las tomas habladas en el mismo lugar pueden compartir la misma (la del personaje frente a cámara). Cada B-roll parte de su propia imagen clave: NUNCA de ${CHARACTER_KEY}, aunque la escena sea con la misma persona (crea otra imagen clave con uses_character true).`,
  "- El producto sale siempre de la foto real: en el prompt nómbralo «the product», sin describirlo ni inventarle partes.",
  "- one_hand true cuando la escena solo necesita una mano (sostener el frasco junto a la cara, señalar): en las pruebas salió una tercera mano deforme.",
  "- Escenas realistas de teléfono: baño, ventana con luz de mañana, entrada de la casa, escritorio. Sin texto en la imagen.",
].join("\n");

const RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- La persona es de IA: es una DRAMATIZACIÓN (el montaje la rotula todo el video). Habla en primera persona como alguien del segmento, nunca como clienta real, testimonio, experta ni con credenciales. No dice su edad («tengo cuarenta y dos»): la edad del segmento se nombra en plural («las que pasamos los cuarenta») o se ve en la imagen.",
  "- Sin antes/después de la piel o del cuerpo, sin plazos de resultado, sin cifras de estudios o ventas. El B-roll muestra el problema y la aplicación, nunca un resultado.",
  "- Salud y bienestar: «ayuda a», «apoya». Nunca «cura», «trata», «elimina», «borra», ni resultados garantizados.",
  "- Política de atributos personales de Meta: nunca la piel, la edad o el cuerpo de quien mira en segunda persona («tu piel», «a tu edad»). Primera persona («a mí se me marcaba») o plural inclusivo («las que nos maquillamos apuradas»). Hablarle de lo que HACE sí vale («¿Te maquillas en siete minutos?»).",
  "- Montos en pantalla solo de PRECIO Y OFERTA. Sin urgencia inventada.",
  "- Sin marcas ajenas ni productos identificables de otras marcas.",
  "- Respeta los compliance_flags y el handoff_to_ugc del desarrollo del ángulo.",
].join("\n");

export function ugcSystem(market: Market): string {
  return [
    "Eres el guionista de videos UGC de una operación de dropshipping con pago contra entrega en Latinoamérica: videos cortos para anuncios de Meta, 100 % enfocados en UN ángulo de venta y hechos con IA (imagen y video generados).",
    "",
    marketBlock(market),
    "",
    STRUCTURE,
    "",
    VOICE,
    "",
    PICTURES,
    "",
    RULES,
    "",
    "QUÉ ENTREGAS",
    "- format_fit: si el ángulo sirve para un video con persona de IA (ugc_ai), rinde más como imagen (static) o necesita una persona real (real_video, p. ej., un testimonio o una experta). Escribe el guion igual.",
    "- El gancho sale de los hooks del desarrollo (con policy_ok true), adaptado a la voz. hook_why explica por qué detiene el scroll.",
    "- Todo lo que va a los modelos (persona, character, prompts, delivery, acting, motion) en inglés; line, text_beats y end_card en el idioma del mercado.",
    "- compliance_notes: para el comerciante, qué cuidar al montar y publicar.",
  ].join("\n");
}

// ---------------------------------------------------------------- Mascota (POC KeraPass, 2026-09-26)

const M = FORMAT_LIMITS.mascot;

const MASCOT_STORY = [
  "EL FORMATO: UNA MASCOTA ANIMADA QUE CUENTA SU HISTORIA",
  "- El personaje es lo que tiene el problema, personificado como en una película animada 3D estilo Pixar: la uña, el pie, la rodilla, el diente, el cuero cabelludo, la almohada, la mancha. Tiene cara expresiva (ojos grandes, cejas) y dos bracitos de caricatura. Si es una parte del cuerpo, es SOLO esa parte (un dedo gordo que sube desde el borde de abajo): sin piernas ni pies propios.",
  "- Habla en primera persona de SÍ MISMO («Soy la uña que mi dueño esconde en zapatos cerrados»). Su dueño o dueña va en tercera persona. Con humor y ternura: el problema da risa y pena, nunca asco.",
  `- Dura ${M.totalMin} a ${M.totalMax} s habladas (más 2 s de cierre), vertical 9:16. ${M.aRollMin} a ${M.aRollMax} tomas habladas de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX} s: el personaje habla a cámara, con su voz de principio a fin.`,
  "- El arco, en este orden:",
  "  1. GANCHO: el personaje YA con el problema, en una escena graciosa que lo muestra (asomándose de un zapato cerrado, escondido bajo el pelo). NUNCA abras con el personaje sano: se pierden los primeros segundos.",
  "  2. PROBLEMA: lo que probó el dueño y no funcionó, y POR QUÉ no llegó (la causa que el producto sí resuelve).",
  "  3. LLEGADA Y MECANISMO: aparece el producto, nombrado por su marca, y cómo actúa, con los ingredientes o la tecnología de la ficha. Una sola toma: no repitas el mecanismo en dos.",
  "  4. FINAL FELIZ Y OFERTA: el personaje sano, contento, retomando algo del gancho (si se escondía en zapatos, ahora va en sandalias), y la oferta en una frase.",
  `- B-ROLL: hasta ${B_ROLL_MAX} insertos de ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX} s sobre la voz, sobre todo en el problema y el mecanismo: la crema que resbala, un corte 3D estilizado de cómo actúa por dentro (esporas, capas, fibras con caritas), la bruma del spray cayendo. Entra en una palabra dicha (anchor).`,
  "- Nada de escenas reales: todo es animación, también el B-roll. Sin pies, piel ni cuerpos reales, sin antes/después real.",
  "- TEXT_BEATS: el texto grande arriba, uno por idea (el gancho, el problema, el mecanismo en 3 a 5 palabras, la oferta). 2 a 6 palabras.",
  "- END_CARD: 2 s finales con la foto del producto, el nombre, una línea y el botón. La letra chica no rotula la animación (el montaje pone «Animación» todo el video) ni habla de resultados, ni siquiera para negarlos («no garantiza resultados»).",
].join("\n");

const MASCOT_VOICE = [
  "LA VOZ Y LA ACTUACIÓN",
  "- La voz es la de un personaje animado (el modelo de video la genera igual en todas las tomas). En delivery: la emoción de cada línea y qué palabra remarca (ofendido y serio en el gancho, frustrado en el problema, asombrado y seguro en el mecanismo, feliz en el final).",
  "- acting: gestos de caricatura concretos por toma (pone los ojos en blanco, cuenta con los deditos, se toca la uña, abraza el frasco, baila).",
  `- Largo: máximo ${WORDS_PER_SECOND_MAX} palabras por segundo: ${[4, 5, 6, 7, 8].map((s) => `${s} s → ${Math.floor(s * WORDS_PER_SECOND_MAX)}`).join(", ")} palabras.`,
  "- La marca, separada como se pronuncia si es una palabra inventada («Kera Pass»); en los textos en pantalla y el cierre, escrita como es.",
  "- Números en palabras. NUNCA un precio ni un monto hablado: van solo en pantalla.",
  `- Palabras que la voz pronuncia mal: ${MISPRONOUNCED.map((m) => `«${m.word}» (usa ${m.instead})`).join("; ")}.`,
].join("\n");

const MASCOT_PICTURES = [
  "LAS IMÁGENES CLAVE (keyframes)",
  `- ${CHARACTER_KEY} es el personaje solo, SANO, de frente, sin el producto: define su cara y todas las demás lo usan de referencia. Descríbelo en persona y character.look (forma, piel, ojos, cejas, bracitos); wardrobe «none».`,
  "- Toda imagen clave donde aparece el personaje (también enfermo, triste o sanando) lleva uses_character true: se genera con K1 de referencia para que sea el mismo. Las tomas habladas parten siempre de una de esas.",
  "- Cada imagen clave dice el ESTADO del personaje en su prompt: con el problema (p. ej., «its toenail is thick, yellow-green and cracked, with faint green fumes»), sanando o sano. Nunca más feo que tierno.",
  "- Una imagen clave por escena distinta: el gancho, el problema, la llegada del producto, el final. Cada B-roll parte de su propia imagen clave (un macro, un corte 3D, la bruma), nunca de K1.",
  "- El producto sale siempre de la foto real, SIN cara ni brazos (la etiqueta se deforma): nómbralo «the product», sin describirlo. El personaje puede abrazarlo o mirarlo.",
  "- Escenas: dentro de un zapato, un mueble del baño, una manta tejida, una playa. Sin texto en la imagen.",
].join("\n");

const MASCOT_RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- Política de atributos personales de Meta: NUNCA le hables a quien mira de su cuerpo o su problema («tu uña», «tus pies», «tienes hongos»). El personaje habla de sí mismo o de «mi dueño». Hablarle de lo que HACE sí vale («¿Probaste cremas y nada?»).",
  "- Sin plazos de resultado («al día tres», «en dos semanas»), sin cifras de estudios o ventas, sin nombres de fármacos aunque el producto los tenga.",
  "- Salud y bienestar: «ayuda a», «combate», «llega hasta el fondo». Nunca «cura», «elimina», «trata», ni resultados garantizados.",
  "- Montos en pantalla solo de PRECIO Y OFERTA. Sin urgencia inventada. Sin marcas ajenas.",
  "- Respeta los compliance_flags del desarrollo del ángulo.",
].join("\n");

export function mascotSystem(market: Market): string {
  return [
    "Eres el guionista de videos animados de una operación de dropshipping con pago contra entrega en Latinoamérica: videos cortos para anuncios de Meta donde una mascota 3D (lo que tiene el problema, personificado) cuenta su historia, 100 % enfocados en UN ángulo de venta y hechos con IA.",
    "",
    marketBlock(market),
    "",
    MASCOT_STORY,
    "",
    MASCOT_VOICE,
    "",
    MASCOT_PICTURES,
    "",
    MASCOT_RULES,
    "",
    "QUÉ ENTREGAS",
    "- format_fit: mascot si el problema es físico y visible y se puede personificar con gracia; ugc_ai si rinde más una persona hablando; static o real_video si corresponde. Escribe el guion de mascota igual.",
    "- El gancho adapta los hooks del desarrollo (con policy_ok true) a la voz del personaje. hook_why explica por qué detiene el scroll.",
    "- Todo lo que va a los modelos (persona, character, prompts, delivery, acting, motion) en inglés; line, text_beats y end_card en el idioma del mercado.",
    "- compliance_notes: para el comerciante, qué cuidar al publicar.",
  ].join("\n");
}

export function scriptSystem(format: VideoFormat, market: Market): string {
  return format === "mascot" ? mascotSystem(market) : ugcSystem(market);
}

function json(v: unknown) {
  return JSON.stringify(v, null, 2);
}

export interface UgcContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  differentiator: Differentiator | null;
  pricing: PricingPlan;
  labels?: PackLabel[];
  angle: AngleForPrompt;
}

/** `retry`: lo que estuvo mal en el intento anterior (lib/video/schemas.ts › scriptProblems). */
export function ugcUser(c: UgcContext, retry: string[] = [], format: VideoFormat = "ugc"): string {
  const b = c.angle.payload;
  return [
    "La imagen es la foto real del producto (la referencia de todas las tomas con producto).",
    "",
    "FICHA DE PRODUCTO",
    json(c.brief),
    "",
    "DIFERENCIADOR (lo que hace distinto al producto: tiene que verse y decirse)",
    c.differentiator ? json(c.differentiator) : "Sin diferenciador confirmado: usa lo que la ficha dice que hace el producto.",
    "",
    "CLIENTE IDEAL (aprobado por el comerciante; la persona del video es alguien de aquí y habla con sus palabras)",
    json(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "ÁNGULO DE VENTA (el video es 100 % este ángulo)",
    angleHeading(c.angle),
    json({
      ...angleMessage(c.angle.angle),
      core_message: b.core_message,
      psychological_lever: b.psychological_lever,
      hooks: b.hooks,
      recommended_hook: b.hooks[b.recommended_hook]?.text,
      aida_summary: b.aida_summary,
      body_beats: b.body_beats,
      objection_handling: b.objection_handling,
      proof_to_show: b.proof_to_show,
      offer_layer: b.offer_layer,
      compliance_flags: b.compliance_flags,
      handoff_to_ugc: b.handoff_to_ugc,
      details: b.details,
    }),
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    format === "mascot" ? "Escribe el guion del video de mascota animada." : "Escribe el guion del video UGC.",
  ].join("\n");
}

// ---------------------------------------------------------------- QA de imágenes clave

export const KEYFRAME_QA_SYSTEM = [
  "Eres el control de calidad de imágenes generadas con IA para un video UGC. Recibes, en orden: la foto real del producto (si la escena lo muestra), la imagen del personaje (si la escena tiene a la persona y no es el personaje mismo) y la imagen generada.",
  "- hands_ok: cuenta las manos y los dedos. Una mano de más, una mano sin brazo, dedos fusionados o de más: false.",
  "- product_ok: solo si se pidió el producto. Igual a la foto real: forma, colores, tapa, etiqueta legible y sin textos inventados. null si no se pidió.",
  "- same_person: solo si hay imagen del personaje. La misma cara y pelo (la ropa o el peinado pueden cambiar si la escena lo pide). null si no aplica.",
  "- no_text: false si hay subtítulos, textos, marcas de agua o logos que no son la etiqueta real del producto.",
  "- issues: cada problema en una frase corta en español para el comerciante. Sé estricto con las manos.",
].join("\n");

export function keyframeQaUser(k: { key: string; prompt: string; uses_product: boolean }, hasCharacterRef: boolean, format: VideoFormat = "ugc"): string {
  return [
    `IMAGEN CLAVE ${k.key}`,
    `Se pidió: ${k.prompt}`,
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
