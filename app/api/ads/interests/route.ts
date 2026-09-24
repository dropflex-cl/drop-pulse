import { NextResponse } from "next/server";
import { searchInterests } from "@/lib/ads/meta/adapter";
import { metaToken } from "@/lib/integrations/meta/connection";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse } from "@/lib/products/http";

/** Intereses del catálogo de Meta para ChipInput (?q=). Sin token o si Meta falla, lista vacía. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? "";
    const token = await metaToken(user.id);
    if (!token || q.trim().length < 2) return NextResponse.json({ options: [] });
    const options = await searchInterests(token, q).catch((e) => {
      console.error("[ads/interests]", e);
      return [];
    });
    return NextResponse.json({ options });
  } catch (e) {
    return errorResponse(e, "No pudimos buscar intereses.");
  }
}
