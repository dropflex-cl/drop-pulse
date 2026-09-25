import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { publishEvents } from "@/lib/pipeline/events";
import { errorResponse } from "@/lib/products/http";

// Eventos › «Publicar en la tienda»: el metafield dropflex.event de cada producto ya publicado.
// POST → { products, withEvent, failed }. Cambia la tienda real: se prueba solo en tiendas de desarrollo.
export const maxDuration = 120;

export async function POST() {
  try {
    const user = await requireUser();
    return NextResponse.json(await publishEvents(user.id));
  } catch (e) {
    return errorResponse(e, "No pudimos publicar los eventos. Intenta de nuevo.");
  }
}
