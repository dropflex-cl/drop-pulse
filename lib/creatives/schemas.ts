// Salida estructurada del generador de estáticos y del QA de piezas (docs/spec-creativos.md §3).
// Una sola definición para el modelo (JSON schema), la validación y los tipos. Claves en inglés;
// textos para el comerciante en español con tuteo; los textos horneados, en el idioma del mercado.

import * as z from "zod/v4";
import { allowedAmounts, amountAllowed, amountsIn } from "@/lib/copy/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { conceptsPerAngle, CONCEPTS_PER_RUN, FAMILIES, FAMILY_DEFS, HEADLINE_MAX_WORDS, ROLE_LIMITS, TEXT_ROLES, maxTexts, type Family } from "./catalog";

/**
 * Bump cuando cambie el prompt o el esquema del generador. 2: dirección de arte (spec §7.4).
 * 4: el esquema y el system dejan de pedir principal/secundario y retargeting (2 o 3 ángulos por igual).
 */
export const CREATIVES_PROMPT_VERSION = 4;
/** Bump cuando cambie el prompt o el esquema del QA. 2: texto inventado sobre el producto y textos que la imagen contradice. */
export const QA_PROMPT_VERSION = 2;

/** Largo máximo de un texto horneado (el del titular); cada rol tiene el suyo en ROLE_LIMITS. */
export const TEXT_LIMIT = Math.max(...Object.values(ROLE_LIMITS));
export const MAX_TEXTS = 7;

const bakedText = z.object({
  role: z.enum(TEXT_ROLES),
  text: z.string().describe(`Exactamente como va en la imagen, en el idioma del mercado. headline ≤ ${ROLE_LIMITS.headline} caracteres; subheadline y table_row ≤ ${ROLE_LIMITS.subheadline}; el resto ≤ ${ROLE_LIMITS.callout}.`),
  placement: z.string().describe("En inglés: dónde va y cómo se ve (posición, cuántas líneas, peso, color y contenedor: pill, card, stamp, handwritten note, table cell)."),
  points_to: z.string().nullable().describe("Solo callouts: la parte VISIBLE del producto a la que llega su línea, en inglés («the grey roller head»). null si no apunta a nada."),
});

const art = z.object({
  palette: z.string().describe("En inglés: 2 a 4 colores con nombre que armonicen con los del producto."),
  typography: z.string().describe("En inglés: el carácter de la tipografía («bold condensed sans caps», «elegant serif», «handwritten marker»)."),
  mood: z.string().describe("En inglés, 3 a 6 palabras."),
});

const concept = z.object({
  angle: z.number().int().describe("El número del ángulo de venta del que sale (1, 2 o 3): cada ángulo va en su propio conjunto de anuncios."),
  family: z.enum(FAMILIES),
  name: z.string().describe("Nombre corto del concepto para el comerciante («Dentro de cada cápsula»)."),
  why: z.string().describe("Para el comerciante, una frase: qué palanca usa y por qué detiene el scroll de SU cliente."),
  look: z.string().describe("Para el comerciante, en su idioma y una frase: cómo se va a ver la pieza (colores, composición, qué aparece)."),
  preset_id: z.string().nullable().describe("El id de un preset de PRESETS del grupo de la familia, o null en las familias sin preset."),
  art,
  scene: z.string().describe("En inglés, 30 a 70 palabras: fondo, superficie, props que APOYAN el mensaje y luz. Sin textos (van en texts), sin personas identificables."),
  layout: z.string().describe("En inglés, 20 a 50 palabras: dónde va el producto, cuánto ocupa y qué zonas quedan para el texto."),
  product_units: z.number().int().min(1).max(3).describe("Unidades del producto en la pieza: 1, salvo la oferta de pack."),
  kit_parts: z.array(z.string()).describe("Qué partes del kit (de kit) aparecen junto al producto, escritas igual; [] si ninguna."),
  texts: z.array(bakedText).describe(`De 1 a ${MAX_TEXTS} textos (5 salvo comparativa y oferta). Exactamente un headline.`),
});

export const creativeConceptsSchema = z.object({
  product_look: z.string().describe("En inglés, hasta 20 palabras: cómo se ve el producto principal en la IMAGEN BASE (tipo, color, material, detalles visibles)."),
  kit: z.array(z.string()).describe("En inglés: todo lo demás que aparece en la IMAGEN BASE (caja, repuestos, cables, accesorios). [] si solo está el producto."),
  concepts: z.array(concept).describe(`${CONCEPTS_PER_RUN} conceptos repartidos por igual entre los ángulos de venta (${conceptsPerAngle(2)} por ángulo con 2, ${conceptsPerAngle(3)} con 3), con familias distintas dentro de un mismo ángulo.`),
  compliance_flags: z.array(z.string()),
});

export type CreativeConceptsOutput = z.infer<typeof creativeConceptsSchema>;
export type ConceptPayload = z.infer<typeof concept>;
export type BakedText = z.infer<typeof bakedText>;
/** Un texto como se guarda: los conceptos de la versión 1 no traen ubicación. */
export type StoredText = Pick<BakedText, "role" | "text"> & Partial<Pick<BakedText, "placement" | "points_to">>;

