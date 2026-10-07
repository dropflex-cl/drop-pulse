import { adminClient } from "@/lib/integrations/admin";
import "server-only";
import { contentVariants } from "@/lib/copy/variants";
import { contextAccess, createContextRepository } from "./repository";
import { PI_SCOPES } from "./policy";
import { persuasionEnabled } from "./persuasion-flags";
import { persuasionReadSchema, persuasionValidationContext } from "./persuasion-service";
import { validateLandingExperience } from "./persuasion-validation";
import { runtimeExperience, type ExperienceManifest } from "./experience-resolver";
import { validateLandingProposal } from "./landing-service";
import type { PublishInput } from "@/lib/shopify/publish/mapping";

/** Revalidación de publicación explícita. Fallar excluye el manifiesto entero y conserva legacy. */
export async function prepareExperienceManifest(userId: string, productId: string, input: PublishInput): Promise<ExperienceManifest | undefined> {
  if (!persuasionEnabled()) return undefined;
  const { data: product, error } = await adminClient().from("products").select("pdp_persuasion_enabled").eq("id", productId).eq("user_id", userId).single();
  if (error) throw new Error("No pudimos comprobar la configuración de experiencias.");
  if (!product.pdp_persuasion_enabled) return undefined;
  const repository = createContextRepository();
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const access = contextAccess(principal);
  const state = persuasionReadSchema.parse(await repository.loadPersuasion({ p_access: access, p_product_id: productId }, AbortSignal.timeout(10000)));
  const active = state.experiences.filter(e => e.payload.status === "active");
  if (!state.enabled || !active.length) return undefined;
  for (const record of active) {
    const plan = state.plans.find(p => p.id === record.payload.persuasion_plan_id);
    if (!plan || plan.payload.status !== "approved") throw new Error("Revisa el plan de la experiencia antes de publicar.");
    // Cada estrategia se recupera bajo lock con contenido/estado actual. No se rellena su snapshot con latest.
    const scoped = persuasionReadSchema.parse(await repository.loadPersuasion({ p_access: access, p_product_id: productId, p_strategy_id: plan.payload.strategy_id }, AbortSignal.timeout(10000)));
    if (scoped.planning_stamp !== state.planning_stamp) throw new Error("La página cambió mientras preparábamos su publicación. Reintenta.");
    const issues = validateLandingExperience(record.payload, plan.payload, plan.revision, persuasionValidationContext(scoped, principal, productId, plan.payload.strategy_id));
    const blocking = issues.find(i => i.severity === "error");
    if (blocking) throw new Error(blocking.message);
    for (const section of record.payload.sections.filter(s => s.enabled)) {
      const native = section.component === "listing" ? input.listingVariants ?? input.listing : input.components.find(c => c.id === section.component)?.content;
      const selected = contentVariants(native).find(v => v.key === section.content_variant_key);
      if (!native || !selected) throw new Error("La experiencia referencia contenido que no se publicará. Revisa sus componentes.");
    }
  }
  const landing = await repository.loadLanding({ p_access: access, p_product_id: productId }, AbortSignal.timeout(10000));
  validateLandingProposal(userId, landing, [{ component: "listing", content: input.listingVariants ?? input.listing }, ...input.components.map(c => ({ component: c.id, content: c.content }))], productId);
  return { schema_version: "1.0", enabled: true, experiences: active.map(e => runtimeExperience(e, productId)) };
}
