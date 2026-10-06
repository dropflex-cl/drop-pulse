import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { validatePricingForm, type PricingForm } from "@/lib/pricing/plan";
import { savePricingPlan } from "@/lib/pricing/store";
import { PRICE_CHANGED } from "@/lib/pricing/copy";

const FIELDS: (keyof PricingForm)[] = [
  "unitCost",
  "avgShippingCost",
  "purchaseCostLimit",
  "confirmationRate",
  "deliveryRate",
  "salePrice",
  "compareAtPrice",
  "extraUnitDiscount",
];

/** Guarda “Precio y packs”: el servidor recalcula todo con la calculadora antes de guardar. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, product } = await ownedProduct(id);
    const body = await json<Record<keyof PricingForm, unknown> & { expectedPricingStamp: unknown }>(req);
    const expectedPricingStamp = body.expectedPricingStamp;
    if (expectedPricingStamp !== null && (typeof expectedPricingStamp !== "string" || !/^[0-9a-f]{64}$/.test(expectedPricingStamp))) throw new ProductApiError(PRICE_CHANGED, 409);
    const form = Object.fromEntries(
      FIELDS.map((k) => [k, k === "compareAtPrice" && (body[k] == null || body[k] === "") ? null : Number(body[k])]),
    ) as unknown as PricingForm;
    const errors = validatePricingForm(form);
    const first = Object.entries(errors)[0];
    if (first) throw new ProductApiError(first[1]!, 400, first[0]);
    const pricing = await savePricingPlan(userId, product, form, expectedPricingStamp);
    if (!pricing) throw new ProductApiError("Con estos números no se puede calcular el precio. Revisa los porcentajes.", 400);
    return NextResponse.json({ pricing });
  } catch (e) {
    return errorResponse(e);
  }
}
