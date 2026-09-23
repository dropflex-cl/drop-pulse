// Salida estructurada del redactor de página y su validación. Esquema compacto a propósito (la salida
// estructurada compila el esquema a una gramática y la API rechaza las muy grandes): una lista de
// bloques con la clave de un enum. Cantidades, largos, precios y garantía se revisan en código
// (copyProblems): si algo falla se pide otra respuesta; nunca se recorta ni se completa en silencio.

import * as z from "zod/v4";
import { currencySymbol, parseAmount } from "@/lib/format";
import type { PricingPlan } from "@/lib/pricing/plan";
import { BENEFIT_KINDS, BLOCKS, FAQ_QUESTION_LIMIT, PAGE_BLOCKS, measure, type CopyKey } from "./blocks";

/** Bump cuando cambie el prompt o el esquema del redactor de página. */
export const COPY_PROMPT_VERSION = 2;

const text = z.string();
const angle = z.enum(["primary", "secondary", "none"]).describe("De qué desarrollo sale: el principal, el secundario o ninguno (datos de la ficha).");

const block = z.object({
  key: z.enum(PAGE_BLOCKS),
  text: text.describe("El texto tal como va en la página, en el idioma del mercado y con tuteo. Texto plano, sin HTML ni markdown."),
  angle,
  note: text.describe("Para el comerciante, una frase: por qué lo propones («Nombra qué es y el dolor que resuelve, como en el ángulo principal»)."),
  missing: z.string().nullable().describe("Si falta un dato para completar este bloque, cuál («el plazo de entrega y tu WhatsApp»). null si no falta nada."),
  kind: z.enum(BENEFIT_KINDS).nullable().describe("Solo en benefit: la razón de compra, distinta en cada uno. null en los demás bloques."),
});

export const pageCopySchema = z.object({
  blocks: z.array(block).describe("Los bloques de la página, en su orden. Los que se repiten (benefit) van uno por elemento."),
  faq: z
    .array(z.object({ question: text, answer: text, angle, note: text }))
    .describe("Las preguntas frecuentes, en orden de importancia para comprar."),
  proof_used: z.array(text).describe("Qué dato real de la ficha respalda cada cifra o afirmación fuerte."),
  missing_inputs: z.array(text),
  compliance_flags: z.array(text),
});

export type PageCopyOutput = z.infer<typeof pageCopySchema>;

export interface CopyFacts {
  currency: string;
  /** Los montos que se pueden nombrar: precio, tachado, packs, precio por unidad y ahorro. */
  amounts: number[];
  /** Días de garantía de la ficha; sin garantía, null o 0. */
  guaranteeDays: number | null;
  /** Al reescribir: cuántos bloques de cada clave ya están aprobados (no se vuelven a escribir). */
  kept?: Partial<Record<CopyKey, number>>;
}

/** Palabras de trabajo que no pueden llegar a la tienda («según la ficha», «el ángulo principal»). */
const INTERNAL = /(?<![\p{L}])(la ficha|ficha de producto|precio y oferta|cliente ideal|[áa]ngulo (principal|secundario))(?![\p{L}])/iu;

// Promesas que la ley y Meta no permiten en productos de bienestar (el prompt da las alternativas).
const FORBIDDEN = [/\bcura(n|r)?\b/i, /\bresultados? garantizados?\b/i, /\b100\s?% garantizad[oa]s?\b/i];
const COD = /pag(a|as|o|ar)\b.*\b(recib|entreg)|contra ?entrega|al recibir/i;

/** Montos que la página puede nombrar: precio, tachado y su ahorro, y cada pack (total, por unidad, ahorro). */
export function allowedAmounts(p: PricingPlan): number[] {
  const out = [p.salePrice, ...p.packs.flatMap((k) => [k.price, k.perUnitPrice, k.savings])];
  if (p.compareAtPrice != null) out.push(p.compareAtPrice, p.compareAtPrice - p.salePrice);
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

/** Los montos con el símbolo de la moneda que aparecen en un texto. */
export function amountsIn(t: string, currency: string): number[] {
  const symbol = currencySymbol(currency).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...t.matchAll(new RegExp(`${symbol}\\s?(\\d[\\d.,]*\\d|\\d)`, "g"))].map((m) => parseAmount(m[1], currency)).filter((n) => Number.isFinite(n));
}

/**
 * Qué está mal en la respuesta del modelo: bloques que faltan o sobran, largos, montos que no son
 * los de PRECIO Y OFERTA, garantía sin días en la ficha, promesas prohibidas. Vacío si se puede guardar.
 */
