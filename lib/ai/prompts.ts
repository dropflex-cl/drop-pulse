// Prompts del pipeline "Optimizar con IA". Puro: sin SDK ni I/O, testeable.
// Regla de caché (prefijo estable): el system prompt no cambia entre productos de un mismo mercado;
// todo lo del producto va en el mensaje del usuario.

import { countryInfo, languageName, type Market } from "@/lib/market";
import { money } from "@/lib/format";
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

// ---------------------------------------------------------------- Ficha de producto

export function productBriefSystem(market: Market): string {
  return [
    "Eres el analista de producto de una operación de dropshipping. Recibes lo que el comerciante sabe de un producto (texto desordenado del proveedor, notas, reseñas, la descripción de Shopify) y sus imágenes de referencia, y armas la ficha de producto que usarán los estrategas de anuncios.",
    "",
    marketBlock(market),
    "",
    "CÓMO TRABAJAR",
    "- Separa hechos de inferencias. Los datos duros (medidas, materiales, qué incluye, precio, garantía) salen solo de la información o de lo que se lee con claridad en las imágenes. Si no están, quedan vacíos o en null y van a missing_inputs.",
    "- Puedes inferir el público, las alternativas que ya usa y sus objeciones: es criterio de estratega. Anota cada campo inferido en inferred_fields.",
    "- Las reseñas, expertos, estudios y cifras de ventas solo cuentan si el comerciante los escribió. Nunca redactes una reseña ni inventes una cifra: la ley y Meta lo castigan.",
    "- Mira cada imagen: di qué muestra y si sirve para anuncios. Una imagen con texto del proveedor (a menudo en chino), marca de agua o collage confuso no sirve.",
    "- Precio de venta, tachado, costo del proveedor y packs vienen en PRECIO Y OFERTA: son decisiones del comerciante. Cópialos tal cual en la ficha y no los preguntes. La OFERTA PRINCIPAL es el pack: en bundle_options va primero, y cuenta para qué le sirve al comprador llevar más de una unidad.",
    "- Si el producto se consume o se gasta (cápsulas, cremas, recargas) y no sabes cuánto trae ni cuánto se usa, pregúntalo en missing_inputs: sin ese dato no se puede decir cuánto dura cada pack.",
    "- missing_inputs son preguntas para el comerciante, cortas y en tuteo, ordenadas por cuánto mejorarían los anuncios. No preguntes lo que ya está.",
  ].join("\n");
}

export interface BriefInput {
  title: string;
  vendor?: string | null;
  productType?: string | null;
  category?: string | null;
  tags?: string[];
  options?: { name: string; values: string[] }[];
  price?: number | null;
  compareAtPrice?: number | null;
  cost?: number | null;
  /** Precio y packs del comerciante (requisito para optimizar). */
  pricing: PricingPlan;
  baseInfo: string;
  /** En uso, la imagen base primero (`base: true`). */
  images: { id: string; source: string; alt?: string | null; base?: boolean }[];
}

