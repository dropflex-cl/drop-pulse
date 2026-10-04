// El argumento de venta de la página (paso `page_argument`, docs/spec-prompts-simples.md §5): un
// redactor de respuesta directa escribe qué dice la página antes de que nadie piense en componentes ni
// en topes de caracteres. Después, `page_copy` lo reparte en la ficha y los componentes
// (lib/copy/prompts.ts). Una llamada que creaba el argumento y lo encajaba en 16 componentes con su
// manual completo (~14.300 tokens de system) rechazaba el 59 % de sus respuestas. Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import * as z from "zod/v4";
import { angleLine, buyerLine, buyerVoice, productFacts, proofLine } from "@/lib/ai/context";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, Differentiator, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleForPrompt } from "@/lib/angles/approved";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { amountAllowed, amountsIn, FORBIDDEN, INTERNAL } from "./schemas";

/** Frases del cliente ideal que recibe el redactor (buyerVoice): escribe con sus palabras. */
export const ARGUMENT_VOICE_LINES = 6;
/** Objeciones que responde el argumento. */
export const ARGUMENT_OBJECTIONS = { min: 5, max: 8 } as const;

const text = z.string();

export const pageArgumentSchema = z.object({
  headline: text.describe("El titular de la página: qué es y qué resuelve, desde el diferenciador."),
  promise: text.describe("La promesa central en dos o tres frases: en qué se diferencia de lo que el comprador ya usa y por qué eso le resuelve el problema."),
  angles: z
    .array(
      z.object({
        slot: z.number().int().describe("El número del ángulo."),
        moment: text.describe("Un momento concreto en que quien llega desde ese anuncio siente el problema, contado en primera o tercera persona."),
        benefit: text.describe("El beneficio que ese anuncio prometió, con el dato que lo prueba."),
        answer: text.describe("La duda que trae quien llega desde ese anuncio y su respuesta."),
      }),
    )
    .describe("Uno por ángulo, en orden."),
  extra_moment: text.nullable().describe("Solo con 2 ángulos: otro momento de quien compra (la página muestra tres). Con 3 ángulos, null."),
  objections: z.array(z.object({ objection: text, answer: text })).describe(`De ${ARGUMENT_OBJECTIONS.min} a ${ARGUMENT_OBJECTIONS.max} dudas que frenan la compra, con su respuesta.`),
  close: text.describe("El cierre: la oferta y el pago al recibir."),
});
export type PageArgument = z.infer<typeof pageArgumentSchema>;

export function argumentSystem(market: Market): string {
  return [
    "Eres un redactor de respuesta directa: escribes páginas de producto que venden en Latinoamérica, donde se paga contra entrega. El comprador ya hizo clic en un anuncio y llegó a la página: no necesita un gancho, necesita entender qué es, creer que le sirve y perder el miedo a comprar.",
    "",
    "- La página recibe tráfico de varios anuncios, uno por ángulo de venta, y todavía no se sabe cuál vende. Quien llega desde cualquiera tiene que reconocer lo que su anuncio le prometió. Lo común a todos es el diferenciador.",
    "- Dolor antes que producto; valor antes que confianza. Un beneficio es lo que gana el comprador más el dato que lo prueba, nunca un adjetivo suelto.",
    "- Escribe como le habla a quien compra alguien de confianza, con sus palabras. Si ya vio muchas promesas, le convencen los datos concretos, no los superlativos.",
    "- Nada de escenas que no salgan de quien compra o del producto.",
    "",
    "LÍMITES",
    "- Nada inventado: reseñas, expertos, cifras de clientes, estudios, plazos, certificaciones.",
    "- Nada de «cura», «trata» ni resultados garantizados: «ayuda a», «diseñado para».",
    "- Montos: solo los de PRECIO Y OFERTA. Urgencia, solo con datos reales.",
    "- Sin marcas de terceros.",
    "",
    marketBlock(market),
    "",
    "Es para el redactor que arma la página después: escribe el argumento en frases, no en formato de página. Nunca nombres la ficha, los ángulos, el precio y oferta ni el cliente ideal.",
  ].join("\n");
}

