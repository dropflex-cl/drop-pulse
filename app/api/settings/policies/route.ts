import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";
import { cleanWhatsapp, EMPTY_POLICIES, type StorePolicies } from "@/lib/settings/policies";
import { saveStorePolicies } from "@/lib/settings/policies-store";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Envíos y políticas de la tienda: lo que los componentes de la página muestran como hechos. */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = await json<Partial<Record<keyof StorePolicies, unknown>>>(req);
    const policies: StorePolicies = {
      freeShipping: body.freeShipping !== false,
      freeShippingThreshold: num(body.freeShippingThreshold),
      returnDays: num(body.returnDays),
      warrantyMonths: num(body.warrantyMonths),
      whatsapp: typeof body.whatsapp === "string" ? cleanWhatsapp(body.whatsapp) : EMPTY_POLICIES.whatsapp,
      handlingDays: num(body.handlingDays),
      transitDaysMin: num(body.transitDaysMin),
      transitDaysMax: num(body.transitDaysMax),
      cutoffHour: num(body.cutoffHour),
      businessDaysOnly: body.businessDaysOnly !== false,
      saturdayDelivery: body.saturdayDelivery === true,
    };
    return NextResponse.json({ policies: await saveStorePolicies(user.id, policies) });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar envíos y políticas. Intenta de nuevo.");
  }
}
