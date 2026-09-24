// Mantenimiento del comerciante que antes corría en cada lectura de productos: cerrar lo colgado de
// cada etapa y traer los productos elegidos en el onboarding que aún no se crearon. Ahora corre
// después de responder (after), a lo más una vez por minuto por instancia, así no frena ninguna
// pantalla. El sondeo de cada etapa (/api/products/[id]/*) sigue cerrando lo suyo antes de leer,
// así que una pantalla que espera una corrida colgada la ve fallar en el siguiente sondeo.
import "server-only";
import { after } from "next/server";
import { expireStaleAngles } from "@/lib/angles/store";
import { expireStaleCopy } from "@/lib/copy/store";
import { expireStaleCreatives } from "@/lib/creatives/store";
import { expireStalePageImages } from "@/lib/page-images/store";
import { expireStaleLaunches } from "@/lib/pipeline/ads-launch";
import { expireStalePublications } from "@/lib/pipeline/publish";
import { expireStaleImports } from "@/lib/reviews/store";
import { expireStaleRuns } from "./store";
import { syncSelectedProducts } from "./sync";

const EVERY_MS = 60_000;
const lastRun = new Map<string, number>();

async function housekeeping(userId: string): Promise<void> {
  await syncSelectedProducts(userId).catch((e) => console.error("[products/housekeeping] sincronizar", e));
  const results = await Promise.allSettled([
    expireStaleRuns(userId),
    expireStaleImports(userId),
    expireStaleAngles(userId),
    expireStaleCopy(userId),
    expireStaleCreatives(userId),
    expireStalePageImages(userId),
    expireStalePublications(userId),
    expireStaleLaunches(userId),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("[products/housekeeping] cerrar lo colgado", r.reason);
}

/** Programa el mantenimiento para después de responder. No espera ni lanza. */
export function scheduleHousekeeping(userId: string): void {
  const now = Date.now();
  if (now - (lastRun.get(userId) ?? 0) < EVERY_MS) return;
  lastRun.set(userId, now);
  after(() => housekeeping(userId));
}