export interface ArgumentContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** Los ángulos aprobados (2 o 3), uno por conjunto de anuncios. */
  angles: AngleForPrompt[];
  differentiator?: Differentiator | null;
  /** Textos de las reseñas aprobadas (solo se cuentan). */
  reviews: string[];
  policies: string;
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`);

/** Las dudas que ya se conocen: la ficha y el cliente ideal, sin repetir. */
function knownDoubts(c: ArgumentContext): string[] {
  const o = c.avatar.objections;
  return [...new Set([o?.main_objection, o?.critical_question, o?.cash_on_delivery_concerns, ...(c.brief.known_objections ?? [])].map((t) => t?.trim()).filter((t): t is string => Boolean(t)))].slice(0, 8);
}

/** Lo fijo: igual en cada intento. Sin la ficha ni el cliente ideal en JSON. */
export function argumentContext(c: ArgumentContext): string {
  const doubts = knownDoubts(c);
  return [
    productFacts(c.brief),
    proofLine(c.brief, c.reviews),
    "",
    buyerLine(c.avatar),
    "Cómo lo dice:",
    ...bullets(buyerVoice(c.avatar, ARGUMENT_VOICE_LINES).map((v) => `«${v}»`)),
    "",
    c.differentiator ? `EN QUÉ SE DIFERENCIA: frente a ${c.differentiator.versus}, ${c.differentiator.claim}` : "EN QUÉ SE DIFERENCIA: (sin confirmar: usa cómo funciona el producto)",
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    c.policies,
    "",
    `LOS ANUNCIOS QUE TRAEN TRÁFICO (${c.angles.length} ángulos)`,
    ...c.angles.flatMap((a) => [angleLine(a.angle), ...(a.payload.core_message?.trim() ? [`- Idea central: ${a.payload.core_message.trim()}`] : [])]),
    ...(doubts.length ? ["", "DUDAS QUE YA SE CONOCEN", ...bullets(doubts)] : []),
  ].join("\n");
}

export function argumentTail(retry: string[] = []): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior tenía estos problemas: ${retry.join(" ")} Corrígelos y responde completa.`, ""] : []),
    "Escribe el argumento de venta de la página de este producto.",
  ].join("\n");
}

export interface ArgumentFacts {
  slots: number[];
  currency: string;
  /** Los montos que se pueden nombrar (allowedAmounts). */
  amounts: number[];
}

/** Lo que está mal en el argumento: un ángulo de más o de menos, las dudas, los montos y las promesas. */
export function argumentProblems(a: PageArgument, f: ArgumentFacts): string[] {
  const problems: string[] = [];
  const slots = a.angles.map((x) => x.slot);
  if (slots.length !== f.slots.length || f.slots.some((s) => !slots.includes(s))) problems.push(`angles trae los ángulos ${slots.join(", ") || "ninguno"}; tienen que ser uno por ángulo: ${f.slots.join(", ")}.`);
  if (f.slots.length === 2 && !a.extra_moment?.trim()) problems.push("Con 2 ángulos, extra_moment es otro momento de quien compra.");
  const n = a.objections.length;
  if (n < ARGUMENT_OBJECTIONS.min || n > ARGUMENT_OBJECTIONS.max) problems.push(`Trae ${n} dudas; tienen que ser de ${ARGUMENT_OBJECTIONS.min} a ${ARGUMENT_OBJECTIONS.max}.`);
  const texts = [a.headline, a.promise, a.close, a.extra_moment ?? "", ...a.angles.flatMap((x) => [x.moment, x.benefit, x.answer]), ...a.objections.flatMap((o) => [o.objection, o.answer])];
  const wrong = [...new Set(texts.flatMap((t) => amountsIn(t, f.currency)).filter((m) => !amountAllowed(m, f.amounts)))];
  if (wrong.length) problems.push(`Estos montos no están en PRECIO Y OFERTA: ${wrong.join(", ")}.`);
  for (const re of FORBIDDEN) {
    const hit = texts.find((t) => re.test(t));
    if (hit) problems.push(`«${hit.match(re)![0]}» es una promesa prohibida: usa «ayuda a» o «diseñado para».`);
  }
  const internal = texts.find((t) => INTERNAL.test(t));
  if (internal) problems.push(`«${internal.match(INTERNAL)![0]}» es una palabra interna: escribe para el comprador.`);
  return problems;
}

/** El argumento como lo lee el redactor de los componentes: texto, en secciones cortas. */
export function argumentText(a: PageArgument): string {
  return [
    `Titular: ${a.headline}`,
    `Promesa: ${a.promise}`,
    "",
    "Por anuncio (slot = el número del ángulo):",
    ...a.angles.flatMap((x) => [`- Ángulo ${x.slot}. Momento: ${x.moment}`, `  Beneficio: ${x.benefit}`, `  Duda y respuesta: ${x.answer}`]),
    ...(a.angles.length < 3 && a.extra_moment?.trim() ? [`- Otro momento (slot 3): ${a.extra_moment.trim()}`] : []),
    "",
    "Dudas:",
    ...a.objections.map((o) => `- ${o.objection} → ${o.answer}`),
    "",
    `Cierre: ${a.close}`,
  ].join("\n");
}
