// Bloques de prompt compartidos (el mercado) y las etiquetas de los packs. Puro: sin SDK ni I/O, testeable.
// Regla de caché (prefijo estable): el system prompt no cambia entre productos de un mismo mercado;
// todo lo del producto va en el mensaje del usuario.

import { buyerLine, productFacts } from "@/lib/ai/context";
import type { CustomerAvatar, ProductBrief } from "@/lib/ai/schemas";
import { countryInfo, languageName, type Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";

/** Cómo se escribe en este mercado: idioma, trato, moneda, pago contra entrega y normativa. */
export function marketBlock(market: Market): string {
  const country = countryInfo(market.countryCode);
  const pt = market.language.startsWith("pt");
  return [
    "MERCADO",
    `- País: ${country?.name ?? market.countryCode}. Moneda: ${market.currency}. Idioma de todo lo que escribas: ${languageName(market.language)}.`,
    pt
      ? "- Escribe en portugués de Brasil, natural y cercano."
      : "- Escribe en español neutro con tuteo (nunca voseo ni «usted»), sin modismos de un solo país.",
    "- La tienda vende por dropshipping con pago contra entrega: el cliente paga cuando recibe. Es un argumento de confianza real.",
    "- Compra desde el teléfono (≈80%), casi siempre llega desde un anuncio de Facebook o Instagram.",
    `- Publicidad engañosa: rige ${country?.consumerAuthority ?? "la ley local de protección al consumidor"} y las políticas de Meta. Nada de promesas de salud, resultados garantizados ni cifras sin fuente.`,
  ].join("\n");
}

// ---------------------------------------------------------------- Etiquetas de los packs
// Las propone la estrategia (misma llamada que la extracción) y, si el comerciante pide otras, una llamada aparte.

export const PACK_LABEL_RULES = [
  "ETIQUETAS DE LOS PACKS (campo pack_labels)",
    "- Una por pack de PRECIO Y OFERTA. Convierten la cantidad en algo que esta persona quiere: cuánto le dura, con quién lo comparte, el repuesto, el regalo o el ahorro. «Pack 2 unidades» no vende; «2 meses de uso» o «Uno para ti y otro para tu pareja», sí.",
    "- Duración solo con datos reales: «2 meses de uso» exige que la ficha diga cuánto trae y cuánto se usa (60 cápsulas, 2 al día → 1 mes). Si no lo dice, usa otro ángulo; nunca inventes una dosis ni un rendimiento.",
    "- Nada de promesas de salud ni resultados: «2 meses de uso», nunca «2 meses de tratamiento» ni «resultados en 60 días». Respeta forbidden_claims de la ficha.",
    "- label: hasta 40 caracteres (cuéntalos: si pasa, reescríbela más corta, nunca la dejes a medias), en el idioma del mercado y con tuteo. support: una cifra real de PRECIO Y OFERTA (por unidad, por mes o el ahorro) o null. badge: 1 a 2 palabras en un solo pack, el de la OFERTA PRINCIPAL, o null.",
    "- La etiqueta del pack de la OFERTA PRINCIPAL es la más fuerte: es la que se va a empujar.",
];

export function packLabelsSystem(market: Market): string {
  return [
    "Eres el estratega de oferta de una tienda de dropshipping. Escribes el nombre de cada pack para que el cliente elija llevar más de una unidad.",
    "",
    marketBlock(market),
    "",
    ...PACK_LABEL_RULES,
  ].join("\n");
}

export function packLabelsUser(brief: ProductBrief, avatar: CustomerAvatar | null, pricing: PricingPlan, previous: string[]): string {
  return [
    productFacts(brief),
    ...(avatar ? ["", buyerLine(avatar), ...(avatar.more_than_one ? [`Por qué llevaría más de uno: ${avatar.more_than_one}`] : [])] : []),
    "",
    pricingBlock(pricing),
    "",
    ...(previous.length ? [`El comerciante pidió otras etiquetas. No repitas estas: ${previous.map((l) => `«${l}»`).join(", ")}.`, ""] : []),
    "Escribe las etiquetas de los packs.",
  ].join("\n");
}
