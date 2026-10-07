import { after, NextResponse } from "next/server";
import { cronSecret } from "@/lib/integrations/env";
import { safeEqual } from "@/lib/integrations/oauth-state";
import { resumeVisualIngestions } from "@/lib/product-intelligence/visual-operations";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${cronSecret()}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  after(async () => { await resumeVisualIngestions(); });
  return NextResponse.json({ started: true }, { status: 202 });
}
