import { after, NextResponse } from "next/server";
import { cronSecret } from "@/lib/integrations/env";
import { safeEqual } from "@/lib/integrations/oauth-state";
import { resumeGalleryOperations } from "@/lib/page-images/operations";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret()}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  after(async () => { console.info("[cron/gallery]", await resumeGalleryOperations()); });
  return NextResponse.json({ started: true }, { status: 202 });
}
