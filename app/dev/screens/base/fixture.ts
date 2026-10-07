// Datos de ejemplo para /dev/screens/base (textos e imágenes de design-system/reference/bundle.js:
// PP_TEXT, ppRefs). No se usan fuera de desarrollo.
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import { buildPricingPlan } from "@/lib/pricing/plan";
import type { ProductData } from "@/lib/products/product-data";
import type { ProductBase, SavedPricingDto } from "@/lib/types";

export const PP_TEXT =
  "Corrector Postura Espalda Ajustable Unisex. Material: neopreno + velcro. Talla única, ajustable hasta 110 cm de pecho. Ayuda a mantener la espalda recta y reduce la tensión en hombros. Se usa debajo de la ropa. Clientes preguntan si sirve para trabajar sentado 8 horas: sí, recomendado 2 a 3 horas al día al inicio.";

/** Lo que identifica la IA en Información base (Datos del producto). */
export const PRODUCT_DATA: ProductData = {
  name: "Corrector de postura ajustable",
  description: [
    "- Corrector de postura para la espalda alta, unisex.",
    "- Material: neopreno con cierre de velcro.",
    "- Talla única, ajustable hasta 110 cm de pecho.",
    "- Se usa debajo de la ropa.",
    "- Uso recomendado: 2 a 3 horas al día al inicio.",
    "Falta: cuánto pesa y si trae bolsa o caja.",
  ].join("\n"),
  source: "ai",
  updated_at: "2026-09-24T12:01:00Z",
};

/** ?state=new|identified|edited|strategy (con la estrategia confirmada)|nopricing|ai (sin Anthropic). */
export function fixture(state: string): ProductBase {
  const productData = state === "identified" || state === "strategy" || state === "nopricing" ? PRODUCT_DATA : state === "edited" ? { ...PRODUCT_DATA, source: "merchant" as const } : undefined;
  const priced = state !== "nopricing";
  const hasBrief = state === "strategy";
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    base: { described: Boolean(productData), priced },
    // ?state=ai: sin la clave de Anthropic.
    ai: state !== "ai",
  });
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Corrector de postura",
      image: productImage(1, 1),
      sku: "",
      filter: pos.filter,
      meter: pos.meter,
      reason: pos.reason,
      tone: pos.tone,
      nextStage: pos.nextStage,
      stages: pos.stages,
      summary: pos.summary,
      status: pos.status,
      aiConnected: state !== "ai",
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    baseInfo: PP_TEXT,
    fromShopify: true,
    images: [
      { id: "i1", src: productImage(1, 1), alt: "Imagen 1 de Shopify", source: "shopify", excluded: false, cover: true, base: false },
      { id: "i2", src: productImage(5, 1), alt: "Imagen 2 de Shopify", source: "shopify", excluded: false, cover: false, base: false },
      { id: "i3", src: productImage(0, 1), alt: "Imagen 3 de Shopify, con texto del proveedor", source: "shopify", excluded: true, cover: false, base: false },
    ],
    productData,
    pricing: priced ? PRICING : undefined,
    packLabels: hasBrief
      ? {
          id: "labels-1",
          status: "generado",
          stale: false,
          prices: [
            { units: 1, price: 24990 },
            { units: 2, price: 37990 },
            { units: 3, price: 49990 },
          ],
          createdAt: "2026-09-23T12:00:00.000Z",
          labels: [
            { units: 1, label: "Para probarlo", support: null, badge: null, basis: "other", reason: "La referencia de precio." },
            { units: 2, label: "Uno para ti y otro para tu pareja", support: "$18.995 cada uno", badge: null, basis: "sharing", reason: "La estrategia dice que lo usan parejas que trabajan sentadas." },
            { units: 3, label: "Lleva 3, paga 2", support: "Ahorras $24.980", badge: "Más elegido", basis: "savings", reason: "El pack de 3 cuesta lo mismo que 2 unidades." },
          ],
        }
      : undefined,
    pricingDefaults: { unitCost: 3900, avgShippingCost: 8000, purchaseCostLimit: 4500, confirmationRate: 70, deliveryRate: 70, extraUnitDiscount: 50 },
    hasBrief,
    imageQa: false,
    differentiator: { value: hasBrief ? DIFFERENTIATOR : null, confirmed: false, proposed: hasBrief ? DIFFERENTIATOR : null },
  };
}

const DIFFERENTIATOR = {
  versus: "las fajas y los correctores rígidos",
  claim: "No te sostiene a la fuerza: te avisa cuando te encorvas para que corrijas tú, así no depende de usarlo todo el día.",
  basis: "how_it_works",
};

const PRICING: SavedPricingDto = {
  ...buildPricingPlan({ unitCost: 3900, avgShippingCost: 8000, purchaseCostLimit: 4500, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 34990, extraUnitDiscount: 50 }, "CLP")!,
  updatedAt: "2026-09-24T12:00:00Z",
};
