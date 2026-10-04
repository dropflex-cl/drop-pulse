// El agente de ganchos: escribe los 10 ganchos de UN ángulo de testeo después de su desarrollo. Desde la
// versión 6 (docs/spec-prompts-simples.md §4) es la pregunta de un experto con poco contexto, como el
// orquestador de ángulos v9: el ángulo con su gancho, los hechos, quién compra y el precio. Desde la 7,
// sin las frases del cliente ideal (§14): la mitad de los ganchos las copiaba («tele a todo chancho»).
// Sin la biblioteca de 14 patrones con plantillas, sin cuotas y sin la versión de mascota: con eso, el
// modelo llenaba un patrón de cada uno y 24 de los ~37 problemas registrados eran de la mascota.
// Lo comprobable lo revisa el código después (hookProblems) y lo que es regla lo arregla (normalizeHooks).
// Puro. Regla de caché: el system depende solo del mercado; el producto y el ángulo van en el usuario.

import { angleLine, buyerLine, productFacts, proofLine } from "@/lib/ai/context";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, Differentiator, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleForPrompt } from "@/lib/angles/approved";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { FOLLOW_UP_PROMPT_WORDS, HOOKS_PER_ANGLE, LOCAL_NOTES, ON_SCREEN_PROMPT_WORDS, SPOKEN_PROMPT_WORDS } from "./catalog";

const list = (items: string[]) => items.map((i) => `- ${i}`);

export function hooksSystem(market: Market): string {
  const local = LOCAL_NOTES[market.countryCode];
  return [
    "Eres un experto en ganchos para anuncios en video de Facebook, Instagram y TikTok en Latinoamérica, donde se vende con pago contra entrega. El gancho son los primeros 3 segundos: lo que se dice, el texto en pantalla y la primera imagen. Si no detiene el scroll, lo demás no importa.",
    "",
    "- Un gancho abre algo que hay que cerrar: algo que salió mal, un secreto, algo en juego para alguien que se quiere, una pregunta que necesita respuesta. Una característica del producto o una escena tranquila no detienen a nadie.",
    "- La primera frase lleva la tensión, sin una frase de contexto antes. Sin sonido, el texto en pantalla y la primera imagen dicen de qué se trata.",
    `- Hablado de máximo ${SPOKEN_PROMPT_WORDS} palabras y la segunda frase, si la hay, de máximo ${FOLLOW_UP_PROMPT_WORDS}; texto en pantalla de máximo ${ON_SCREEN_PROMPT_WORDS}.`,
    "- Los videos se hacen con IA (una persona que habla a cámara y clips generados desde una imagen) y se ven como grabados con un teléfono en una casa. Mostrar con IA el efecto o el resultado sería una prueba inventada: eso necesita grabación real.",
    "",
    "LÍMITES",
    "- Meta no acepta que el anuncio le atribuya a quien mira su edad, su salud o su cuerpo («¿Te estás quedando calvo?», «tu piel»). Hablarle de lo que hace o de un ser querido, o hablar en primera o tercera persona, sí se puede.",
    "- Nada de «cura» o «trata», ni plazos de resultado.",
    "- Nada inventado: testimonios, comentarios, expertos, cifras. Si un gancho los necesita, escríbelo igual y di qué material real falta.",
    "- Montos: solo los de PRECIO Y OFERTA y el ancla de mercado del ángulo, si trae una. El pago contra entrega y el envío gratis van después, nunca en los primeros 3 s.",
    "- La primera imagen sin lenguaje de estudio: nada de macro, cámara lenta, luz dorada ni cinematográfico.",
    "",
    marketBlock(market),
    ...(local ? [`- En este mercado: ${local}`] : []),
    "",
    "Lo que se dice y se lee va en el idioma del mercado; lo demás (la primera imagen, lo que se entiende sin sonido, el riesgo, el diagnóstico), en español para el comerciante.",
  ].join("\n");
}

