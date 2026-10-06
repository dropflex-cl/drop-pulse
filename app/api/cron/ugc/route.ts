import { after, NextResponse } from "next/server";
import { cronSecret } from "@/lib/integrations/env";
import { safeEqual } from "@/lib/integrations/oauth-state";
import { resumeUgcOperations } from "@/lib/video/operations";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret()}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  after(async () => { console.info("[cron/ugc]", await resumeUgcOperations()); });
  return NextResponse.json({ started: true }, { status: 202 });
}