const FORBIDDEN = [/\bcura(n|r)?\b/i, /\btrata(r|n)?\b.*\b(infecci|enfermedad)/i, /\bprevien(e|en)\b.*\binfecci/i, /\belimina(r|n)?\b/i, /\bgarantizad[oa]s?\b/i, /\bcures?\b/i, /\btreats?\b/i];

/**
 * Lo que el comerciante puede cambiar de un concepto antes de generarlo: las palabras. El rol y la
 * ubicación de cada texto quedan (lib/pipeline/creatives.ts › editConcept los conserva por posición).
 */
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
  /** Los ángulos aprobados (sus slots). Por defecto 1 y 2. */
  slots?: number[];
}

/** Problemas de los textos de un concepto (del modelo o editados): largos, montos y promesas. */
export function textProblems(texts: StoredText[], pricing: PricingPlan, where = "", family?: Family): string[] {
  const problems: string[] = [];
  const at = where ? `${where}: ` : "";
  if (texts.filter((t) => t.role === "headline").length !== 1) problems.push(`${at}debe tener exactamente un headline.`);
  const max = family ? maxTexts(family) : MAX_TEXTS;
  if (texts.length > max) problems.push(`${at}tiene ${texts.length} textos; el máximo es ${max}.`);
  const allowed = allowedAmounts(pricing);
  for (const t of texts) {
    if (!t.text.trim()) problems.push(`${at}hay un texto vacío.`);
    if (t.text.length > ROLE_LIMITS[t.role]) problems.push(`${at}«${t.text}» pasa de ${ROLE_LIMITS[t.role]} caracteres (${t.role}).`);
    if (t.role === "headline" && t.text.trim().split(/\s+/).length > HEADLINE_MAX_WORDS) problems.push(`${at}el titular «${t.text}» pasa de ${HEADLINE_MAX_WORDS} palabras.`);
    for (const n of amountsIn(t.text, pricing.currency)) if (!amountAllowed(n, allowed)) problems.push(`${at}«${t.text}» trae un monto que no está en PRECIO Y OFERTA.`);
    for (const re of FORBIDDEN) if (re.test(t.text)) problems.push(`${at}«${t.text}» promete un resultado de salud (usa «ayuda a», «apoya»).`);
  }
  return problems;
}

/** Qué está mal en la respuesta del generador. Vacío si se puede guardar. */
export function conceptProblems(out: CreativeConceptsOutput, facts: ConceptFacts): string[] {
  const problems: string[] = [];
  if (out.concepts.length !== CONCEPTS_PER_RUN) problems.push(`Trae ${out.concepts.length} conceptos y deben ser ${CONCEPTS_PER_RUN}.`);
  const slots = facts.slots ?? [1, 2];
  for (const c of out.concepts) if (!slots.includes(c.angle)) problems.push(`«${c.name}» dice venir del ángulo ${c.angle}, que no existe: usa ${slots.join(", ")}.`);
  const per = conceptsPerAngle(slots.length);
  for (const slot of slots) {
    const mine = out.concepts.filter((c) => c.angle === slot);
    if (mine.length < per) problems.push(`El ángulo ${slot} necesita ${per} conceptos y trae ${mine.length}.`);
    // Formatos distintos dentro del mismo ángulo: Meta premia la variación y el mercado decide.
    if (new Set(mine.map((c) => c.family)).size < mine.length) problems.push(`Los conceptos del ángulo ${slot} repiten familia: usa formatos distintos.`);
  }
  out.concepts.forEach((c, i) => {
    const where = `El concepto ${i + 1} («${c.name}»)`;
    const direct = !FAMILY_DEFS[c.family].presetGroups.length;
    if (c.preset_id && direct) problems.push(`${where} es de una familia sin preset (${c.family}): preset_id va null.`);
    else if (c.preset_id && !facts.presetIds.has(c.preset_id)) problems.push(`${where} usa un preset_id que no está en PRESETS.`);
    if (!c.preset_id && !direct) problems.push(`${where} es de una familia con presets: elige uno de PRESETS.`);
    problems.push(...textProblems(c.texts, facts.pricing, where, c.family));
    if (c.product_units > 1 && c.family !== "offer") problems.push(`${where}: varias unidades del producto solo en la oferta de pack.`);
    const kit = new Set(out.kit.map((k) => k.trim().toLowerCase()));
    for (const part of c.kit_parts) if (!kit.has(part.trim().toLowerCase())) problems.push(`${where}: «${part}» no está en kit (escríbelo igual que en kit).`);
    for (const t of c.texts) if (t.role !== "callout" && t.points_to) problems.push(`${where}: solo los callouts llevan points_to («${t.text}»).`);
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
  extra_texts: z
    .array(z.string())
    .describe("Textos de la imagen que no se pidieron. Lo impreso en el producto cuenta como extra si NO está en la foto real (un nombre o logo inventado en el cuerpo)."),
  language_ok: z.boolean().describe("false si algún texto pedido quedó traducido a otro idioma."),
  mismatches: z
    .array(z.string())
    .describe("Textos pedidos que la imagen contradice (nombra «parches» y se ven calcetines; «2 rodillos» y se ve uno). En español, una frase cada uno. [] si ninguno."),
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
  issues.push(...out.mismatches.map((m) => m.trim()).filter(Boolean));
  return { ...out, pass: issues.length === 0, issues };
}
