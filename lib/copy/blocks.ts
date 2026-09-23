// Los bloques de la página del producto (etapa Textos, design-system/textos.md). Una sola definición
// para el prompt, la validación (lib/copy/schemas.ts) y la pantalla: el límite que ve el comerciante
// es el mismo que valida el código. Puro.

export const PAGE_BLOCKS = [
  "title",
  "short_name",
  "short_description",
  "offer_line",
  "benefit",
  "how_it_works",
  "shipping_payment",
  "guarantee",
  "seo_title",
  "seo_description",
] as const;
export type PageBlock = (typeof PAGE_BLOCKS)[number];
/** Las preguntas frecuentes van aparte en la salida del modelo (pregunta y respuesta). */
export type CopyKey = PageBlock | "faq";

export const PAGE_SECTIONS = ["Arriba del precio", "Por qué comprarlo", "Dudas", "Google"] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

export interface BlockDef {
  key: CopyKey;
  /** Nombre del bloque; en los que se repiten, sin el número («Beneficio» → «Beneficio 2»). */
  label: string;
  section: PageSection;
  /** Cuántos puede haber. */
  min: number;
  max: number;
  /** Límite del texto (en las preguntas, de la respuesta). */
  limit: number;
  unit: "caracteres" | "palabras";
  /** Tiene que quedar aprobado (o con el original de Shopify) para completar la etapa. */
  required: boolean;
  /** Qué guía al modelo. */
  guide: string;
}

/** En el orden de la página. */
export const BLOCKS: BlockDef[] = [
  { key: "title", label: "Título del producto", section: "Arriba del precio", min: 1, max: 1, limit: 70, unit: "caracteres", required: true, guide: "Qué es y el resultado o el dolor que resuelve, según el ángulo principal. Sin mayúsculas sostenidas ni palabras sueltas de SEO." },
  { key: "short_name", label: "Nombre corto", section: "Arriba del precio", min: 1, max: 1, limit: 30, unit: "caracteres", required: true, guide: "Cómo se llama el producto en una etiqueta, un anuncio o el carrito («Corrector de postura»)." },
  { key: "short_description", label: "Descripción corta", section: "Arriba del precio", min: 1, max: 1, limit: 160, unit: "caracteres", required: true, guide: "Una o dos frases bajo el título: el resultado y el dato que lo sostiene." },
  { key: "offer_line", label: "Frase de la oferta", section: "Arriba del precio", min: 1, max: 1, limit: 90, unit: "caracteres", required: true, guide: "Bajo el precio: la oferta principal con su número exacto y el cierre («2 por $39.990 · Paga al recibir»)." },
  { key: "benefit", label: "Beneficio", section: "Por qué comprarlo", min: 3, max: 5, limit: 110, unit: "caracteres", required: false, guide: "Resultado + el dato de la ficha que lo sostiene. Uno por bloque; al menos uno sale del ángulo secundario." },
  { key: "how_it_works", label: "Cómo funciona", section: "Por qué comprarlo", min: 1, max: 1, limit: 120, unit: "palabras", required: true, guide: "De 40 a 120 palabras: el mecanismo físico de la ficha contado con el ángulo principal, y para quién es." },
  { key: "faq", label: "Pregunta frecuente", section: "Dudas", min: 3, max: 6, limit: 280, unit: "caracteres", required: false, guide: "Las objeciones de los 2 desarrollos y de la ficha, respondidas. Al menos una sobre el pago contra entrega. Pregunta de hasta 90 caracteres." },
  { key: "shipping_payment", label: "Envío y pago", section: "Dudas", min: 1, max: 1, limit: 280, unit: "caracteres", required: true, guide: "Cómo paga (contra entrega, siempre) y cómo le llega, con los datos de ENVÍO Y PAGO. Sin plazos ni contactos que no estén ahí." },
  { key: "guarantee", label: "Garantía", section: "Dudas", min: 0, max: 1, limit: 160, unit: "caracteres", required: false, guide: "Solo si la ficha trae días de garantía: los días exactos y qué cubre." },
  { key: "seo_title", label: "Título para Google", section: "Google", min: 1, max: 1, limit: 60, unit: "caracteres", required: true, guide: "Lo que busca el comprador en Google: qué es + su uso principal." },
  { key: "seo_description", label: "Descripción para Google", section: "Google", min: 1, max: 1, limit: 155, unit: "caracteres", required: true, guide: "Qué es, el beneficio principal y el pago contra entrega." },
];

export const blockDef = (key: string): BlockDef | undefined => BLOCKS.find((b) => b.key === key);

/** Largo de la pregunta de una pregunta frecuente. */
export const FAQ_QUESTION_LIMIT = 90;

/** Cuánto mide un texto en la unidad del bloque. */
export function measure(text: string, unit: BlockDef["unit"]): number {
  const t = text.trim();
  if (unit === "palabras") return t ? t.split(/\s+/).length : 0;
  return [...t].length;
}

/** Las preguntas frecuentes se guardan como «pregunta\nrespuesta». */
export function joinFaq(question: string, answer: string): string {
  return `${question.trim()}\n${answer.trim()}`;
}

export function splitFaq(text: string): { q: string; a: string } {
  const i = text.indexOf("\n");
  return i < 0 ? { q: text.trim(), a: "" } : { q: text.slice(0, i).trim(), a: text.slice(i + 1).trim() };
}

/** Lo que se mide contra el límite: en las preguntas, la respuesta. */
export function measured(key: string, text: string): number {
  const def = blockDef(key);
  if (!def) return 0;
  return measure(key === "faq" ? splitFaq(text).a : text, def.unit);
}

/** Por qué no se puede guardar un texto: vacío, o pasado el límite. */
export function editProblem(key: string, text: string): string | null {
  const def = blockDef(key);
  if (!def) return "Ese bloque no existe.";
  if (key === "faq") {
    const { q, a } = splitFaq(text);
    if (!q || !a) return "Escribe la pregunta y la respuesta.";
    if (measure(q, "caracteres") > FAQ_QUESTION_LIMIT) return `La pregunta pasa de ${FAQ_QUESTION_LIMIT} caracteres.`;
  } else if (!text.trim()) return "El texto está vacío.";
  if (measured(key, text) > def.limit) return `Pasa de ${def.limit} ${def.unit}.`;
  return null;
}
