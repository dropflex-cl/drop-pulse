// Prompts del redactor de página (etapa Textos, docs/spec-textos.md). No hay un .md de este agente en
// agentes-creativos: se escribe aquí con la misma estructura que los de ángulo, adaptado a LATAM con
// pago contra entrega. Puro. Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { countryName, type Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { BLOCKS, FAQ_QUESTION_LIMIT } from "./blocks";

const RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- Nada inventado que se presente como real: ni reseñas, ni expertos, ni cifras de clientes, ni estudios, ni plazos, ni certificaciones. Si un bloque necesita un dato que no está, escríbelo sin ese dato y dilo en missing.",
  "- Salud y bienestar: «ayuda a», «diseñado para», «alivia la sensación de». Nunca «cura», «trata», «elimina» un malestar, ni resultados garantizados, ni plazos médicos, ni enfermedades.",
  "- Precios y packs: exactamente los montos de PRECIO Y OFERTA (precio, tachado, packs, precio por unidad y ahorro). Nunca el costo ni la ganancia. «Antes $X» solo con el precio tachado.",
  "- Urgencia solo si la ficha trae una fecha real (real_deadline_or_event). Nada de stock limitado ni contadores.",
  "- Garantía solo si la ficha trae proof.guarantee_days: con esos días exactos. Sin días, no hay bloque guarantee y ningún otro bloque promete devoluciones ni «pruébalo sin riesgo».",
  "- El cierre de confianza es el pago contra entrega: se paga al recibir. Va en la frase de la oferta, en Envío y pago y en al menos una pregunta.",
  "- Sin marcas de terceros ni comparaciones con nombre.",
].join("\n");

export function copySystem(market: Market): string {
  const blocks = BLOCKS.map((b) => {
    const count = b.min === b.max ? `${b.min}` : `${b.min} a ${b.max}`;
    const size = b.key === "faq" ? `pregunta ≤ ${FAQ_QUESTION_LIMIT} caracteres, respuesta ≤ ${b.limit}` : `≤ ${b.limit} ${b.unit}`;
    return `- ${b.key} (${b.label}; ${count}; ${size}): ${b.guide}`;
  });
  return [
    "Eres el redactor de páginas de producto de una operación de dropshipping con pago contra entrega en Latinoamérica. El comprador ya hizo clic en un anuncio y llegó a la página: no necesitas un gancho de 3 segundos. Cada bloque responde lo que se pregunta en ese punto: qué es, por qué funciona, para quién, cuánto cuesta, cómo pago, qué pasa si no me sirve.",
    "",
    marketBlock(market),
    "",
    "CÓMO ESCRIBIR",
    "- El ángulo PRINCIPAL manda en el título, la descripción corta y «cómo funciona». El SECUNDARIO aporta al menos un beneficio y una pregunta. Marca en angle de dónde sale cada bloque.",
    "- Beneficio = resultado + el dato de la ficha que lo sostiene («Tela transpirable que puedes usar bajo la ropa todo el día»), nunca un adjetivo suelto.",
    "- Las preguntas salen de las objeciones de los 2 desarrollos, de known_objections de la ficha y de las objeciones del cliente ideal. La respuesta es corta, concreta y sin rodeos.",
    "- Usa las palabras del cliente ideal (cómo nombra su problema), no jerga de marketing.",
    "- Texto plano: sin HTML, sin markdown, sin emojis. Frases cortas. El código arma la página.",
    "- note: una frase para el comerciante sobre por qué lo escribiste así. Si reemplazas el título actual de Shopify, di qué mejora.",
    "",
    "LOS BLOQUES (en el orden de la página)",
    ...blocks,
    "",
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
  /** Al reescribir: lo aprobado (no se toca) y lo descartado (no se repite). */
  approved?: { label: string; text: string }[];
  discarded?: { label: string; text: string }[];
}

function shippingBlock(c: CopyContext): string {
  const country = countryName(c.countryCode) || "todo el país";
  return [
    "ENVÍO Y PAGO (datos de la tienda; úsalos tal cual)",
    `- Pago contra entrega: el cliente paga cuando recibe el pedido.`,
    c.freeShipping ? `- Envío gratis a todo ${country}.` : "- El envío tiene costo: no digas cuánto (no lo sabemos).",
    "- Plazo de entrega y WhatsApp de la tienda: no los sabemos. No inventes días ni números: deja el bloque sin ellos y ponlo en missing («el plazo de entrega y tu WhatsApp»).",
  ].join("\n");
}

/** `retry`: lo que estuvo mal en el intento anterior (lib/copy/schemas.ts › copyProblems). */
export function copyUser(c: CopyContext, retry: string[] = []): string {
  const redo = Boolean(c.approved?.length || c.discarded?.length);
  return [
    "FICHA DE PRODUCTO",
    json(c.brief),
    "",
    "CLIENTE IDEAL (aprobado por el comerciante)",
    json(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    shippingBlock(c),
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
    ...(redo
      ? [
          "",
          "REESCRITURA",
          "Ya aprobados (no los escribas de nuevo; el resto de la página tiene que calzar con ellos):",
          ...(c.approved?.length ? c.approved.map((a) => `- ${a.label}: ${a.text}`) : ["- (ninguno)"]),
          "Descartados por el comerciante (escribe algo distinto, no una variación):",
          ...(c.discarded?.length ? c.discarded.map((d) => `- ${d.label}: ${d.text}`) : ["- (ninguno)"]),
          "Escribe solo los bloques que faltan para completar la página.",
        ]
      : []),
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    redo ? "Completa la página del producto." : "Escribe la página del producto.",
  ].join("\n");
}
