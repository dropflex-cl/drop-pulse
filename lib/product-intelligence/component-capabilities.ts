import { DEFAULT_CONVERSION_SUPPORTS } from "@/lib/shopify/conversion-supports";
import { LISTING_RULES } from "@/lib/copy/listing";
import { CATALOG } from "@/lib/shopify/components/catalog";
import type { PersuasionJob } from "./persuasion-schemas";

export interface ComponentCapability {
  component: string;
  supported_jobs: PersuasionJob[];
  placement: "hero" | "body";
  attention_cost: number;
  visual_strength: number;
  proof_strength: number;
  copy_density: "very_low" | "low" | "medium";
  supports_cta: boolean;
  asset_requirements: string[];
  constraints: string[];
}
const cap = (
  component: string,
  supported_jobs: PersuasionJob[],
  placement: "hero" | "body",
  attention_cost: number,
  visual_strength: number,
  proof_strength: number,
  copy_density: ComponentCapability["copy_density"],
  asset_requirements: string[] = [],
  constraints: string[] = [],
): ComponentCapability => ({
  component,
  supported_jobs,
  placement,
  attention_cost,
  visual_strength,
  proof_strength,
  copy_density,
  asset_requirements,
  constraints,
  supports_cta: ["listing", "offer-summary", "stats-with-image", "faq-and-text", "insta-story"].includes(component),
});

// Capacidades editoriales, no puntajes de conversión. IDs, contratos y mínimos salen del catálogo real.
const CAPABILITIES: readonly ComponentCapability[] = [
  cap(
    "listing",
    ["recognition", "desire_activation", "product_fit", "value", "close"],
    "hero",
    2,
    5,
    1,
    "low",
  ),
  cap(
    "review-stars",
    ["social_proof", "similarity_proof"],
    "hero",
    1,
    2,
    4,
    "very_low",
    [],
    [],
  ),
  cap(
    "benefit-usps",
    ["product_fit", "differentiation", "ease", "risk_reversal"],
    "hero",
    1,
    2,
    1,
    "very_low",
  ),
  cap(
    "inventory",
    ["urgency"],
    "hero",
    1,
    1,
    1,
    "very_low",
    [],
    ["live_inventory_only"],
  ),
  cap(
    "shipping-timeline",
    ["objection_resolution", "risk_reversal", "ease"],
    "hero",
    1,
    3,
    2,
    "very_low",
    [],
    ["real_logistics_only"],
  ),
  cap(
    "benefit-double-box",
    ["risk_reversal", "objection_resolution", "ease", "value"],
    "body",
    2,
    3,
    1,
    "low",
  ),
  cap(
    "gif-strip",
    ["demonstration", "ease", "mechanism", "product_fit"],
    "body",
    2,
    5,
    2,
    "low",
    ["gifs"],
  ),
  cap(
    "review-slider",
    ["social_proof", "similarity_proof", "objection_resolution"],
    "body",
    2,
    3,
    5,
    "low",
    [],
    [],
  ),
  cap(
    "ugc-slider",
    ["recognition", "desire_activation", "demonstration", "mechanism", "ease"],
    "body",
    2,
    5,
    1,
    "very_low",
    ["approved_ugc"],
    [],
  ),
  cap(
    "pain-block",
    ["recognition", "problem_visualization", "reframe", "agitation"],
    "body",
    3,
    2,
    1,
    "medium",
  ),
  cap(
    "stats-with-image",
    ["authority_proof", "social_proof", "differentiation"],
    "body",
    2,
    4,
    4,
    "low",
    ["collage"],
    [],
  ),
  cap(
    "scrolling-benefits",
    ["risk_reversal", "ease", "value"],
    "body",
    1,
    2,
    1,
    "very_low",
  ),
  cap(
    "image-with-benefits",
    ["product_fit", "differentiation", "mechanism", "solution_logic"],
    "body",
    2,
    5,
    2,
    "low",
    ["main"],
  ),
  cap(
    "insta-story",
    ["recognition", "demonstration", "desire_activation"],
    "body",
    2,
    5,
    1,
    "very_low",
    ["stories"],
    [],
  ),
  cap(
    "review-wall",
    ["social_proof", "similarity_proof"],
    "body",
    3,
    4,
    5,
    "medium",
    [],
    [],
  ),
  cap(
    "comparison-table",
    ["reframe", "differentiation", "value", "objection_resolution"],
    "body",
    2,
    4,
    2,
    "low",
    [],
    [],
  ),
  cap(
    "faq-and-text",
    ["objection_resolution", "risk_reversal", "ease"],
    "body",
    3,
    1,
    2,
    "medium",
  ),
  cap(
    "product-includes",
    ["value", "objection_resolution"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap("usage-steps", ["ease", "demonstration"], "body", 2, 4, 3, "low"),
  cap("use-cases", ["product_fit", "recognition"], "body", 2, 4, 3, "low"),
  cap(
    "before-after",
    ["demonstration", "social_proof"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap(
    "results-timeline",
    ["objection_resolution", "ease"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap(
    "customer-stories",
    ["social_proof", "similarity_proof"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap("expert-endorsement", ["authority_proof"], "body", 2, 4, 3, "low"),
  cap(
    "mechanism",
    ["mechanism", "solution_logic", "differentiation"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap(
    "guarantee",
    ["risk_reversal", "objection_resolution"],
    "body",
    2,
    4,
    3,
    "low",
  ),
  cap("offer-summary", ["close", "value"], "body", 2, 4, 3, "low"),
];
export const COMPONENT_CAPABILITIES = [
  "listing",
  ...CATALOG.map((c) => c.id),
].map((id) => CAPABILITIES.find((c) => c.component === id)!);
export function componentCapability(id: string) {
  return COMPONENT_CAPABILITIES.find((c) => c.component === id);
}
export function componentCapabilityCatalog() {
  return COMPONENT_CAPABILITIES.map((capability) => {
    const native = CATALOG.find((c) => c.id === capability.component);
    return {
      ...capability,
      placement: native?.kind === "block" ? "hero" as const : capability.placement,
      constraints: [
        ...capability.constraints,
        ...((DEFAULT_CONVERSION_SUPPORTS as readonly string[]).includes(
          capability.component,
        )
          ? ["enabled_by_default_with_empty_state"]
          : []),
      ],
      name: native?.name ?? "Ficha del producto",
      min_reviews: 0,
      available: true,
      image_slots: native?.imageSlots ?? [],
      rules: native?.rules ?? LISTING_RULES,
      forbidden: native?.forbidden ?? [],
    };
  });
}
