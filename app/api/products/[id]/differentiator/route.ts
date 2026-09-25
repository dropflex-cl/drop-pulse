import { NextResponse } from "next/server";
import { differentiatorSchema } from "@/lib/ai/schemas";
import { getDifferentiator, saveDifferentiator } from "@/lib/competitors/store";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

// El diferenciador del producto (Información base): la ficha lo propone y el comerciante lo
// confirma o lo edita. PUT { versus, claim, basis? } → guarda y confirma; devuelve { value, confirmed, proposed }.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    return NextResponse.json(await getDifferentiator(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ versus: string; claim: string; basis: string }>(req);
    const parsed = differentiatorSchema.safeParse({ versus: body.versus, claim: body.claim, basis: body.basis ?? "" });
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "claim");
      const message =
        field === "versus"
          ? "Escribe contra qué se diferencia: lo que tu cliente usa hoy (entre 3 y 120 caracteres)."
          : field === "basis"
            ? "El respaldo puede tener hasta 280 caracteres."
            : "Escribe la diferencia en una frase (entre 10 y 280 caracteres).";
      throw new ProductApiError(message, 400, field);
    }
    await saveDifferentiator(userId, id, parsed.data);
    return NextResponse.json(await getDifferentiator(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
