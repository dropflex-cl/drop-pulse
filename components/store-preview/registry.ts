import { createElement } from "react";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { PdpEmptyPreview } from "./pdp-empty";
import type { ComponentType } from "react";
import { BenefitDoubleBoxPreview } from "./benefit-double-box";
import { BenefitUspsPreview } from "./benefit-usps";
import { ComparisonTablePreview } from "./comparison-table";
import { FaqAndTextPreview } from "./faq-and-text";
import { GifStripPreview } from "./gif-strip";
import { ImageWithBenefitsPreview } from "./image-with-benefits";
import { InstaStoryPreview } from "./insta-story";
import { InventoryPreview } from "./inventory";
import { ListingPreview } from "./listing";
import { PainBlockPreview } from "./pain-block";
import { ReviewSliderPreview } from "./review-slider";
import { ReviewStarsPreview } from "./review-stars";
import { ReviewWallPreview } from "./review-wall";
import { ScrollingBenefitsPreview } from "./scrolling-benefits";
import { ShippingTimelinePreview } from "./shipping-timeline";
import { StatsWithImagePreview } from "./stats-with-image";
import type { PreviewProps } from "./types";
import { UgcSliderPreview } from "./ugc-slider";

import { ProductIncludesPreview } from "./product-includes";
import { UsageStepsPreview } from "./usage-steps";
import { UseCasesPreview } from "./use-cases";
import { BeforeAfterPreview } from "./before-after";
import { ResultsTimelinePreview } from "./results-timeline";
import { CustomerStoriesPreview } from "./customer-stories";
import { ExpertEndorsementPreview } from "./expert-endorsement";
import { MechanismPreview } from "./mechanism";
import { GuaranteePreview } from "./guarantee";
import { OfferSummaryPreview } from "./offer-summary";

// Id del catálogo (lib/shopify/components/catalog.ts) o "listing" → su vista previa. El test exige
// que cada componente del catálogo tenga la suya.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NATIVE_PREVIEWS: Record<string, ComponentType<PreviewProps<any>>> = {
  listing: ListingPreview,
  "product-includes": ProductIncludesPreview,
  "usage-steps": UsageStepsPreview,
  "use-cases": UseCasesPreview,
  "before-after": BeforeAfterPreview,
  "results-timeline": ResultsTimelinePreview,
  "customer-stories": CustomerStoriesPreview,
  "expert-endorsement": ExpertEndorsementPreview,
  mechanism: MechanismPreview,
  guarantee: GuaranteePreview,
  "offer-summary": OfferSummaryPreview,

  "review-stars": ReviewStarsPreview,
  "benefit-usps": BenefitUspsPreview,
  inventory: InventoryPreview,
  "shipping-timeline": ShippingTimelinePreview,
  "benefit-double-box": BenefitDoubleBoxPreview,
  "gif-strip": GifStripPreview,
  "review-slider": ReviewSliderPreview,
  "ugc-slider": UgcSliderPreview,
  "pain-block": PainBlockPreview,
  "stats-with-image": StatsWithImagePreview,
  "scrolling-benefits": ScrollingBenefitsPreview,
  "image-with-benefits": ImageWithBenefitsPreview,
  "insta-story": InstaStoryPreview,
  "review-wall": ReviewWallPreview,
  "comparison-table": ComparisonTablePreview,
  "faq-and-text": FaqAndTextPreview,
};

export const PREVIEWS: typeof NATIVE_PREVIEWS = Object.fromEntries(
  Object.entries(NATIVE_PREVIEWS).map(([id, Preview]) => {
    function PreviewWithEmpty(props: PreviewProps) {
      const content = props.content as Record<string, unknown> | null;
      if (
        id !== "listing" &&
        (!content ||
          (!Object.keys(content).length &&
            !["guarantee", "offer-summary"].includes(id)) ||
          content.state === "empty" ||
          props.facts.count <
            (CATALOG.find((c) => c.id === id)?.minReviews ?? 0))
      )
        return createElement(PdpEmptyPreview, { component: id });
      return createElement(Preview, props);
    }
    return [id, PreviewWithEmpty];
  }),
);
