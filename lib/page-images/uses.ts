import { componentName } from "@/lib/copy/page-ui";
import { componentById } from "@/lib/shopify/components/catalog";
import { selectedUse } from "@/lib/product-intelligence/current-content";
import { visualTargetSchema, type VisualTarget, type VisualRecord } from "@/lib/product-intelligence/visual-schemas";

/** El destino guardado, con los mismos nombres y espacios que el editor de la PDP. */
export function imageTargetLabel(target: VisualTarget): string {
  if (target.type === "gallery_shot") {
    if (target.slot === "cover") return "Portada";
    if (target.slot === "gallery") return `Galería · imagen ${target.position}`;
    return "Imagen de beneficio";
  }
  if (target.type === "landing_component" || target.type === "landing_section") {
    const slot = componentById(target.component)?.imageSlots?.find(s => s.key === target.slot);
    return `${componentName(target.component)} · ${slot?.label ?? "Imagen"}${target.type === "landing_component" ? ` · ${target.position}` : ""}`;
  }
  return "";
}

/** Las asignaciones son decisiones explícitas; propuestas y descartes no representan usos. */
export function visualImageUses(records: VisualRecord[]): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  for (const record of records) {
    if (record.kind !== "binding" || !selectedUse(record) || typeof record.payload.asset_id !== "string") continue;
    const result = visualTargetSchema.safeParse(record.payload.target);
    if (!result.success) continue;
    const label = imageTargetLabel(result.data);
    if (!label) continue;
    const labels = uses.get(record.payload.asset_id) ?? [];
    if (!labels.includes(label)) labels.push(label);
    uses.set(record.payload.asset_id, labels);
  }
  return uses;
}
