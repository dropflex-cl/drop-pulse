import { contentVariants, landingSelections, selectVariant, type LandingVariant, type LandingSelection } from "@/lib/copy/variants";
import { isEmptyContent } from "@/lib/copy/page-schema";
import { resolveLandingExperience } from "@/lib/product-intelligence/experience-resolver";
import { componentCapability } from "@/lib/product-intelligence/component-capabilities";
import type { PublishInput, PublishComponent } from "@/lib/shopify/publish/mapping";
import type { Listing } from "@/lib/copy/listing";

export interface EffectivePage {
  listing: Listing;
  components: PublishComponent[];
  experience: string | null;
}

/** La misma resolución que Shopify: hook exacto → ángulo → default. El manifiesto manda en el orden. */
export function effectivePage(input: PublishInput, selection: LandingSelection = {}): EffectivePage {
  const query = new URLSearchParams();
  if (selection.angle_id) query.set("angle", selection.angle_id);
  if (selection.angle_id && selection.hook_id) query.set("hook", selection.hook_id);
  const experience = resolveLandingExperience(input.experienceManifest, query);
  const sections = experience?.sections ?? [];
  const pick = (id: string, content: unknown) => {
    const key = sections.find(s => s.component === id)?.content_variant_key;
    return key ? contentVariants(content).find(v => v.key === key) : selectVariant(content, selection);
  };
  const listing = pick("listing", input.listingVariants ?? input.listing)?.content as Listing | undefined;
  const disabled = new Set(input.disabledConversionComponents ?? []);
  const components = input.components.filter(c => !disabled.has(c.id) && (!experience || sections.some(s => s.component === c.id))).flatMap(c => {
    const variant = pick(c.id, c.content);
    if (!variant || isEmptyContent(variant.content)) return [];
    return [{ ...c, content: variant.content, images: c.variantImages?.find(v => v.key === variant.key)?.images ?? c.images }];
  });
  // El runtime de Shopify coloca primero el cuerpo de la experiencia; lo restante conserva orden.
  const bodyOrder = sections.filter(s => s.placement === "body").map(s => s.component);
  const ordered = [...bodyOrder.flatMap(id => components.filter(c => c.id === id)), ...components.filter(c => !bodyOrder.includes(c.id))];
  return { listing: listing ?? input.listing, components: ordered, experience: experience?.experience_key ?? null };
}

/** Variante exacta que muestra una experiencia; la edición usa esta misma selección. */
export function effectiveVariant(input: PublishInput, id: string, content: unknown, selection: LandingSelection = {}) {
  const query = new URLSearchParams();
  if (selection.angle_id) query.set("angle", selection.angle_id);
  if (selection.hook_id && selection.angle_id) query.set("hook", selection.hook_id);
  const key = resolveLandingExperience(input.experienceManifest, query)?.sections.find(s => s.component === id)?.content_variant_key;
  return (key ? contentVariants(content).find(v => v.key === key) : null) ?? selectVariant(content, selection);
}

export const pagePlacement = (id: string) => componentCapability(id)?.placement ?? "body";

/** Versiones que el comerciante puede ver, incluyendo experiencias con orden propio y textos compartidos. */
export function pageSelections(input: PublishInput): LandingVariant[] {
  const experiences = input.experienceManifest?.experiences ?? [];
  const items: LandingVariant[] = experiences.length ? [
    ...(experiences.some(e => e.is_default) ? [{ key: "default", angle_id: null, hook_id: null, content: {} }] : []),
    ...experiences.filter(e => !e.is_default).map(e => ({ key: e.experience_key, angle_id: e.landing_angle_id, hook_id: e.landing_hook_id, content: {} })),
  ] : landingSelections([input.listingVariants ?? input.listing, ...input.components.map(c => c.content)]);
  return items.map(v => ({ ...v, content: effectivePage(input,v).listing }));
}
