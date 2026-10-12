import { describe, expect, it } from "vitest";
import { imageTargetLabel, visualImageUses } from "./uses";
import type { VisualRecord } from "@/lib/product-intelligence/visual-schemas";

const target = { type: "landing_component", component: "insta-story", content_variant_key: "default", slot: "stories", position: 2 } as const;
const binding = (payload: Record<string, unknown>, status = "selected") => ({ id: "binding-id", version: 1, etag: "0".repeat(64), created_at: "2026-10-12", updated_at: "2026-10-12", kind: "binding", status, payload: { asset_id: "asset-a", target, ...payload } }) satisfies VisualRecord;

describe("usos visibles de imágenes", () => {
  it("muestra el componente, espacio y posición ya elegidos sin volver a asignar", () => {
    expect(visualImageUses([binding({ selected: true })]).get("asset-a")).toEqual(["Historias · Historias · 2"]);
    expect(imageTargetLabel({ ...target, component: "mechanism", slot: "main", position: 1 })).toBe("Mecanismo · Detalle del mecanismo · 1");
  });
  it("conserva usos múltiples y excluye propuestas, selecciones quitadas y descartes", () => {
    const records = [binding({}), binding({}), binding({ target: { ...target, position: 3 } }),
      binding({ selected: false }), binding({ asset_id: "discarded", selected: true }, "rejected"),
      binding({ asset_id: "archived", selected: true, archived_at: "2026-10-12" }),
      binding({ asset_id: "proposal" }, "proposed"), binding({ asset_id: "invalid", target: {} })];
    expect([...visualImageUses(records)]).toEqual([["asset-a", ["Historias · Historias · 2", "Historias · Historias · 3"]]]);
  });
  it("admite los destinos nativos de componente además de los de experiencia", () => {
    expect(imageTargetLabel({ type: "landing_section", experience_id: "00000000-0000-4000-8000-000000000001", section_key: "mechanism", content_variant_key: "default", component: "mechanism", slot: "main" })).toBe("Mecanismo · Detalle del mecanismo");
    expect(imageTargetLabel({ type: "gallery_shot", shot_key: "cover", slot: "cover", position: 1 })).toBe("Portada");
  });
});
