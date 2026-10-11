// Reglas puras, compartidas por el chat y la revisión de sus propuestas en UI.
import type { PackLabel } from "@/lib/pricing/labels-schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { amountAllowed, amountsIn, INTERNAL } from "@/lib/copy/schemas";
import { emptyGraph } from "./graph";
import { factRecordSchema, evidenceLinkRecordSchema } from "./schemas";
import { ProductIntelligenceError } from "./errors";
import { chatPackLabelsSchema } from "./pack-labels-schemas";

export function usablePackFacts(records: Record<string, unknown[]>, userId: string, productId: string) {
  const graph = emptyGraph();
  graph.Fact = (records.Fact ?? []).map((f) => ({ userId, productId, value: factRecordSchema.parse(f) }));
  graph.EvidenceLink = (records.EvidenceLink ?? []).map((e) => ({ userId, productId, value: evidenceLinkRecordSchema.parse(e) }));
  return graph.Fact.map((f) => f.value);
}
export function validateChatPackLabels(labels: PackLabel[], plan: PricingPlan, factIds: string[], records: Record<string, unknown[]>, userId: string, productId: string) {
  const parsed = chatPackLabelsSchema.safeParse(labels);
  const fail = (message: string) => { throw new ProductIntelligenceError("VALIDATION_ERROR", message, { fields: ["labels"] }); };
  if (!parsed.success) fail("Revisa el formato y los límites de las etiquetas.");
  if (labels.length !== plan.packs.length || plan.packs.some((p) => !labels.some((l) => l.units === p.units))) fail("Cada pack calculado necesita exactamente una etiqueta.");
  const facts = usablePackFacts(records, userId, productId);
  if (factIds.some((id) => !facts.some((f) => f.id === id))) throw new ProductIntelligenceError("INVALID_REFERENCE", "La referencia no pertenece a este producto.");
  for (const label of labels) {
    const pack = plan.packs.find((p) => p.units === label.units)!;
    const text = [label.label, label.support, label.badge].filter(Boolean).join(" ");
    if (/[<>]/.test(text) || INTERNAL.test(text)) fail("Quita HTML y palabras internas.");
    const amounts = [pack.price, pack.perUnitPrice, pack.savings, plan.salePrice - pack.perUnitPrice];
    if (pack.units === 1 && plan.compareAtPrice !== null) amounts.push(plan.compareAtPrice, plan.compareAtPrice - plan.salePrice);
    if (amountsIn(text, plan.currency).some((n) => !amountAllowed(n, amounts.filter((n) => n > 0)))) fail("Los montos de la etiqueta deben corresponder a ese pack y al precio guardado.");
    const percentages = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")));
    if (percentages.some((p) => Math.abs(p - pack.savingsRate * 100) > 1 && !(pack.units === 1 && plan.discountPercent !== null && Math.abs(p - plan.discountPercent) <= 1))) fail("El porcentaje no corresponde al ahorro calculado para ese pack.");
  }
  // Orden del plan, sin cortar texto ni descartar silenciosamente packs o distintivos.
  return plan.packs.map((p) => labels.find((l) => l.units === p.units)!);
}
