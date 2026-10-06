// Tipo histórico y validadores del consejo de uso. Sin redacción automática.

import type { ProductBrief } from "@/lib/ai/schemas";
import { productFactText, unsupportedNumbers } from "@/lib/copy/page-schema";
import { INTERNAL } from "@/lib/copy/schemas";
import { claimProblems } from "@/lib/creatives/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";

/** Largo máximo del consejo conservado. */
export const TIP_MAX = 140;

/** Lo que se guarda en `products.usage_tip`. */
export interface UsageTip {
  text: string;
  source?: "legacy" | "mcp_chat";
  status?: "in_review" | "approved";
  basis: string;
  created_at: string;
  prompt_version: number;
  model: string;
}

/** El texto contra el que se comprueban los números del consejo. */
export const tipFactText = (brief: ProductBrief | null, baseInfo: string) => productFactText(brief, baseInfo);

/** Qué está mal en el consejo. Vacío si se puede guardar. */
export function tipProblems(tip: string, facts: { pricing: PricingPlan; factText: string }): string[] {
  const t = tip.trim();
  if (!t) return ["El consejo viene vacío: escribe uno o devuelve null."];
  const at = `«${t}»`;
  const problems: string[] = [];
  if (t.length > TIP_MAX) problems.push(`${at} pasa de ${TIP_MAX} caracteres.`);
  if (/\n/.test(t)) problems.push(`${at} tiene saltos de línea: es una sola frase.`);
  if (/[*_~`]/.test(t)) problems.push(`${at} trae formato (*, _, ~): va en texto plano.`);
  if (/\p{Extended_Pictographic}/u.test(t)) problems.push(`${at} trae emojis: el mensaje ya lleva uno.`);
  if (/^un consejo\b/i.test(t)) problems.push(`${at} repite «Un consejo»: el mensaje ya lo dice.`);
  if (INTERNAL.test(t)) problems.push(`${at} usa palabras internas (la ficha, precio y oferta, cliente ideal).`);
  problems.push(...claimProblems(t, facts.pricing));
  const numbers = unsupportedNumbers(t, facts.factText);
  if (numbers.length) problems.push(`${at} usa números que no están en la ficha ni en la información (${numbers.join(", ")}).`);
  return problems;
}
