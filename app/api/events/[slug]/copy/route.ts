import { NextResponse } from "next/server";
import { parseEditedCopy } from "@/lib/events/copy";
import { eventRequest } from "@/lib/events/http";
import { approveEventCopy, copyOf, discardEventCopy, listEventCopies, startEventCopy } from "@/lib/events/store";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";
import { getProductRow } from "@/lib/products/store";

// Textos del evento de un producto (IA; el comerciante aprueba).
// GET ?product=<id> → { copy } (sondeo mientras se escriben) · POST { productId } → empieza a escribir
// · PUT { productId, copy? } → aprueba (copy = la versión editada; sin copy, la propuesta)
// · DELETE ?product=<id> → descarta (vuelven los textos por defecto del evento).

async function owned(userId: string, productId: unknown): Promise<string> {
  if (typeof productId !== "string" || !(await getProductRow(userId, productId))) throw new ProductApiError("No encontramos ese producto.", 404);
  return productId;
}

async function view(userId: string, productId: string, eventId: string) {
  const row = (await listEventCopies(userId, { productId, eventId }))[0];
  return row ? { status: row.status, text: copyOf(row), error: row.error_message } : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event } = await eventRequest(slug);
    const productId = await owned(userId, new URL(req.url).searchParams.get("product"));
    return NextResponse.json({ copy: await view(userId, productId, event.id) });
  } catch (e) {
    return errorResponse(e, "No pudimos leer los textos del evento.");
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event } = await eventRequest(slug);
    const productId = await owned(userId, (await json<{ productId: string }>(req)).productId);
    await startEventCopy(userId, productId, event);
    return NextResponse.json({ copy: await view(userId, productId, event.id) }, { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a escribir los textos. Intenta de nuevo.");
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event } = await eventRequest(slug);
    const body = await json<{ productId: string; copy: unknown }>(req);
    const productId = await owned(userId, body.productId);
    let copy = null;
    if (body.copy !== undefined && body.copy !== null) {
      const parsed = parseEditedCopy(body.copy);
      if (!parsed.ok) throw new ProductApiError(parsed.error, 400, parsed.field);
      copy = parsed.copy;
    }
    await approveEventCopy(userId, productId, event.id, copy);
    return NextResponse.json({ copy: await view(userId, productId, event.id) });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar los textos. Intenta de nuevo.");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { userId, event } = await eventRequest(slug);
    const productId = await owned(userId, new URL(req.url).searchParams.get("product"));
    await discardEventCopy(userId, productId, event.id);
    return NextResponse.json({ copy: null });
  } catch (e) {
    return errorResponse(e, "No pudimos descartar los textos. Intenta de nuevo.");
  }
}
