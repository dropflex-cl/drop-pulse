import "server-only";
import { contentVariants } from "@/lib/copy/variants";
import { contextAccess, createContextRepository } from "./repository";
import { PI_SCOPES } from "./policy";
import {
  persuasionReadSchema,
} from "./persuasion-service";
import { validateLandingExperience } from "./persuasion-validation";
import {
  runtimeExperience,
  type ExperienceManifest,
} from "./experience-resolver";
import { strictSchema } from "@/lib/copy/page-schema";
import type { PublishInput } from "@/lib/shopify/publish/mapping";

/** Los registros activos son la fuente de orden y selección. Un error bloquea publicar; no activa una página alternativa. */
export async function prepareExperienceManifest(
  userId: string,
  productId: string,
  input: PublishInput,
  missing: string[] = [],
): Promise<ExperienceManifest | undefined> {
  const repository = createContextRepository();
  const principal = {
    userId,
    actorId: userId,
    actorKind: "merchant" as const,
    scopes: PI_SCOPES,
  };
  const access = contextAccess(principal);
  const state = persuasionReadSchema.parse(
    await repository.loadPersuasion(
      { p_access: access, p_product_id: productId },
      AbortSignal.timeout(10000),
    ),
  );
  const active = state.experiences.filter((e) => e.payload.status === "active");
  if (!active.length) return undefined;
  if (!active.some(e => e.payload.is_default)) missing.push("Elige una página principal en Página del producto para las visitas sin enlace de anuncio.");
  const manifest: ExperienceManifest = { schema_version: "1.0", enabled: true, experiences: active.map(e => runtimeExperience({ ...e, payload: { ...e.payload, sections: e.payload.sections.map(s => ({ ...s, enabled: s.enabled && (s.component === "listing" || input.components.some(c => c.id === s.component)) })) } }, productId)) };
  try {
  for (const record of active) {
    const plan = state.plans.find(p => p.id === record.payload.persuasion_plan_id);
    const effectiveRecord = { ...record, payload: { ...record.payload, sections: record.payload.sections.map(s => ({ ...s, enabled: s.enabled && (s.component === "listing" || input.components.some(c => c.id === s.component)) })) } };
    // El recorrido creativo es procedencia. Publicar solo necesita contenido, archivos y destinos vigentes.
    const context = { rows: state.landing.rows.map(r => ({ ...r, content: r.content ?? r.proposal })), assets: state.assets,
      review_count: state.landing.review_count, review_ids: state.landing.reviews.map(r => r.id) };
    effectiveRecord.payload.sections = effectiveRecord.payload.sections.map(section => {
      const row = context.rows.find(r => r.component === section.component);
      const variant = row ? contentVariants(row.content).find(v => v.key === section.content_variant_key) : null;
      return { ...section, images: variant?.images ?? row?.images ?? [] };
    });
    const issues = validateLandingExperience(effectiveRecord.payload, plan?.payload ?? { sections: [] }, 0, context, true);
    const blocking = issues.find(i => i.severity === "error");
    if (blocking) throw new Error(blocking.message);
    const entries: { component: string; content: unknown }[] = [];
    for (const section of effectiveRecord.payload.sections.filter((s) => s.enabled)) {
      const native =
        section.component === "listing"
          ? (input.listingVariants ?? input.listing)
          : input.components.find((c) => c.id === section.component)?.content;
      const selected = contentVariants(native).find(
        (v) => v.key === section.content_variant_key,
      );
      if (!native || !selected)
        throw new Error(
          "La experiencia referencia contenido que no se publicará. Revisa sus componentes.",
        );
      entries.push({ component: section.component, content: selected.content });
    }
    // Lo guardado ya fue validado. Cambiar precio o política no revalida ni elimina una elección.
    for (const entry of entries) if (!strictSchema(entry.component)?.safeParse(entry.content).success) throw new Error("Corrige el contenido de una sección antes de publicar.");
  }
  } catch (error) {
    missing.push(error instanceof Error ? error.message : "Revisa el contenido de esta página antes de publicar.");
  }
  return manifest;
}
