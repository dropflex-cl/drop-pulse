import { z } from "zod";
import { selectorSchema } from "@/lib/copy/variants";
import { componentCapability } from "./component-capabilities";
import { experienceRecordSchema } from "./persuasion-schemas";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).meta({ format: "uuid" });
export const runtimeExperienceSchema = z.strictObject({ id: uuid, product_id: uuid, strategy_id: uuid, angle_id: uuid, persuasion_plan_id: uuid,
  revision: z.number().int().positive().safe(), plan_revision: z.number().int().positive().safe(), landing_angle_id: selectorSchema, landing_hook_id: selectorSchema.nullable(),
  experience_key: selectorSchema, architecture_variant: selectorSchema, is_default: z.boolean(),
  sections: z.array(z.strictObject({ section_key: selectorSchema, component: z.string(), content_variant_key: selectorSchema,
    persuasion_job: z.string(), placement: z.enum(["hero", "body"]) })).min(1).max(9) }).refine(e => {
    let body = false;
    return e.sections[0]?.component === "listing" && new Set(e.sections.map(s => s.component)).size === e.sections.length
      && new Set(e.sections.map(s => s.section_key)).size === e.sections.length && e.sections.every(s => {
        const capability = componentCapability(s.component);
        if (!capability || capability.placement !== s.placement) return false;
        if (s.placement === "body") body = true;
        else if (body) return false;
        return true;
      });
  }, "La arquitectura no coincide con los componentes publicados.");
export const experienceManifestSchema = z.strictObject({ schema_version: z.literal("1.0"), enabled: z.literal(true), experiences: z.array(runtimeExperienceSchema).max(20) })
  .refine(m => m.experiences.filter(e => e.is_default).length <= 1
    && new Set(m.experiences.map(e => `${e.landing_angle_id}:${e.landing_hook_id ?? ""}`)).size === m.experiences.length,
  "El manifiesto contiene rutas ambiguas.");
export type ExperienceManifest = z.infer<typeof experienceManifestSchema>;
export type RuntimeExperience = z.infer<typeof runtimeExperienceSchema>;
export function runtimeExperience(record: z.infer<typeof experienceRecordSchema>, productId: string): RuntimeExperience {
  const p = record.payload;
  return runtimeExperienceSchema.parse({ id: record.id, product_id: productId, strategy_id: p.strategy_id, angle_id: p.angle_id,
    persuasion_plan_id: p.persuasion_plan_id, revision: record.revision, plan_revision: p.plan_revision, landing_angle_id: p.landing_angle_id, landing_hook_id: p.landing_hook_id,
    experience_key: p.experience_key, architecture_variant: p.architecture_variant, is_default: p.is_default,
    sections: p.sections.filter(s => s.enabled).map(s => ({ section_key: s.section_key, component: s.component, content_variant_key: s.content_variant_key,
      persuasion_job: s.persuasion_job, placement: componentCapability(s.component)?.placement ?? "body" })) });
}
/** Alias nuevos y enlaces históricos. Duplicados/conflictos son inválidos, nunca se interpretan como HTML. */
export function experienceQuery(params: URLSearchParams): { angle: string | null; hook: string | null } {
  const read = (a: string, b: string) => {
    const x = params.getAll(a), y = params.getAll(b);
    if (x.length > 1 || y.length > 1 || (x.length && y.length && x[0] !== y[0])) return null;
    const value = x[0] ?? y[0]; return selectorSchema.safeParse(value).success ? value : null;
  };
  const angle = read("angle", "df_angle");
  return { angle, hook: angle ? read("hook", "df_hook") : null };
}
export function resolveLandingExperience(raw: unknown, params: URLSearchParams): RuntimeExperience | null {
  const parsed = experienceManifestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { angle, hook } = experienceQuery(params), items = parsed.data.experiences;
  return (angle && hook ? items.find(e => e.landing_angle_id === angle && e.landing_hook_id === hook) : undefined)
    ?? (angle ? items.find(e => e.landing_angle_id === angle && e.landing_hook_id === null) : undefined)
    ?? items.find(e => e.is_default) ?? null;
}
