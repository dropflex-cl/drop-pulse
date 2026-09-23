// Prompts del pipeline "Optimizar con IA". Puro: sin SDK ni I/O, testeable.
// Regla de caché (prefijo estable): el system prompt no cambia entre productos de un mismo mercado;
// todo lo del producto va en el mensaje del usuario.

import { countryInfo, languageName, type Market } from "@/lib/market";
import { money } from "@/lib/format";

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
  if (p.price) lines.push(`- Precio actual: ${money(p.price, market.currency)}`);
  if (p.compareAtPrice && p.price && p.compareAtPrice > p.price) lines.push(`- Precio tachado: ${money(p.compareAtPrice, market.currency)}`);
  if (p.cost) lines.push(`- Costo del producto: ${money(p.cost, market.currency)}`);
  lines.push(
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
  ].join("\n");
}

export function customerAvatarUser(briefJson: string, baseInfo: string): string {
  return [
    "FICHA DE PRODUCTO",
    briefJson,
    "",
    "LO QUE EL COMERCIANTE ESCRIBIÓ (contexto original; la ficha ya lo ordenó)",
    baseInfo.trim() || "(vacío)",
    "",
    "Define al cliente ideal de este producto.",
  ].join("\n");
}
