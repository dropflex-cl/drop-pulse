import { NextResponse } from "next/server";
import { listRegions } from "@/lib/ads/meta/adapter";
import { metaToken } from "@/lib/integrations/meta/connection";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse } from "@/lib/products/http";

/** Regiones de un país (?country=CL) para excluirlas. Sin token o si Meta falla, lista vacía. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const country = (new URL(req.url).searchParams.get("country") ?? "").toUpperCase();
    const token = await metaToken(user.id);
    if (!token) return NextResponse.json({ options: [] });
    const options = await listRegions(token, country).catch((e) => {
      console.error("[ads/regions]", e);
      return [];
    });
    return NextResponse.json({ options });
  } catch (e) {
    return errorResponse(e, "No pudimos leer las regiones.");
  }
}
