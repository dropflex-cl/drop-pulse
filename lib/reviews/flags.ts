// Alertas de una reseña (ReviewItem › flags): ayudan a decidir rápido. Son sugerencias; nunca
// rechazan solas. Puro y testeable. Las palabras de envío vienen de dropflex v1 (LOGISTICS_RE).

export type ReviewFlag = "Menciona otra marca" | "Habla del envío" | "Muy corta" | "Posible dato personal" | "Lenguaje ofensivo";

/**
 * Habla del viaje del paquete y no del producto: en contra entrega vende el envío equivocado.
 * “Después de una semana” habla del uso, no del envío: el tiempo solo cuenta junto a “llegó” o “tardó”.
 */
const SHIPPING_RE =
  /\b(aliexpress|alibaba|china|chino|chin[ao]s|aduana|correos?|env[ií]os?|enviado|lleg[óo] en|tard[óo]|demor[óo]|paqueter[ií]a|paquete|encomienda|transportista|vendedor|seller|shipping|tracking|d[ií]as? h[áa]biles)\b/i;

/** “la marca X”, “mejor que el de …”, “igual al original de …”. */
const BRAND_RE = /\b(marca|original de|mejor que el de|igual que el de|igual al de|r[ée]plica|imitaci[óo]n|falsificado)\b/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
/** 8 o más dígitos seguidos (con espacios, puntos o guiones): un teléfono o un documento. */
const PHONE_RE = /(?:\+?\d[\s.-]?){8,}/;
const HANDLE_RE = /(^|\s)@[A-Za-z0-9_.]{3,}/;

const OFFENSIVE_RE = /\b(mierda|put[ao]s?|pendej[ao]s?|idiota|est[úu]pid[ao]s?|imb[ée]cil|basura|cabr[óo]n|carajo|joder|co[ñn]o|webon|weón|huev[óo]n|pelotud[ao]|boludo|verga|chingad[ao]|culero|marica|porra|caralho|merda)\b/i;

/** Menos de esto (sin contar espacios) no dice nada del producto. */
const SHORT_CHARS = 40;

export function reviewFlags(text: string | null | undefined): ReviewFlag[] {
  const t = (text ?? "").trim();
  const flags: ReviewFlag[] = [];
  if (BRAND_RE.test(t)) flags.push("Menciona otra marca");
  if (SHIPPING_RE.test(t)) flags.push("Habla del envío");
  if (t.replace(/\s/g, "").length < SHORT_CHARS) flags.push("Muy corta");
  if (EMAIL_RE.test(t) || PHONE_RE.test(t) || HANDLE_RE.test(t)) flags.push("Posible dato personal");
  if (OFFENSIVE_RE.test(t)) flags.push("Lenguaje ofensivo");
  return flags;
}
