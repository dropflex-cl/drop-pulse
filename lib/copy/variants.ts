import { z } from "zod";
import type { ImagePick } from "@/lib/types";

// Una variante es contenido de ejecución, no un hecho ni una estrategia ganadora.
export const LANDING_VARIANT_LIMIT = 12;
export const selectorSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
export const imagePickSchema = z.strictObject({ slot: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), source: z.enum(["reference", "page_image"]), id: z.string().uuid() });
export interface LandingVariant {
  key: string;
  angle_id: string | null;
  hook_id: string | null;
  content: unknown;
  images?: ImagePick[];
}
export interface LandingSelection { angle_id?: string | null; hook_id?: string | null }

export function variantsSchema(content: z.ZodType) {
  return z.array(z.strictObject({ key: selectorSchema, angle_id: selectorSchema.nullable(), hook_id: selectorSchema.nullable(),
    content, images: z.array(imagePickSchema).max(30).optional() })).min(1).max(LANDING_VARIANT_LIMIT).superRefine((items, ctx) => {
    const keys = new Set<string>(), selectors = new Set<string>();
    for (const [i, v] of items.entries()) {
      const selector = JSON.stringify([v.angle_id, v.hook_id]);
      if (keys.has(v.key) || selectors.has(selector)) ctx.addIssue({ code: "custom", path: [i], message: "No repitas claves ni combinaciones de ángulo y hook." });
      keys.add(v.key); selectors.add(selector);
      if (v.hook_id && !v.angle_id) ctx.addIssue({ code: "custom", path: [i, "hook_id"], message: "Un hook requiere un ángulo." });
      if ((v.key === "default") !== (v.angle_id === null && v.hook_id === null)) ctx.addIssue({ code: "custom", path: [i, "key"], message: "La variante default no lleva ángulo ni hook." });
      if (v.images && new Set(v.images.map((p) => `${p.slot}:${p.source}:${p.id}`)).size !== v.images.length) ctx.addIssue({ code: "custom", path: [i, "images"], message: "No repitas imágenes en un espacio." });
    }
    if (!keys.has("default")) ctx.addIssue({ code: "custom", message: "Incluye una variante default para visitas sin parámetros." });
  });
}

export function storedContentSchema(content: z.ZodType) { return z.union([content, variantsSchema(content)]); }
export function isVariants(value: unknown): value is LandingVariant[] { return Array.isArray(value); }
export function contentVariants(value: unknown): LandingVariant[] {
  return isVariants(value) ? value : [{ key: "default", angle_id: null, hook_id: null, content: value }];
}
export function selectVariant(value: unknown, selection: LandingSelection = {}): LandingVariant {
  const items = contentVariants(value), angle = selection.angle_id, hook = selection.hook_id;
  return (angle && hook ? items.find((v) => v.angle_id === angle && v.hook_id === hook) : undefined)
    ?? (angle ? items.find((v) => v.angle_id === angle && v.hook_id === null) : undefined)
    ?? items.find((v) => v.key === "default") ?? { key: "default", angle_id: null, hook_id: null, content: {} };
}
export function landingSelections(contents: unknown[]): LandingVariant[] {
  const found = new Map<string, LandingVariant>();
  for (const value of contents) for (const v of contentVariants(value)) found.set(JSON.stringify([v.angle_id, v.hook_id]), v);
  return [...found.values()].sort((a, b) => Number(b.key === "default") - Number(a.key === "default"));
}
export function variantLabel(v: LandingVariant): string { return v.key === "default" ? "Sin parámetros" : `${v.key} · ${v.hook_id ? "Ángulo y hook" : "Ángulo"}`; }
export function landingQuery(v: LandingSelection): string {
  const params = new URLSearchParams();
  if (v.angle_id) params.set("df_angle", v.angle_id);
  if (v.angle_id && v.hook_id) params.set("df_hook", v.hook_id);
  return params.toString();
}
