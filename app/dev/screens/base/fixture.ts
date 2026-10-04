// Datos de ejemplo para /dev/screens/base (textos e imágenes de design-system/reference/bundle.js:
// PP_TEXT, ppRefs). No se usan fuera de desarrollo.
import type { CustomerAvatar } from "@/lib/ai/schemas";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { AvatarProposal, OptimizationRun, ProductBase } from "@/lib/types";

export const PP_TEXT =
  "Corrector Postura Espalda Ajustable Unisex. Material: neopreno + velcro. Talla única, ajustable hasta 110 cm de pecho. Ayuda a mantener la espalda recta y reduce la tensión en hombros. Se usa debajo de la ropa. Clientes preguntan si sirve para trabajar sentado 8 horas: sí, recomendado 2 a 3 horas al día al inicio.";

export const AVATAR: CustomerAvatar = {
  summary: "Oficinistas de 30 a 45 que pasan el día sentados frente al computador y se lo compran para sí mismos.",
  buyer: "Quien trabaja 8 horas o más sentado, de 30 a 45 años; lo compra para sí, desde el teléfono, después de un anuncio.",
  user: "",
  age_range: "30-45",
  why_buy: "Quiere terminar el día sin dolor de espalda alta sin sumar rutinas ni pagar sesiones de kinesiología.",
  doubts: ["Cree que estos correctores son incómodos y terminan en un cajón.", "¿Se nota debajo de la camisa?", "Desconfía de las tiendas de Instagram que no conoce."],
  cash_on_delivery: "Pagar cuando le llega le quita el miedo a que no llegue.",
  more_than_one: "Uno para la casa y otro para la oficina, o uno para su pareja que también trabaja sentada.",
};

export function fixture(state: string): ProductBase {
  const now = "2026-09-24T12:00:00Z";
  const run: OptimizationRun | undefined =
    state === "optimizing"
      ? { id: "r1", status: "running", step: "customer_avatar", createdAt: now, startedAt: now }
      : state === "failed"
        ? { id: "r1", status: "failed", step: "product_brief", error: "La IA no respondió. Intenta de nuevo en un momento.", createdAt: now }
        : state === "review" || state === "approved"
          ? { id: "r1", status: "succeeded", step: "customer_avatar", createdAt: now }
          : undefined;
  const avatar: AvatarProposal | undefined =
    state === "review" || state === "approved"
      ? { id: "a1", status: state === "approved" ? "aprobado" : "generado", avatar: AVATAR, createdAt: "2026-09-24T12:01:00Z" }
      : undefined;
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    run: run ? { status: run.status, error: run.error, createdAt: run.createdAt } : null,
    avatar: avatar ? { status: avatar.status, createdAt: avatar.createdAt } : null,
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
    run,
    packLabels: {
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
        { units: 2, label: "Uno para ti y otro para tu pareja", support: "$18.995 cada uno", badge: null, basis: "sharing", reason: "La ficha dice que lo usan parejas que trabajan sentadas." },
        { units: 3, label: "Lleva 3, paga 2", support: "Ahorras $24.980", badge: "Más elegido", basis: "savings", reason: "El pack de 3 cuesta lo mismo que 2 unidades." },
      ],
    },
    pricingDefaults: { unitCost: 3900, avgShippingCost: 8000, purchaseCostLimit: 4500, confirmationRate: 70, deliveryRate: 70, extraUnitDiscount: 50 },
    avatar,
    missingInputs:
      state === "review"
        ? [
            { field: "proof.guarantee_days", question: "¿Das garantía? ¿De cuántos días?" },
            { field: "proof.real_reviews", question: "¿Tienes reseñas de clientes que puedas pegar tal cual?" },
          ]
        : [],
    hasBrief: Boolean(avatar),
    imageQa: false,
    differentiator: {
      value: state === "approved" ? DIFFERENTIATOR : avatar ? DIFFERENTIATOR : null,
      confirmed: state === "approved",
      proposed: avatar ? DIFFERENTIATOR : null,
    },
    competitors: avatar
      ? [
          {
            id: "c1",
            url: "https://posturafit.cl/products/corrector",
            host: "posturafit.cl",
            status: "succeeded",
            createdAt: now,
            analysis: {
              storeName: "PosturaFit",
              price: 29990,
              compareAt: 49990,
              painOrDesire: "Dolor de espalda después de un día sentado",
              promise: "Espalda recta en 7 días",
              frame: "common_enemy",
              frameName: "Enemigo común",
            },
          },
          { id: "c2", url: "https://tiendaespalda.com/p/corrector", host: "tiendaespalda.com", status: "running", createdAt: now },
          {
            id: "c3",
            url: "https://ofertasdeldia.cl/corrector",
            host: "ofertasdeldia.cl",
            status: "failed",
            createdAt: now,
            error: "No pudimos leer esa página: la tienda no nos dejó entrar o la página ya no existe. Ábrela en tu navegador para revisarla.",
          },
        ]
      : [],
  };
}

const DIFFERENTIATOR = {
  versus: "las fajas y los correctores rígidos",
  claim: "No te sostiene a la fuerza: te avisa cuando te encorvas para que corrijas tú, así no depende de usarlo todo el día.",
  basis: "how_it_works",
};
