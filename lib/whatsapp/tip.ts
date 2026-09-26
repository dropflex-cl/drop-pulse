// El consejo de uso del mensaje «Entregado» (lib/whatsapp/messages.ts › TIP_MESSAGE): una llamada
// chica a Claude (paso `usage_tip`) que parte de la ficha del producto. Prompt, esquema y reglas en
// código. Puro: lo usan lib/pipeline/whatsapp-tip.ts y los tests.

import * as z from "zod/v4";
import { promptLimit } from "@/lib/ai/limits";
import { marketBlock } from "@/lib/ai/prompts";
import type { ProductBrief } from "@/lib/ai/schemas";
import { productFactText, unsupportedNumbers } from "@/lib/copy/page-schema";
import { INTERNAL } from "@/lib/copy/schemas";
import { claimProblems } from "@/lib/creatives/schemas";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";

/** Bump cuando cambie el prompt o el esquema. */
export const USAGE_TIP_PROMPT_VERSION = 1;

/** Largo máximo del consejo (lo que valida el código; el prompt pide un 10 % menos). */
export const TIP_MAX = 140;

export const tipOutputSchema = z.object({
  tip: z
    .string()
    .nullable()
    .describe(`El consejo, en una sola frase de hasta ${promptLimit(TIP_MAX)} caracteres. null si la ficha no dice cómo se usa ni cómo se cuida.`),
  basis: z.string().describe("De qué dato de la ficha sale, en pocas palabras («modo de uso», «qué incluye: cable USB»)."),
});
export type TipOutput = z.infer<typeof tipOutputSchema>;

/** Lo que se guarda en `products.usage_tip`. */
export interface UsageTip {
  text: string;
  basis: string;
  created_at: string;
  prompt_version: number;
  model: string;
}

export function usageTipSystem(market: Market): string {
  return [
    "Atiendes por WhatsApp a los clientes de una tienda de dropshipping. Cuando un pedido llega, le mandas al cliente un consejo de uso para que el producto le funcione bien desde el primer día (y no lo devuelva).",
    "",
    marketBlock(market),
    "",
    "REGLAS DEL CONSEJO",
    `- Uno solo, en una frase de hasta ${promptLimit(TIP_MAX)} caracteres, en tuteo y con un verbo al principio («Úsalo…», «Cárgalo…», «Guárdalo…»).`,
    "- Sale de la FICHA DEL PRODUCTO (modo de uso, datos duros, cómo funciona) o de la INFORMACIÓN DEL COMERCIANTE. Es práctico y concreto: cómo usarlo, cuidarlo o sacarle más provecho. Nunca un beneficio ni una frase de venta.",
    "- No inventes: ningún tiempo, cantidad, temperatura, paso ni accesorio que no esté en la ficha o en la información. Si no dicen cómo se usa ni cómo se cuida, tip es null.",
    "- Nada de promesas de salud ni de resultados («cura», «elimina», «garantizado»), montos, emojis ni formato (*, _, ~).",
    "- Va después de «Un consejo para sacarle el máximo:»: no lo repitas ni nombres «la ficha».",
  ].join("\n");
}

/** Lo fijo del mensaje (va con punto de caché: un reintento lo lee). */
export function usageTipContext(brief: ProductBrief, baseInfo: string): string {
  const ficha = {
    product_name: brief.product_name,
    category: brief.category,
    what_it_does: brief.what_it_does,
    how_it_works: brief.how_it_works,
    key_facts: brief.key_facts,
    forbidden_claims: brief.forbidden_claims,
  };
  return ["FICHA DEL PRODUCTO", JSON.stringify(ficha, null, 2), "", "INFORMACIÓN DEL COMERCIANTE", baseInfo.trim().slice(0, 6000) || "(vacía)"].join("\n");
}

/** Lo que cambia en cada intento: el consejo que no se repite y los problemas del anterior. */
export function usageTipTail(previous: string | null, problems: string[] = []): string {
  return [
    ...(previous ? [`El comerciante pidió otro consejo. No repitas este: «${previous}».`, ""] : []),
    ...(problems.length ? ["Tu consejo anterior no cumplía estas reglas. Corrígelo:", ...problems.map((p) => `- ${p}`), ""] : []),
    "Escribe el consejo de uso.",
  ].join("\n");
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
