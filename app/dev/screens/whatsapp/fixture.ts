// Datos de ejemplo de la etapa WhatsApp (/dev/screens/whatsapp).
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { Product, ProductMessages } from "@/lib/types";

const NOW = "2026-09-26T10:00:00Z";

/** `full`: Ajustes completos, packs y consejo de uso. `bare`: sin políticas, sin packs y sin ficha para el consejo. */
export function fixture(state: string): ProductMessages {
  const pos = productPosition({ price: 24990, currency: "CLP", avatar: { status: "aprobado", createdAt: NOW } });
  const product: Product = {
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
    anglesPhase: pos.anglesPhase,
    copyPhase: pos.copyPhase,
    supplierCost: 6900,
    price: 24990,
    currency: "CLP",
  };
  if (state === "bare") {
    return {
      product,
      facts: { store: null, product: "Corrector de postura", currency: "CLP", packs: [{ units: 1, price: 24990 }], delivery: null, returnDays: null, warrantyMonths: null, countryCode: "CL", tip: null },
      tip: null,
      tipBlocked: "Optimiza con IA primero: el consejo sale de la ficha del producto.",
    };
  }
  const tip = { text: "Úsalo sobre una polera y empieza con 20 minutos el primer día.", basis: "modo de uso", createdAt: NOW };
  return {
    product,
    facts: {
      store: "Tu Tienda",
      product: "Corrector de postura",
      currency: "CLP",
      packs: [
        { units: 1, price: 24990 },
        { units: 2, price: 37490 },
        { units: 3, price: 49990 },
      ],
      delivery: { min: 2, max: 4, businessDays: true },
      returnDays: 30,
      warrantyMonths: 6,
      countryCode: "CL",
      tip: state === "no-tip" ? null : tip.text,
    },
    tip: state === "no-tip" ? null : tip,
    tipBlocked: null,
  };
}
