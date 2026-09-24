// Salida estructurada del generador de estáticos y del QA de piezas (docs/spec-creativos.md §3).
// Una sola definición para el modelo (JSON schema), la validación y los tipos. Claves en inglés;
// textos para el comerciante en español con tuteo; los textos horneados, en el idioma del mercado.

import * as z from "zod/v4";
import { allowedAmounts, amountsIn } from "@/lib/copy/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { CONCEPTS_PER_RUN, FAMILIES, FAMILY_DEFS, TEXT_ROLES } from "./catalog";

/** Bump cuando cambie el prompt o el esquema del generador. */
export const CREATIVES_PROMPT_VERSION = 1;
/** Bump cuando cambie el prompt o el esquema del QA. */
export const QA_PROMPT_VERSION = 1;

/** Largo máximo de un texto horneado: más largo no se lee en el feed (ni lo escribe bien el modelo). */
export const TEXT_LIMIT = 60;
export const MAX_TEXTS = 9;

const bakedText = z.object({
  role: z.enum(TEXT_ROLES),
  text: z.string().describe(`Exactamente como va en la imagen, en el idioma del mercado. ≤ ${TEXT_LIMIT} caracteres.`),
});

const concept = z.object({
  angle: z.enum(["primary", "secondary"]).describe("De qué desarrollo sale."),
  family: z.enum(FAMILIES),
  name: z.string().describe("Nombre corto del concepto para el comerciante («Dentro de cada cápsula»)."),
  why: z.string().describe("Para el comerciante, una frase: qué palanca usa y por qué detiene el scroll de SU cliente."),
  preset_id: z.string().nullable().describe("El id de un preset de la lista PRESETS que calce con la familia, o null para edición directa (familias native y letter)."),
  scene: z
    .string()
    .describe("En inglés, para el modelo de imagen: fondo, composición, props y luz. Sin textos (van en texts), sin personas identificables."),
  texts: z.array(bakedText).describe(`De 1 a ${MAX_TEXTS} textos. Exactamente un headline.`),
});

export const creativeConceptsSchema = z.object({
  concepts: z.array(concept).describe(`${CONCEPTS_PER_RUN} conceptos: 3 del principal, 2 del secundario y 1 de oferta (family offer) para retargeting.`),
  compliance_flags: z.array(z.string()),
});

export type CreativeConceptsOutput = z.infer<typeof creativeConceptsSchema>;
export type ConceptPayload = z.infer<typeof concept>;
export type BakedText = z.infer<typeof bakedText>;

const FORBIDDEN = [/\bcura(n|r)?\b/i, /\btrata(r|n)?\b.*\b(infecci|enfermedad)/i, /\bprevien(e|en)\b.*\binfecci/i, /\belimina(r|n)?\b/i, /\bgarantizad[oa]s?\b/i, /\bcures?\b/i, /\btreats?\b/i];

/** Lo que el comerciante puede cambiar de un concepto antes de generarlo. */
export const conceptEditSchema = z.object({
  texts: z
    .array(z.object({ role: z.enum(TEXT_ROLES), text: z.string().trim().min(1).max(TEXT_LIMIT) }))
    .min(1)
    .max(MAX_TEXTS),
  preset_id: z.string().uuid().nullable().optional(),
});
export type ConceptEdit = z.infer<typeof conceptEditSchema>;

export interface ConceptFacts {
  presetIds: Set<string>;
  pricing: PricingPlan;
}

/** Problemas de los textos de un concepto (del modelo o editados): largos, montos y promesas. */
export function textProblems(texts: BakedText[], pricing: PricingPlan, where = ""): string[] {
  const problems: string[] = [];
  const at = where ? `${where}: ` : "";
  if (texts.filter((t) => t.role === "headline").length !== 1) problems.push(`${at}debe tener exactamente un headline.`);
  if (texts.length > MAX_TEXTS) problems.push(`${at}tiene ${texts.length} textos; el máximo es ${MAX_TEXTS}.`);
  const allowed = allowedAmounts(pricing);
  for (const t of texts) {
    if (!t.text.trim()) problems.push(`${at}hay un texto vacío.`);
    if (t.text.length > TEXT_LIMIT) problems.push(`${at}«${t.text}» pasa de ${TEXT_LIMIT} caracteres.`);
    for (const n of amountsIn(t.text, pricing.currency)) if (!allowed.includes(n)) problems.push(`${at}«${t.text}» trae un monto que no está en PRECIO Y OFERTA.`);
    for (const re of FORBIDDEN) if (re.test(t.text)) problems.push(`${at}«${t.text}» promete un resultado de salud (usa «ayuda a», «apoya»).`);
  }
  return problems;
}

/** Qué está mal en la respuesta del generador. Vacío si se puede guardar. */
export function conceptProblems(out: CreativeConceptsOutput, facts: ConceptFacts): string[] {
  const problems: string[] = [];
  if (out.concepts.length !== CONCEPTS_PER_RUN) problems.push(`Trae ${out.concepts.length} conceptos y deben ser ${CONCEPTS_PER_RUN}.`);
  if (!out.concepts.some((c) => c.family === "offer")) problems.push("Falta el concepto de oferta (family offer) para retargeting.");
  for (const role of ["primary", "secondary"] as const) if (!out.concepts.some((c) => c.angle === role)) problems.push(`Falta al menos un concepto del ángulo ${role}.`);
  out.concepts.forEach((c, i) => {
    const where = `El concepto ${i + 1} («${c.name}»)`;
    if (c.preset_id && !facts.presetIds.has(c.preset_id)) problems.push(`${where} usa un preset_id que no está en PRESETS.`);
    if (!c.preset_id && FAMILY_DEFS[c.family].presetGroups.length) problems.push(`${where} es de una familia con presets: elige uno de PRESETS.`);
    problems.push(...textProblems(c.texts, facts.pricing, where));
  });
  return problems;
}

// ---------------------------------------------------------------- QA de la pieza (§3.3)

export const qaSchema = z.object({
  product_matches: z.boolean().describe("true si el producto es el mismo de la foto de referencia: forma, colores, logo y etiqueta."),
  product_issue: z.string().nullable().describe("Qué cambió del producto, en una frase para el comerciante. null si nada."),
  texts: z
    .array(z.object({ expected: z.string(), status: z.enum(["exact", "typo", "missing"]), found: z.string().nullable() }))
    .describe("Uno por cada texto pedido, en el mismo orden. exact: escrito igual, con tildes y signos."),
  extra_texts: z.array(z.string()).describe("Textos de la imagen que no se pidieron, sin contar la etiqueta impresa del producto."),
  language_ok: z.boolean().describe("false si algún texto pedido quedó traducido a otro idioma."),
});
export type QaOutput = z.infer<typeof qaSchema>;

export interface QaResult extends QaOutput {
  pass: boolean;
  /** Los motivos, en español para la pantalla. */
  issues: string[];
}

export function qaVerdict(out: QaOutput): QaResult {
  const issues: string[] = [];
  if (!out.product_matches) issues.push(out.product_issue?.trim() || "El producto no se ve igual a tu foto.");
  if (!out.language_ok) issues.push("Tradujo algún texto a otro idioma.");
  for (const t of out.texts) {
    if (t.status === "missing") issues.push(`Falta «${t.expected}».`);
    else if (t.status === "typo") issues.push(`«${t.expected}» quedó como «${t.found ?? "?"}».`);
  }
  if (out.extra_texts.length) issues.push(`Agregó ${out.extra_texts.map((t) => `«${t}»`).join(", ")}.`);
  return { ...out, pass: issues.length === 0, issues };
}
