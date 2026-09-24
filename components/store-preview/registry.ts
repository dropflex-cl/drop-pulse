import type { ComponentType } from "react";
import { BenefitDoubleBoxPreview } from "./benefit-double-box";
import { BenefitUspsPreview } from "./benefit-usps";
import { ComparisonTablePreview } from "./comparison-table";
import { FaqAndTextPreview } from "./faq-and-text";
import { ImageWithBenefitsPreview } from "./image-with-benefits";
import { InstaStoryPreview } from "./insta-story";
import { InventoryPreview } from "./inventory";
import { ListingPreview } from "./listing";
import { ReviewSliderPreview } from "./review-slider";
import { ReviewStarsPreview } from "./review-stars";
import { ScrollingBenefitsPreview } from "./scrolling-benefits";
import { ShippingTimelinePreview } from "./shipping-timeline";
import { StatsWithImagePreview } from "./stats-with-image";
import type { PreviewProps } from "./types";
import { UgcSliderPreview } from "./ugc-slider";

// Id del catálogo (lib/shopify/components/catalog.ts) o "listing" → su vista previa. El test exige
// que cada componente del catálogo tenga la suya.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PREVIEWS: Record<string, ComponentType<PreviewProps<any>>> = {
  listing: ListingPreview,
  "review-stars": ReviewStarsPreview,
  "benefit-usps": BenefitUspsPreview,
  inventory: InventoryPreview,
  "shipping-timeline": ShippingTimelinePreview,
  "benefit-double-box": BenefitDoubleBoxPreview,
  "review-slider": ReviewSliderPreview,
  "ugc-slider": UgcSliderPreview,
  "stats-with-image": StatsWithImagePreview,
  "scrolling-benefits": ScrollingBenefitsPreview,
  "image-with-benefits": ImageWithBenefitsPreview,
  "insta-story": InstaStoryPreview,
  "comparison-table": ComparisonTablePreview,
  "faq-and-text": FaqAndTextPreview,
};