export function copyProblems(out: PageCopyOutput, facts: CopyFacts): string[] {
  const problems: string[] = [];
  const kept = facts.kept ?? {};
  const guarantee = (facts.guaranteeDays ?? 0) > 0;

  for (const def of BLOCKS) {
    const n = def.key === "faq" ? out.faq.length : out.blocks.filter((b) => b.key === def.key).length;
    const already = kept[def.key] ?? 0;
    let min = Math.max(0, def.min - already);
    let max = Math.max(0, def.max - already);
    if (def.key === "guarantee") {
      min = guarantee && !already ? 1 : 0;
      max = guarantee && !already ? 1 : 0;
      if (!guarantee && n) problems.push("Incluiste una garantía y la ficha no trae días de garantía: quita ese bloque.");
      else if (n < min) problems.push("La ficha trae días de garantía: agrega el bloque guarantee con esos días.");
      continue;
    }
    if (n < min) problems.push(`Faltan bloques ${def.key}: trae ${n} y deben ser al menos ${min}.`);
    if (n > max) problems.push(`Sobran bloques ${def.key}: trae ${n} y deben ser como máximo ${max}.`);
  }

  const lengths = (key: CopyKey, t: string, i: number) => {
    const def = BLOCKS.find((b) => b.key === key)!;
    const where = def.max > 1 ? `${key} ${i + 1}` : key;
    if (!t.trim()) problems.push(`${where} está vacío.`);
    const size = measure(t, def.unit);
    if (size > def.limit) problems.push(`${where} tiene ${size} ${def.unit} y el máximo es ${def.limit}.`);
    if (key === "how_it_works" && size < 40) problems.push(`how_it_works tiene ${size} palabras y el mínimo es 40.`);
  };
  const seen: Partial<Record<CopyKey, number>> = {};
  for (const b of out.blocks) {
    const i = seen[b.key] ?? 0;
    seen[b.key] = i + 1;
    lengths(b.key, b.text, i);
  }
  out.faq.forEach((f, i) => {
    if (!f.question.trim()) problems.push(`La pregunta ${i + 1} está vacía.`);
    if (measure(f.question, "caracteres") > FAQ_QUESTION_LIMIT) problems.push(`La pregunta ${i + 1} tiene más de ${FAQ_QUESTION_LIMIT} caracteres.`);
    lengths("faq", f.answer, i);
  });
  if (!kept.faq && out.faq.length && !out.faq.some((f) => COD.test(`${f.question} ${f.answer}`))) {
    problems.push("Ninguna pregunta frecuente responde sobre el pago contra entrega: agrega una.");
  }

  // Beneficios: una razón de compra por beneficio, y uno del resultado (salvo que ya esté aprobado).
  const kinds = out.blocks.filter((b) => b.key === "benefit").map((b) => b.kind);
  if (kinds.some((k) => !k)) problems.push("Cada benefit necesita su kind (la razón de compra).");
  const repeated = [...new Set(kinds.filter((k, i) => k && kinds.indexOf(k) !== i))];
  if (repeated.length) problems.push(`Hay beneficios con la misma razón de compra (${repeated.join(", ")}): cada uno tiene que dar una razón distinta; si no hay tantas, escribe menos.`);
  if (kinds.length && !kept.benefit && !kinds.includes("result")) problems.push("Ningún beneficio habla del resultado que busca el comprador (kind result).");

  const texts = [...out.blocks.map((b) => b.text), ...out.faq.flatMap((f) => [f.question, f.answer])];
  const internal = texts.find((t) => INTERNAL.test(t));
  if (internal) problems.push(`Un texto usa una palabra interna («${internal.match(INTERNAL)![0]}»): escribe para el comprador, sin nombrar la ficha, los ángulos ni el precio y oferta.`);
  const wrong = new Set<number>();
  for (const t of texts) for (const n of amountsIn(t, facts.currency)) if (!facts.amounts.some((a) => Math.abs(a - n) <= 1)) wrong.add(n);
  if (wrong.size) problems.push(`Estos montos no están en PRECIO Y OFERTA: ${[...wrong].join(", ")}. Usa solo esos números.`);
  for (const re of FORBIDDEN) {
    const hit = texts.find((t) => re.test(t));
    if (hit) problems.push(`Hay una promesa prohibida («${hit.match(re)![0]}»): usa «ayuda a» o «diseñado para».`);
  }
  return problems;
}
