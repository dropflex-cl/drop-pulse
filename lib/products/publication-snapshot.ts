import { createHash } from "node:crypto";
import type { PublishInput } from "@/lib/shopify/publish/mapping";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const LABELS: Record<string, string> = { text: "Textos y secciones", images: "Imágenes", offer: "Precio y packs", accent: "Color", experiences: "Variantes y orden", policies: "Envíos y políticas" };
/** Resúmenes auditables, sin copias paralelas de contenido ni URLs temporales. */
export function publicationSnapshot(input: PublishInput): Record<string, string> {
  return {
    text: digest([input.listingVariants ?? input.listing, input.components.map(c => [c.id, c.content]), input.reviews, input.disabledConversionComponents]),
    images: digest([input.gallery, input.components.map(c => [c.id, c.images, c.variantImages])]),
    offer: digest(input.packs),
    accent: digest(input.accent),
    experiences: digest(input.experienceManifest?.experiences.map(e => ({ selector: [e.landing_angle_id, e.landing_hook_id], is_default: e.is_default, sections: e.sections.map(s => [s.component, s.content_variant_key, s.placement]) })) ?? null),
    policies: digest(input.shopFacts ?? null),
  };
}
export function publicationChanges(input: PublishInput, previous?: Record<string, string>): string[] {
  if (!previous) return ["Contenido guardado"];
  return Object.entries(publicationSnapshot(input)).filter(([key, value]) => previous[key] !== value).map(([key]) => LABELS[key]);
}
