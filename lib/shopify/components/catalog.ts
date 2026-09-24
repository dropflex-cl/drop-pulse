// Registro de los componentes de conversión. La app lo usa para saber qué metafields publicar y
// qué pedirle a la IA; el test exige que cada carpeta de lib/shopify/components esté aquí.
// Orden: el de la página (columna del producto de arriba abajo, luego las secciones).

import type { ConversionComponent } from "./define";
import { benefitDoubleBox } from "./benefit-double-box/content";
import { benefitUsps } from "./benefit-usps/content";
import { comparisonTable } from "./comparison-table/content";
import { faqAndText } from "./faq-and-text/content";
import { gifStrip } from "./gif-strip/content";
import { imageWithBenefits } from "./image-with-benefits/content";
import { instaStory } from "./insta-story/content";
import { inventory } from "./inventory/content";
import { reviewSlider } from "./review-slider/content";
import { reviewStars } from "./review-stars/content";
import { scrollingBenefits } from "./scrolling-benefits/content";
import { shippingTimeline } from "./shipping-timeline/content";
import { statsWithImage } from "./stats-with-image/content";
import { ugcSlider } from "./ugc-slider/content";

export const CATALOG: ConversionComponent[] = [
  // Columna del producto
  reviewStars,
  benefitUsps,
  inventory,
  shippingTimeline,
  benefitDoubleBox,
  gifStrip,
  reviewSlider,
  ugcSlider,
  // Secciones de la landing
  statsWithImage,
  scrollingBenefits,
  imageWithBenefits,
  instaStory,
  comparisonTable,
  faqAndText,
];

export const componentById = (id: string) => CATALOG.find((c) => c.id === id);