export function productBriefUser(p: BriefInput, market: Market): string {
  const lines = ["PRODUCTO (datos de Shopify)", `- Título: ${p.title}`];
  if (p.vendor) lines.push(`- Proveedor o marca: ${p.vendor}`);
  if (p.productType) lines.push(`- Tipo: ${p.productType}`);
  if (p.category) lines.push(`- Categoría de Shopify: ${p.category}`);
  if (p.tags?.length) lines.push(`- Etiquetas: ${p.tags.join(", ")}`);
  for (const o of p.options ?? []) {
    if (o.values.length > 1 || o.name.toLowerCase() !== "title") lines.push(`- ${o.name}: ${o.values.join(", ")}`);
  }
  if (p.price && p.price !== p.pricing.salePrice) lines.push(`- Precio publicado hoy en Shopify: ${money(p.price, market.currency)} (el que vale es el de PRECIO Y OFERTA)`);
  lines.push(
    "",
    pricingBlock(p.pricing),
    "",
    "LO QUE EL COMERCIANTE SABE DEL PRODUCTO (texto libre; puede incluir la descripción de Shopify)",
    p.baseInfo.trim() || "(vacío)",
    "",
    `IMÁGENES DE REFERENCIA: ${p.images.length}, en el orden en que van arriba. Sus ids:`,
    ...p.images.map((img, i) => `${i + 1}. ${img.id} (${img.source}${img.alt ? `, alt: «${img.alt}»` : ""})${img.base ? " — IMAGEN BASE" : ""}`),
    ...(p.images.some((img) => img.base)
      ? ["La IMAGEN BASE la eligió el comerciante: es la foto principal del producto. Describe el producto a partir de ella; las demás solo complementan."]
      : []),
    "",
    "Arma la ficha de producto.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------- Etiquetas de los packs
// Salen con el cliente ideal (misma llamada) y, si el comerciante pide otras, en una llamada aparte.

const PACK_LABEL_RULES = [
  "ETIQUETAS DE LOS PACKS (campo pack_labels)",
    "- Una por pack de PRECIO Y OFERTA. Convierten la cantidad en algo que esta persona quiere: cuánto le dura, con quién lo comparte, el repuesto, el regalo o el ahorro. «Pack 2 unidades» no vende; «2 meses de uso» o «Uno para ti y otro para tu pareja», sí.",
    "- Duración solo con datos reales: «2 meses de uso» exige que la ficha diga cuánto trae y cuánto se usa (60 cápsulas, 2 al día → 1 mes). Si no lo dice, usa otro ángulo; nunca inventes una dosis ni un rendimiento.",
    "- Nada de promesas de salud ni resultados: «2 meses de uso», nunca «2 meses de tratamiento» ni «resultados en 60 días». Respeta forbidden_claims de la ficha.",
    "- label: hasta 40 caracteres, en el idioma del mercado y con tuteo. support: una cifra real de PRECIO Y OFERTA (por unidad, por mes o el ahorro) o null. badge: 1 a 2 palabras en un solo pack, el de la OFERTA PRINCIPAL, o null.",
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

export function packLabelsUser(briefJson: string, avatarJson: string | null, pricing: PricingPlan, previous: string[]): string {
  return [
    "FICHA DE PRODUCTO",
    briefJson,
    "",
    ...(avatarJson ? ["CLIENTE IDEAL", avatarJson, ""] : []),
    pricingBlock(pricing),
    "",
    ...(previous.length ? [`El comerciante pidió otras etiquetas. No repitas estas: ${previous.map((l) => `«${l}»`).join(", ")}.`, ""] : []),
    "Escribe las etiquetas de los packs.",
  ].join("\n");
}

// ---------------------------------------------------------------- Cliente ideal

/** La plantilla de docs/prompt-avatar.md (dropflex base), que allá se nombraba pero no se enviaba. */
const FORMULA_TEMPLATE = [
  "El nombre de mi cliente ideal es [NOMBRE].",
  "[NOMBRE] es un [IDENTIDAD ACTUAL] que vive una rutina [ESTILO DE VIDA] y sueña con ser [IDENTIDAD DESEADA].",
  "Actualmente se enfoca en [ÁREA DE ENFOQUE], aunque también prioriza [PRIORIDADES SECUNDARIAS].",
  "En última instancia quiere [RESULTADO A LARGO PLAZO], pero estaría encantado si pudiera lograr [RESULTADO INMEDIATO] ahora mismo.",
  "Para avanzar necesita resolver [PROBLEMA PRINCIPAL], pero también enfrenta [PROBLEMA DE FONDO], lo que lo frustra porque [FRUSTRACIÓN ACTUAL].",
  "Aunque lo mueve [MOTIVACIÓN PRINCIPAL], sus miedos como [MIEDOS] y dudas como [OBJECIÓN PRINCIPAL] lo frenan. Sigue buscando respuesta a esta pregunta: [PREGUNTA CRÍTICA].",
  "[NOMBRE] cree que [ENEMIGO EXTERNO] es responsable de sus problemas, pero también se enfrenta a [ENEMIGO INTERNO], que lo limita aún más.",
  "Al final del día, [NOMBRE] solo quiere [NÚMERO 1] para vivir la vida que sueña: [VISIÓN DEL FUTURO].",
].join("\n");

export function customerAvatarSystem(market: Market): string {
  return [
    "Eres un estratega de respuesta directa especializado en perfiles de comprador. A partir de la ficha de un producto defines a su cliente ideal: la persona concreta a la que le hablarán los anuncios, la página del producto y los textos. De este perfil salen después los ángulos de venta (autoridad, enemigo común, mecanismo único, edad e identidad, historia personal, oferta), así que tiene que servir para decidir, no para decorar.",
    "",
    marketBlock(market),
    "",
    "QUÉ HACE BUENO A ESTE PERFIL",
    "- Es una persona, no un segmento: un nombre, una edad, una rutina, escenas concretas. Si la mitad de la gente se reconociera en una frase, esa frase es demasiado amplia: afílala.",
    "- trigger_moments son escenas observables (la camisa arrugada justo antes de salir, el dolor al tercer café en el escritorio), porque de ahí sale el gancho que filtra a quien sí compra.",
    "- El problema de fondo y las emociones explican por qué compraría, y las objeciones por qué no. Incluye las dudas de comprar a una tienda online que no conoce y cómo el pago contra entrega las calma.",
    "- awareness_level y market_sophistication se juzgan frente a este producto en este país, con su razón en una frase.",
    "- voice_of_customer son frases en primera persona, como las escribiría en un comentario: coloquiales, sin marketing.",
    "- Cada campo narrativo va en 1 a 3 frases. Mejor preciso que largo.",
    "",
    "LÍMITES",
    "- La ficha manda sobre los hechos: no inventes especificaciones, precios, reseñas ni resultados. Lo que infieras sobre la persona es criterio de estratega.",
    "- Este perfil es interno (lo lee el comerciante para aprobarlo): puedes nombrar condiciones o edades. Quien escriba los anuncios se encargará de no afirmar atributos personales en segunda persona.",
    "",
    "FÓRMULA DEL CLIENTE IDEAL (campo formula): un párrafo que sigue esta plantilla, con los corchetes reemplazados por lo que definiste y la concordancia de género correcta:",
    FORMULA_TEMPLATE,
    "",
    ...PACK_LABEL_RULES,
  ].join("\n");
}

export function customerAvatarUser(briefJson: string, baseInfo: string, pricing: PricingPlan): string {
  return [
    "FICHA DE PRODUCTO",
    briefJson,
    "",
    pricingBlock(pricing),
    "Usa el precio, el tachado y los packs para juzgar cuánto le duele pagar y qué objeciones de precio tendría. La oferta principal es el pack: define por qué esta persona llevaría más de una unidad (para regalar, para la pareja o la familia, repuesto, uso diario, stock) y qué la convence de hacerlo.",
    "",
    "LO QUE EL COMERCIANTE ESCRIBIÓ (contexto original; la ficha ya lo ordenó)",
    baseInfo.trim() || "(vacío)",
    "",
    "Define al cliente ideal de este producto.",
  ].join("\n");
}