export interface HooksContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  differentiator?: Differentiator | null;
  /** El ángulo con su desarrollo (sin ganchos todavía, o con los anteriores). */
  angle: AngleForPrompt;
  /** Los otros ángulos del testeo, por nombre: sus ganchos no se repiten aquí. */
  others: string[];
  /** Hay imagen base (va primero en el mensaje). */
  hasImage: boolean;
}

/** Lo fijo: igual en cada intento, va con punto de caché (lib/ai/content.ts). Sin la ficha ni el cliente ideal en JSON. */
export function hooksContextText(c: HooksContext): string {
  const core = c.angle.payload.core_message?.trim();
  return [
    ...(c.hasImage ? ["La imagen es la foto real del producto: lo que llega en el paquete.", ""] : []),
    productFacts(c.brief),
    proofLine(c.brief),
    "",
    buyerLine(c.avatar),
    ...(c.differentiator ? [`EN QUÉ SE DIFERENCIA: frente a ${c.differentiator.versus}, ${c.differentiator.claim}`] : []),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "EL ÁNGULO (los 10 ganchos son de este ángulo)",
    angleLine(c.angle.angle, c.pricing.currency),
    ...(core ? [`- Idea central: ${core}`] : []),
    ...(c.others.length ? ["", `LOS OTROS ÁNGULOS DEL TESTEO (van en otros anuncios: no uses su idea): ${c.others.join("; ")}.`] : []),
    "",
  ].join("\n");
}

/** Lo que dijo el crítico de la respuesta anterior (lib/hooks/critic.ts): qué reemplazar y qué conservar. */
export interface HooksCritique {
  /** «El gancho 3 («…») no detiene: sin sonido se entiende «…». …» */
  weak: string[];
  /** El hablado de los que sí detuvieron. */
  keep: string[];
}

/** La pregunta: al menos 3 son el gancho del ángulo dicho para video (o su idea, en los ángulos de antes). */
export function hooksAsk(hasAngleHook: boolean): string {
  return `Escribe ${HOOKS_PER_ANGLE} ganchos para video que detengan el scroll de quien compra: al menos 3 son ${hasAngleHook ? "el gancho del ángulo dicho para video" : "la idea central del ángulo dicha para video"}; los demás, otras entradas a la misma idea. Ordénalos (rank) del que más lo detiene al que menos.`;
}

/**
 * Lo que cambia en cada intento. `retry`: lo que estuvo mal en el anterior (hookProblems). `avoid`: los
 * ganchos que ya tenía el ángulo («Otros ganchos»), para no repetirlos. `critique`: el crítico no se
 * detuvo con varios ganchos de la respuesta anterior (válida): se reemplazan esos y se conservan los demás.
 */
export function hooksTail(hasAngleHook: boolean, retry: string[] = [], avoid: string[] = [], critique?: HooksCritique | null): string {
  return [
    ...(avoid.length ? ["GANCHOS QUE YA TIENE ESTE ÁNGULO (escribe otros: otro hablado y, en lo posible, otra primera imagen)", ...list(avoid), ""] : []),
    ...(critique
      ? [
          "TU RESPUESTA ANTERIOR NO DETIENE EL SCROLL. Alguien de quien compra la miró como en Reels y no se detuvo con estos:",
          ...list(critique.weak),
          ...(critique.keep.length ? ["Conserva tal cual los que sí la detuvieron:", ...list(critique.keep.map((t) => `«${t}»`))] : []),
          "Reemplaza los demás por ganchos con tensión y el problema nombrado, y ordena de nuevo los 10.",
          "",
        ]
      : []),
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    hooksAsk(hasAngleHook),
  ].join("\n");
}

/** El mensaje entero en un solo texto (tests); la app lo manda en bloques. */
export function hooksUser(c: HooksContext, retry: string[] = [], avoid: string[] = [], critique?: HooksCritique | null): string {
  return `${hooksContextText(c)}\n${hooksTail(Boolean(c.angle.angle.hook), retry, avoid, critique)}`;
}
