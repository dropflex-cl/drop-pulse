// Reglas puras, compartidas por el chat y la revisión de sus propuestas en UI.
import type { PackLabel } from "@/lib/pricing/labels-schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { amountAllowed, amountsIn, FORBIDDEN, INTERNAL } from "@/lib/copy/schemas";
import { emptyGraph, usageRestrictions } from "./graph";
import { factRecordSchema, evidenceLinkRecordSchema } from "./schemas";
import { ProductIntelligenceError } from "./errors";
import { chatPackLabelsSchema } from "./pack-labels-schemas";

export function usablePackFacts(records: Record<string, unknown[]>, userId: string, productId: string) {
  const graph = emptyGraph();
  graph.Fact = (records.Fact ?? []).map((f) => ({ userId, productId, value: factRecordSchema.parse(f) }));
  graph.EvidenceLink = (records.EvidenceLink ?? []).map((e) => ({ userId, productId, value: evidenceLinkRecordSchema.parse(e) }));
  const restricted = new Set(usageRestrictions(graph).map((r) => r.fact_id));
  return graph.Fact.map((f) => f.value).filter((f) => !restricted.has(f.id));
}
// Duración explícita: la cantidad y unidad deben estar en un fact aprobado, o su múltiplo por pack.
// No inferir meses a partir de cápsulas, dosis o texto del proveedor.
const durationPattern = /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s*(d[ií]as?|days?|semanas?|weeks?|mes(?:es)?|months?|a[nñ]os?|years?|usos?|uses?)(?![\p{L}])/giu;
const durationUnit = (raw: string) => {
  const unit = raw.toLowerCase();
  if (/^(mes|month)/.test(unit)) return "month";
  if (/^(d[ií]a|day)/.test(unit)) return "day";
  if (/^(semana|week)/.test(unit)) return "week";
  if (/^(a[nñ]o|year)/.test(unit)) return "year";
  return "use";
};
const durations = (text: string) => [...text.matchAll(durationPattern)].map((m) => ({ n: Number(m[1].replace(",", ".")), unit: durationUnit(m[2]) }));
const durationLanguage = /\b(d[ií]as?|days?|semanas?|weeks?|mes(?:es)?|months?|a[nñ]os?|years?|usos?|uses?|duraci[oó]n|rinde|dura)\b/i;

export function validateChatPackLabels(labels: PackLabel[], plan: PricingPlan, factIds: string[], records: Record<string, unknown[]>, userId: string, productId: string) {
  const parsed = chatPackLabelsSchema.safeParse(labels);
  const fail = (message: string) => { throw new ProductIntelligenceError("VALIDATION_ERROR", message, { fields: ["labels"] }); };
  if (!parsed.success) fail("Revisa el formato y los límites de las etiquetas.");
  if (labels.length !== plan.packs.length || plan.packs.some((p) => !labels.some((l) => l.units === p.units))) fail("Cada pack calculado necesita exactamente una etiqueta.");
  const facts = usablePackFacts(records, userId, productId);
  if (factIds.some((id) => !facts.some((f) => f.id === id))) throw new ProductIntelligenceError("INVALID_REFERENCE", "Usa solo hechos aprobados, verificados y sin evidencia contradictoria para la duración.");
  const backed = facts.filter((f) => factIds.includes(f.id)).flatMap((f) => durations(`${f.statement}: ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)} ${f.unit ?? ""}`));
  for (const label of labels) {
    const pack = plan.packs.find((p) => p.units === label.units)!;
    const text = [label.label, label.support, label.badge].filter(Boolean).join(" ");
    if (/[<>]/.test(text) || INTERNAL.test(text) || /\btratamiento\b/i.test(text) || FORBIDDEN.some((r) => r.test(text))) fail("Quita HTML, palabras internas y promesas de salud o resultados.");
    const amounts = [pack.price, pack.perUnitPrice, pack.savings, plan.salePrice - pack.perUnitPrice];
    if (pack.units === 1 && plan.compareAtPrice !== null) amounts.push(plan.compareAtPrice, plan.compareAtPrice - plan.salePrice);
    if (amountsIn(text, plan.currency).some((n) => !amountAllowed(n, amounts.filter((n) => n > 0)))) fail("Los montos de la etiqueta deben corresponder a ese pack y al precio guardado.");
    const percentages = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")));
    if (percentages.some((p) => Math.abs(p - pack.savingsRate * 100) > 1 && !(pack.units === 1 && plan.discountPercent !== null && Math.abs(p - plan.discountPercent) <= 1))) fail("El porcentaje no corresponde al ahorro calculado para ese pack.");
    if (label.basis === "duration" || durationLanguage.test(text)) {
      const claims = durations(text);
      if (!factIds.length || !claims.length || claims.some((claim) => !backed.some((f) => f.unit === claim.unit && (Math.abs(f.n - claim.n) < 1e-9 || Math.abs(f.n * pack.units - claim.n) < 1e-9)))) fail("La duración necesita una cantidad y unidad respaldadas por los hechos seleccionados. Usa otra etiqueta si falta ese dato.");
    }
  }
  // Orden del plan, sin cortar texto ni descartar silenciosamente packs o distintivos.
  return plan.packs.map((p) => labels.find((l) => l.units === p.units)!);
}
