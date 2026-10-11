import "server-only";
import { contentVariants } from "@/lib/copy/variants";
import { contextAccess, createContextRepository } from "./repository";
import { PI_SCOPES } from "./policy";
import {
  persuasionReadSchema,
  persuasionValidationContext,
} from "./persuasion-service";
import { validateLandingExperience } from "./persuasion-validation";
import {
  runtimeExperience,
  type ExperienceManifest,
} from "./experience-resolver";
import { validateLandingProposal } from "./landing-service";
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
    const plan = state.plans.find(
      (p) => p.id === record.payload.persuasion_plan_id,
    );
    if (!plan)
      throw new Error("Revisa el plan de la experiencia antes de publicar.");
    // Cada estrategia se recupera bajo lock con contenido/estado actual. No se rellena su snapshot con latest.
    const scoped = persuasionReadSchema.parse(
      await repository.loadPersuasion(
        {
          p_access: access,
          p_product_id: productId,
          p_strategy_id: plan.payload.strategy_id,
        },
        AbortSignal.timeout(10000),
      ),
    );
    if (scoped.planning_stamp !== state.planning_stamp)
      throw new Error(
        "La página cambió mientras preparábamos su publicación. Reintenta.",
      );
    const effectiveRecord = { ...record, payload: { ...record.payload, sections: record.payload.sections.map(s => ({ ...s, enabled: s.enabled && (s.component === "listing" || input.components.some(c => c.id === s.component)) })) } };
    const issues = validateLandingExperience(
      effectiveRecord.payload,
      plan.payload,
      plan.revision,
      persuasionValidationContext(
        scoped,
        principal,
        productId,
        plan.payload.strategy_id,
      ), true,
    );
    // El plan creativo ya se validó al guardar. Publicar comprueba identidad, seguridad y archivos de las secciones en uso.
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
    const landing = await repository.loadLanding({ p_access: access, p_product_id: productId }, AbortSignal.timeout(10000));
    validateLandingProposal(userId, landing, entries, productId);
  }
  } catch (error) {
    missing.push(error instanceof Error ? error.message : "Revisa el contenido de esta página antes de publicar.");
  }
  return manifest;
}
