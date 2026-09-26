// Prompts del redactor de página (etapa Página del producto, docs/spec-pagina-componentes.md): una
// sola llamada escribe la ficha y el contenido de cada componente de conversión. La guía de cada
// componente sale de su content.ts (dónde va, qué objeción responde, palancas, reglas, prohibido), así
// que un componente nuevo en el catálogo entra al prompt sin tocar este archivo. Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, Differentiator, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import { angleHeading, angleMessage, type AngleForPrompt } from "@/lib/angles/approved";
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
    "- UNA PÁGINA PARA TODOS LOS ÁNGULOS: la página recibe tráfico de varios anuncios distintos, uno por ÁNGULO DE VENTA, y todavía no se sabe cuál vende. Quien llega desde cualquiera tiene que reconocer en la primera pantalla lo que su anuncio le prometió. Ningún ángulo se adueña de la página; tampoco la vuelvas genérica («para todo tipo de piel», «cuidado facial», «calidad premium»).",
    "- El DIFERENCIADOR manda en la ficha (título, descripción corta) y en los títulos de las secciones: qué hace el producto, qué problema resuelve y en qué se diferencia de lo que el cliente ya usa. Es lo común a todos los ángulos.",
    "- Cada ángulo aporta al menos un bloque visible (un beneficio, una razón, una pregunta o un momento del bloque de dolor), sin nombrarlo como ángulo. Su page_block dice qué tiene que encontrar quien llega desde ese anuncio.",
    "- DOLOR ANTES QUE PRODUCTO: el bloque de dolor (pain-block) muestra 3 momentos concretos del cliente ideal (trigger_moments, voice_of_customer), uno por ángulo (slot = el número del ángulo; con 2 ángulos, el tercero es otro momento del cliente ideal con slot 3), y remata en el diferenciador.",
    "- VALOR ANTES QUE CONFIANZA: la página demuestra por qué el producto vale lo que cuesta. El pago al recibir, el envío y los cambios ya los cubren los componentes de compra (benefit-usps, benefit-double-box, scrolling-benefits, faq-and-text); en image-with-benefits, stats-with-image, comparison-table y gif-strip va el producto: qué logra, cómo se usa y en qué se diferencia de lo que ya probó.",
    "- EL TONO LO DEFINE EL CLIENTE IDEAL: escribe como le habla alguien de confianza a esa persona (demographics.socioeconomic_level, identity.lifestyle, voice_of_customer). Con sofisticación 3 o más (market_sophistication) ya vio muchas promesas: nada de exageraciones ni superlativos, le convencen los datos concretos. Nunca «viral», «increíble», mayúsculas sostenidas ni urgencia sin dato real.",
    "- Nada de contexto inventado: los escenarios de uso salen del cliente ideal o de la ficha, nunca de tu imaginación («cuando el aire acondicionado te reseca…»).",
    "- Reparte las objeciones, una en cada lugar: los beneficios sobre el botón (benefit-usps) = pago, envío, cambios, origen, soporte; la doble tarjeta bajo el botón (benefit-double-box) = pago y cambio o garantía; la cinta (scrolling-benefits) = el servicio en frases cortas; la foto con razones (image-with-benefits) = el producto (función, comodidad, material); los GIF (gif-strip) = el producto funcionando, en 5 momentos distintos, el más fuerte primero; la comparativa = el producto frente a lo que el comprador ya probó; las preguntas (faq-and-text) = lo que queda. El pago al recibir sí se repite: es el cierre de confianza.",
    "- Beneficio = lo que gana el comprador + el dato que lo prueba. Nunca una especificación sola ni un adjetivo suelto.",
    "- Cada dato de la ficha va en UN lugar. No repitas una frase entre componentes.",
    "- Escribe para el comprador: nunca nombres «la ficha», los ángulos, «precio y oferta» ni el cliente ideal.",
    "- Usa las palabras del cliente ideal (cómo nombra su problema), no jerga de marketing.",
    "- Texto plano: sin HTML ni emojis. **negrita** solo donde el campo lo permite.",
    "- Respeta los largos de cada campo (van en su descripción): los cuenta el código y, si uno se pasa, la respuesta se rechaza entera.",
    "",
    "LA FICHA (listing)",
    `Dónde va: ${LISTING_INFO.placement} Responde: ${LISTING_INFO.objection}`,
    "- title: qué es + su diferencia o el dolor que resuelve (el diferenciador, no un ángulo). offer_line: la oferta con su número exacto de PRECIO Y OFERTA y «Paga al recibir». seo_*: lo que busca el comprador en Google.",
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
    // page_block desde ANGLE_BRIEF_PROMPT_VERSION 3; los de antes traían `landing` (una página entera).
    page_block: (b as { page_block?: string }).page_block,
    details: b.details,
    compliance_flags: b.compliance_flags,
  };
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
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** Los ángulos aprobados (2 o 3), uno por conjunto de anuncios. */
  angles: AngleForPrompt[];
  /** En qué se diferencia de lo que el cliente ya usa (confirmado o propuesto). */
  differentiator?: Differentiator | null;
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
    "DIFERENCIADOR (manda en la ficha y en los títulos de sección)",
    c.differentiator ? `Frente a ${c.differentiator.versus}: ${c.differentiator.claim}` : "(sin diferenciador confirmado: usa how_it_works y alternatives_already_tried de la ficha)",
    "",
    `ÁNGULOS DE VENTA (${c.angles.length}, aprobados por el comerciante; cada uno llega desde su propio anuncio y la página sirve a todos)`,
    ...c.angles.flatMap((a) => [angleHeading(a), json({ ...angleMessage(a.angle), ...briefForPage(a.payload) }), ""]),
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
      : ["Escribe la página del producto."]),
  ].join("\n");
}
