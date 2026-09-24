// Prompts del redactor de página (etapa Página del producto, docs/spec-pagina-componentes.md): una
// sola llamada escribe la ficha y el contenido de cada componente de conversión. La guía de cada
// componente sale de su content.ts (dónde va, qué objeción responde, palancas, reglas, prohibido), así
// que un componente nuevo en el catálogo entra al prompt sin tocar este archivo. Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { countryName, type Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import type { ConversionComponent } from "@/lib/shopify/components/define";
import { LISTING, LISTING_INFO } from "./listing";
import { WRITTEN } from "./page-schema";

const RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- Nada inventado que se presente como real: ni reseñas, ni expertos, ni cifras de clientes, ni estudios, ni plazos, ni certificaciones.",
  "- Los hechos los pone la tienda con TOKENS: {count} y {rating} (reseñas aprobadas), {min} y {max} (días hábiles de entrega), {return_days}, {warranty_months}, {threshold} (políticas), {qty} (stock real), {time} y {ship} (reloj de despacho). Escribe el token, nunca el número. Usa solo los tokens que permite cada campo.",
  "- Salud y bienestar: «ayuda a», «diseñado para», «alivia la sensación de». Nunca «cura», «trata», «elimina» un malestar, ni resultados garantizados, ni plazos médicos, ni enfermedades.",
  "- Precios y packs: exactamente los montos de PRECIO Y OFERTA (precio, tachado, packs, precio por unidad y ahorro). Nunca el costo ni la ganancia. Los componentes no llevan montos: solo la ficha.",
  "- Urgencia solo con datos reales (el reloj de despacho y el stock los pone la tienda). Nada de «últimas unidades» ni contadores inventados.",
  "- Reseñas: solo ids de RESEÑAS APROBADAS, con las palabras del autor. Nunca una reseña, un nombre o una cita inventados.",
  "- El cierre de confianza es el pago contra entrega: se paga al recibir.",
  "- Sin marcas de terceros ni comparaciones con nombre.",
].join("\n");

function componentGuide(c: ConversionComponent): string {
  return [
    `### ${c.id} (${c.name})`,
    `Dónde va: ${c.placement}`,
    `Responde: ${c.objection}`,
    `Por qué funciona: ${c.levers.join(" ")}`,
    `Datos reales (no los escribes tú): ${c.realData.join(" ")}`,
    "Reglas:",
    ...c.rules.map((r) => `- ${r}`),
    "Prohibido:",
    ...c.forbidden.map((r) => `- ${r}`),
    `Ejemplo de salida (otro producto): ${JSON.stringify(c.examples[0])}`,
  ].join("\n");
}

export function copySystem(market: Market): string {
  return [
    "Eres el redactor de páginas de producto de una operación de dropshipping con pago contra entrega en Latinoamérica. El comprador ya hizo clic en un anuncio y llegó a la página: no necesitas un gancho de 3 segundos. Escribes, en una sola respuesta, la ficha del producto y el contenido de cada componente de conversión de la página. El comerciante después elige qué componentes usa, así que cada uno tiene que funcionar solo y, juntos, no repetirse.",
    "",
    marketBlock(market),
    "",
    "CÓMO ESCRIBIR",
    "- El ángulo PRINCIPAL manda en la ficha (título, descripción corta) y en los títulos de las secciones. El SECUNDARIO aporta al menos un beneficio y una pregunta.",
    "- Reparte las objeciones, una en cada lugar: los beneficios sobre el botón (benefit-usps) = pago, envío, cambios, origen, soporte; la doble tarjeta bajo el botón (benefit-double-box) = pago y cambio o garantía; la cinta (scrolling-benefits) = el servicio en frases cortas; la foto con razones (image-with-benefits) = el producto (función, comodidad, material); los GIF (gif-strip) = el producto funcionando, en 5 momentos distintos, el más fuerte primero; la comparativa = por qué aquí y no un genérico; las preguntas (faq-and-text) = lo que queda. El pago al recibir sí se repite: es el cierre de confianza.",
    "- Beneficio = lo que gana el comprador + el dato que lo prueba. Nunca una especificación sola ni un adjetivo suelto.",
    "- Cada dato de la ficha va en UN lugar. No repitas una frase entre componentes.",
    "- Escribe para el comprador: nunca nombres «la ficha», los ángulos, «precio y oferta» ni el cliente ideal.",
    "- Usa las palabras del cliente ideal (cómo nombra su problema), no jerga de marketing.",
    "- Texto plano: sin HTML ni emojis. **negrita** solo donde el campo lo permite.",
    "- Respeta los largos de cada campo (van en su descripción): los cuenta el código y, si uno se pasa, la respuesta se rechaza entera.",
    "",
    "LA FICHA (listing)",
    `Dónde va: ${LISTING_INFO.placement} Responde: ${LISTING_INFO.objection}`,
    "- title: qué es + el resultado o el dolor, con el ángulo principal. offer_line: la oferta con su número exacto de PRECIO Y OFERTA y «Paga al recibir». seo_*: lo que busca el comprador en Google.",
    "",
    "LOS COMPONENTES (en el orden de la página)",
    ...WRITTEN.flatMap((c) => [componentGuide(c), ""]),
    RULES,
  ].join("\n");
}

