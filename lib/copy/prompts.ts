// Prompts del redactor de la página (paso `page_copy`, docs/spec-pagina-componentes.md): reparte el
// ARGUMENTO DE VENTA ya escrito (lib/copy/argument.ts, paso `page_argument`) en la ficha y el contenido
// de cada componente de conversión. Cada componente entra con una guía de 3 líneas (componentBrief:
// dónde va, qué responde y su forma), no con su manual: las reglas de su content.ts las cuidan el
// esquema y pageProblems después, y los largos van en la descripción de cada campo
// (docs/spec-prompts-simples.md §5). Un componente nuevo del catálogo entra sin tocar este archivo. Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { productFacts, proofLine } from "@/lib/ai/context";
import { marketBlock } from "@/lib/ai/prompts";
import type { PackLabel, ProductBrief } from "@/lib/ai/schemas";
import { countryName, type Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import type { ConversionComponent } from "@/lib/shopify/components/define";
import { argumentText, type PageArgument } from "./argument";
import { LISTING, LISTING_INFO } from "./listing";
import { WRITTEN } from "./page-schema";

/** La primera oración de un texto. */
const firstSentence = (t: string) => t.trim().match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t.trim();

/**
 * La guía de un componente en el prompt: dónde va, qué duda responde y su forma (los campos de primer
 * nivel con lo que dice su esquema). El manual entero (palancas, reglas, prohibido, ejemplo) queda en
 * su content.ts para el validador y los tests.
 */
export function componentBrief(c: ConversionComponent): string {
  const shape = (c.content as unknown as { shape?: Record<string, { description?: string }> }).shape ?? {};
  const form = Object.entries(shape)
    .map(([k, v]) => (v.description ? `${k}: ${firstSentence(v.description)}` : k))
    .join(" · ");
  return [`### ${c.id} (${c.name})`, `Dónde va: ${firstSentence(c.placement)} Responde: ${c.objection}`, `Forma: ${form}`].join("\n");
}

export function copySystem(market: Market): string {
  return [
    "Eres el redactor que arma la página de producto de una tienda con pago contra entrega en Latinoamérica. Recibes el ARGUMENTO DE VENTA ya escrito y lo repartes en la ficha del producto y en cada componente de la página. El comerciante después elige qué componentes usa: cada uno tiene que funcionar solo y, juntos, no repetirse.",
    "",
    marketBlock(market),
    "",
    "CÓMO REPARTIR",
    "- La ficha y los títulos de sección dicen el titular y la promesa. Cada ángulo del argumento aparece en al menos un componente, sin nombrarlo como ángulo.",
    "- Cada duda en un solo lugar: pago, envío, cambios y soporte en los componentes de compra (benefit-usps, benefit-double-box, scrolling-benefits, faq-and-text); el producto (qué logra, cómo se usa, en qué se diferencia) en image-with-benefits, stats-with-image, comparison-table y gif-strip; lo que queda, en las preguntas. El pago al recibir sí se repite: es el cierre de confianza.",
    "- pain-block: los momentos del argumento, uno por ángulo (slot = su número).",
    "- No repitas una frase entre componentes. No agregues ideas ni datos que no estén en el argumento, el producto o las políticas.",
    "",
    "LÍMITES",
    "- Los hechos los pone la tienda con TOKENS: {count} y {rating} (reseñas), {min} y {max} (días hábiles de entrega), {return_days}, {warranty_months}, {threshold} (políticas), {qty} (stock), {time} y {ship} (reloj de despacho). Escribe el token, nunca el número, y solo los que permite cada campo.",
    "- Reseñas: solo ids de RESEÑAS APROBADAS. Los montos solo en la ficha, exactos de PRECIO Y OFERTA.",
    "- Nada de «cura» o «trata», resultados garantizados ni urgencia inventada. Sin marcas de terceros.",
    "- Texto plano: sin HTML ni emojis; **negrita** solo donde el campo lo permite. Los largos van en la descripción de cada campo.",
    "- Escribe para el comprador: nunca nombres la ficha, los ángulos, el precio y oferta ni el cliente ideal.",
    "",
    "LA FICHA (listing)",
    `Dónde va: ${LISTING_INFO.placement} Responde: ${LISTING_INFO.objection}`,
    "",
    "LOS COMPONENTES (en el orden de la página)",
    ...WRITTEN.flatMap((c) => [componentBrief(c), ""]),
  ].join("\n");
}

export interface PromptReview {
  id: string;
  rating: number;
  text: string;
  country?: string;
  /** Fotos del comprador: review-wall pone primero las reseñas con foto. */
  photos?: number;
}

export interface CopyContext {
  brief: ProductBrief;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** El argumento de venta (paso page_argument): lo que la página dice. */
  argument: PageArgument;
  shopify: { title: string; description: string | null };
  countryCode: string;
  freeShipping: boolean;
  /** Días de garantía de la ficha ({return_days} en la tienda); sin garantía, null. */
  returnDays: number | null;
  reviews: PromptReview[];
  /** Qué escribir: "listing" y los ids de los componentes. */
  write: string[];
  /** Al reescribir: lo aprobado (no se toca; lo demás tiene que calzar con esto). */
  approved?: { component: string; content: unknown }[];
  /** Al corregir por partes: lo que ya salió bien en esta escritura (no se toca; lo nuevo calza con eso). */
  kept?: { component: string; content: unknown }[];
}

/** Reseñas que ve el modelo: las 30 primeras aprobadas, con el texto recortado. */
const REVIEWS_MAX = 30;
const REVIEW_CHARS = 320;

/** Las políticas reales de la tienda (las lee también el argumento). */
export function policiesBlock(c: Pick<CopyContext, "countryCode" | "freeShipping" | "returnDays">): string {
  const country = countryName(c.countryCode) || "todo el país";
  return [
    "POLÍTICAS DE LA TIENDA (datos reales; los números los pone la tienda con tokens)",
    "- Pago contra entrega: el cliente paga cuando recibe el pedido (policy cod).",
    c.freeShipping ? `- Envío gratis a todo ${country} (policy free_shipping).` : "- El envío tiene costo: no prometas envío gratis.",
    c.returnDays ? `- Cambios o devoluciones: {return_days} días (policy returns).` : "- Sin política de cambios cargada: no prometas cambios ni devoluciones; usa garantía legal o despacho y seguimiento.",
    "- Plazo de entrega: {min} a {max} días hábiles (policy shipping_time o delivery). Garantía en meses ({warranty_months}) y WhatsApp: la tienda los muestra solo si existen; puedes usarlos con su policy.",
  ].join("\n");
}

function reviewsBlock(c: CopyContext): string {
  if (!c.reviews.length) return "RESEÑAS APROBADAS\n(ninguna: no escribas componentes que citen reseñas)";
  return [
    `RESEÑAS APROBADAS (${c.reviews.length}; cita por id, con las palabras del autor)`,
    ...c.reviews
      .slice(0, REVIEWS_MAX)
      .map((r) => `- ${r.id} · ${r.rating}★${r.country ? ` · ${r.country}` : ""}${r.photos ? ` · ${r.photos} ${r.photos === 1 ? "foto" : "fotos"}` : ""}: ${r.text.length > REVIEW_CHARS ? `${r.text.slice(0, REVIEW_CHARS)}…` : r.text}`),
  ].join("\n");
}

/** Un reintento: la respuesta anterior y lo que estuvo mal en ella (lib/copy/page-schema.ts › pageProblems). */
export interface CopyRetry {
  previous: unknown;
  problems: string[];
}

/**
 * `retry`: el modelo recibe su respuesta anterior para corregir solo lo que falla. Reescribirla
 * entera cambiaría también lo que estaba bien y podría romper otra regla.
 */
export function copyUser(c: CopyContext, retry?: CopyRetry): string {
  const components = c.write.filter((id) => id !== LISTING);
  return [
    productFacts(c.brief),
    proofLine(c.brief, c.reviews.map((r) => r.text)),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    policiesBlock(c),
    "",
    reviewsBlock(c),
    "",
    "ARGUMENTO DE VENTA (lo que dice la página)",
    argumentText(c.argument),
    "",
    "HOY EN SHOPIFY (lo que se reemplaza)",
    `- Título: ${c.shopify.title}`,
    `- Descripción: ${c.shopify.description?.trim() || "(vacía)"}`,
    ...(c.approved?.length
      ? ["", "YA APROBADO POR EL COMERCIANTE (no lo escribas de nuevo; lo tuyo tiene que calzar con esto y no repetirlo)", ...c.approved.map((a) => `- ${a.component}: ${JSON.stringify(a.content)}`)]
      : []),
    ...(c.kept?.length
      ? ["", "YA ESCRITO Y CORRECTO (queda igual; no lo escribas de nuevo; lo tuyo tiene que calzar con esto y no repetirlo)", ...c.kept.map((a) => `- ${a.component}: ${JSON.stringify(a.content)}`)]
      : []),
    "",
    "QUÉ ESCRIBIR",
    c.write.includes(LISTING) ? "- listing: la ficha." : "- listing: ya aprobada, responde null.",
    `- components: ${components.length ? components.join(", ") : "(ninguno)"}.`,
    "",
    ...(retry?.problems.length
      ? [
          "TU RESPUESTA ANTERIOR",
          JSON.stringify(retry.previous),
          "",
          `No cumple las reglas: ${retry.problems.join(" ")}`,
          "Corrige solo eso y deja igual todo lo demás. Responde de nuevo el objeto completo con lo que pide QUÉ ESCRIBIR.",
        ]
      : ["Reparte el argumento en la página del producto."]),
  ].join("\n");
}
