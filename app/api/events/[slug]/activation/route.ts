import { NextResponse } from "next/server";
import { eventRequest } from "@/lib/events/http";
import { removeActivation, saveActivation } from "@/lib/events/store";
import { parseDateInput } from "@/lib/events/view";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

// Activar un evento en la tienda (productId null) o en un producto.
// PUT { productId?, enabled?, intensity?, overrides?, startsOn?, endsOn? } → { ok }. Fechas AAAA-MM-DD
// en la zona de la tienda (null = las del evento). DELETE ?product=<id> quita la del producto (vuelve
// a heredar la de la tienda); sin ?product quita la de la tienda.
interface Body {
  productId: string | null;
  enabled: boolean;
  intensity: string;
  overrides: unknown;
  startsOn: string | null;
  endsOn: string | null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event, timezone } = await eventRequest(slug);
    const body = await json<Body>(req);
    const date = (v: string | null | undefined, edge: "start" | "end", field: string) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const iso = parseDateInput(v, edge, timezone);
      if (!iso) throw new ProductApiError("Elige una fecha válida.", 400, field);
      return iso;
    };
    await saveActivation(userId, event, {
      productId: typeof body.productId === "string" ? body.productId : null,
      enabled: body.enabled,
      intensity: body.intensity,
      overrides: body.overrides,
      startsAt: date(body.startsOn, "start", "startsOn"),
      endsAt: date(body.endsOn, "end", "endsOn"),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el evento. Intenta de nuevo.");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event } = await eventRequest(slug);
    const product = new URL(req.url).searchParams.get("product");
    await removeActivation(userId, event.id, product || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos quitar el evento. Intenta de nuevo.");
  }
}