function json(v: unknown) {
  return JSON.stringify(v, null, 2);
}

/** Lo del desarrollo que sirve para la página (sin ganchos ni conceptos visuales: eso es del anuncio). */
function briefForPage(b: AngleBriefPayload) {
  return {
    core_message: b.core_message,
    psychological_lever: b.psychological_lever,
    proof_to_show: b.proof_to_show,
    objection_handling: b.objection_handling,
    offer_layer: b.offer_layer,
    landing: b.landing,
    details: b.details,
    compliance_flags: b.compliance_flags,
  };
}

export interface PromptReview {
  id: string;
  rating: number;
  text: string;
  country?: string;
}

export interface CopyContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** Los 2 desarrollos aprobados, con el nombre de su ángulo. */
  primary: { name: string; payload: AngleBriefPayload };
  secondary: { name: string; payload: AngleBriefPayload };
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
}

/** Reseñas que ve el modelo: las 30 primeras aprobadas, con el texto recortado. */
const REVIEWS_MAX = 30;
const REVIEW_CHARS = 320;

function policiesBlock(c: CopyContext): string {
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
    ...c.reviews.slice(0, REVIEWS_MAX).map((r) => `- ${r.id} · ${r.rating}★${r.country ? ` · ${r.country}` : ""}: ${r.text.length > REVIEW_CHARS ? `${r.text.slice(0, REVIEW_CHARS)}…` : r.text}`),
  ].join("\n");
}

/** `retry`: lo que estuvo mal en el intento anterior (lib/copy/page-schema.ts › pageProblems). */
export function copyUser(c: CopyContext, retry: string[] = []): string {
  const components = c.write.filter((id) => id !== LISTING);
  return [
    "FICHA DE PRODUCTO",
    json(c.brief),
    "",
    "CLIENTE IDEAL (aprobado por el comerciante)",
    json(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    policiesBlock(c),
    "",
    reviewsBlock(c),
    "",
    `ÁNGULO PRINCIPAL: ${c.primary.name} (aprobado por el comerciante)`,
    json(briefForPage(c.primary.payload)),
    "",
    `ÁNGULO SECUNDARIO: ${c.secondary.name} (aprobado por el comerciante)`,
    json(briefForPage(c.secondary.payload)),
    "",
    "HOY EN SHOPIFY (lo que se reemplaza)",
    `- Título: ${c.shopify.title}`,
    `- Descripción: ${c.shopify.description?.trim() || "(vacía)"}`,
    ...(c.approved?.length
      ? ["", "YA APROBADO POR EL COMERCIANTE (no lo escribas de nuevo; lo tuyo tiene que calzar con esto y no repetirlo)", ...c.approved.map((a) => `- ${a.component}: ${JSON.stringify(a.content)}`)]
      : []),
    "",
    "QUÉ ESCRIBIR",
    c.write.includes(LISTING) ? "- listing: la ficha." : "- listing: ya aprobada, responde null.",
    `- components: ${components.length ? components.join(", ") : "(ninguno)"}.`,
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Escribe la página del producto.",
  ].join("\n");
}
