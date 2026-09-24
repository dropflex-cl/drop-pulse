import { after, NextResponse } from "next/server";
import { cronSecret } from "@/lib/integrations/env";
import { safeEqual } from "@/lib/integrations/oauth-state";
import { runAdsSync } from "@/lib/pipeline/ads-sync";

export const maxDuration = 300;

/**
 * Lectura horaria de las campañas (docs/spec-anuncios.md §6). La llama pg_cron (job ads-sync-hourly)
 * con `Bearer CRON_SECRET`. Responde de inmediato y lee en segundo plano: pg_net corta a los 10 s.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${cronSecret()}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  after(async () => {
    const r = await runAdsSync();
    console.info("[cron/ads-sync]", r);
  });
  return NextResponse.json({ started: true }, { status: 202 });
}
