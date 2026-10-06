import { ANGLES } from "@/lib/angles/catalog";
import { adminClient } from "@/lib/integrations/admin";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { type StrategyExtraction } from "@/lib/strategy/schemas";
import type { RunStatus, StrategyView } from "@/lib/types";
import "server-only";
/** Una corrida que no avanza en este tiempo se da por interrumpida (cada avance toca updated_at). */
const RUNNING_STALE_MS = 15 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;

export interface StrategyRunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  current_step: "report" | "extract" | null;
  template_id: string | null;
  template_version: number | null;
  input: { market: Market; pricing: PricingPlan; tags: Record<string, string>; name: string; description: string; image_id: string | null; model?: string };
  report: string | null;
  extraction: StrategyExtraction | null;
  error_code: string | null;
  error_message: string | null;
  chosen_slots: number[] | null;
  confirmed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------- Lecturas

/** La corrida más reciente de cada producto. */
export async function latestStrategies(userId: string, productIds: string[]): Promise<Map<string, StrategyRunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient().from("strategy_runs").select("*").eq("user_id", userId).in("product_id", productIds).order("created_at", { ascending: false });
  fail("Leer la estrategia", error);
  const map = new Map<string, StrategyRunRow>();
  for (const r of (data ?? []) as StrategyRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Lo que mira la ruta de etapas (sin el informe). */
export type StrategyState = Pick<StrategyRunRow, "product_id" | "status" | "error_message" | "confirmed_at" | "created_at">;

export async function latestStrategyStates(userId: string, productIds: string[]): Promise<Map<string, StrategyState>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("strategy_runs")
    .select("product_id, status, error_message, confirmed_at, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer la estrategia", error);
  const map = new Map<string, StrategyState>();
  for (const r of (data ?? []) as StrategyState[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Cierra las corridas colgadas (el proceso murió o pasó el tiempo máximo de la función). */
export async function expireStaleStrategies(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const patch = { status: "failed", error_code: "stale", error_message: "La estrategia anterior se interrumpió. Prepara el análisis desde el chat.", finished_at: stamp, updated_at: stamp };
  const results = await Promise.all([
    db.from("strategy_runs").update(patch).eq("user_id", userId).eq("status", "running").lt("updated_at", new Date(now - RUNNING_STALE_MS).toISOString()),
    db.from("strategy_runs").update(patch).eq("user_id", userId).eq("status", "queued").lt("created_at", new Date(now - QUEUED_STALE_MS).toISOString()),
  ]);
  for (const r of results) fail("Cerrar estrategias colgadas", r.error);
}

/** La corrida para la pantalla. */
export function toStrategyView(r: StrategyRunRow): StrategyView {
  const x = r.extraction;
  return {
    id: r.id,
    status: r.status,
    step: r.current_step,
    report: r.report ?? "",
    error: r.error_message,
    templateVersion: r.template_version,
    angles: (x?.angles ?? []).map((a, index) => ({ index, title: a.title, hook: a.hook, promise: a.promise, why: a.why, segment: a.segment, frameName: ANGLES[a.frame]?.name ?? a.frame })),
    firstDollar: x?.first_dollar ?? [],
    chosen: r.confirmed_at ? (r.chosen_slots ?? []) : null,
    confirmedAt: r.confirmed_at,
    createdAt: r.created_at,
    startedAt: r.started_at,
  };
}
