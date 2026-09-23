import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { AngleBriefView, AngleOption, AngleRankingView, RunStatus } from "@/lib/types";
import { ANGLES, type AngleRole, type SalesAngle } from "./catalog";
import type { AngleBriefPayload, AngleRouterOutput } from "./schemas";
import type { ScoredAngle } from "./score";

// angle_rankings y angle_briefs: lecturas y escrituras de la etapa Ángulos. Siempre con service_role
// filtrando por el dueño (como lib/products/store.ts).

/** Una evaluación o un desarrollo que no avanza en este tiempo se da por interrumpido. */
const RUNNING_STALE_MS = 10 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;

export interface RankingRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  error_message: string | null;
  input: Record<string, unknown>;
  payload: AngleRouterOutput | null;
  scores: ScoredAngle[] | null;
  suggested_primary: SalesAngle | null;
  suggested_secondary: SalesAngle | null;
  primary_angle: SalesAngle | null;
  secondary_angle: SalesAngle | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface BriefRow {
  id: string;
  product_id: string;
  user_id: string;
  ranking_id: string;
  angle: SalesAngle;
  role: AngleRole;
  generation: RunStatus;
  error_message: string | null;
  payload: AngleBriefPayload | null;
  status: DbContentStatus;
  edited_at: string | null;
  created_at: string;
}

export function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Cierra las evaluaciones y los desarrollos colgados (el proceso murió). */
export async function expireStaleAngles(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const running = new Date(now - RUNNING_STALE_MS).toISOString();
  const queued = new Date(now - QUEUED_STALE_MS).toISOString();
  const patch = (message: string) => ({ error_code: "stale", error_message: message, finished_at: stamp, updated_at: stamp });
  const results = await Promise.all([
    db.from("angle_rankings").update({ status: "failed", ...patch("La evaluación se interrumpió. Toca Reintentar.") }).eq("user_id", userId).eq("status", "running").lt("started_at", running),
    db.from("angle_rankings").update({ status: "failed", ...patch("La evaluación se interrumpió. Toca Reintentar.") }).eq("user_id", userId).eq("status", "queued").lt("created_at", queued),
    db.from("angle_briefs").update({ generation: "failed", ...patch("El desarrollo se interrumpió. Toca Regenerar.") }).eq("user_id", userId).eq("generation", "running").lt("started_at", running),
    db.from("angle_briefs").update({ generation: "failed", ...patch("El desarrollo se interrumpió. Toca Regenerar.") }).eq("user_id", userId).eq("generation", "queued").lt("created_at", queued),
  ]);
  for (const r of results) fail("Cerrar ángulos colgados", r.error);
}

/** La evaluación más reciente de cada producto. */
export async function latestRankings(userId: string, productIds: string[]): Promise<Map<string, RankingRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("angle_rankings")
    .select("*")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer los ángulos", error);
  const map = new Map<string, RankingRow>();
  for (const r of (data ?? []) as RankingRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** El desarrollo vigente de cada papel (el más reciente que no se descartó) de las evaluaciones dadas. */
export async function currentBriefs(userId: string, rankingIds: string[]): Promise<Map<string, Partial<Record<AngleRole, BriefRow>>>> {
  if (!rankingIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("angle_briefs")
    .select("id, product_id, user_id, ranking_id, angle, role, generation, error_message, payload, status, edited_at, created_at")
    .eq("user_id", userId)
    .in("ranking_id", rankingIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  fail("Leer los desarrollos", error);
  const map = new Map<string, Partial<Record<AngleRole, BriefRow>>>();
  for (const r of (data ?? []) as BriefRow[]) {
    const byRole = map.get(r.ranking_id) ?? {};
    if (!byRole[r.role]) byRole[r.role] = r;
    map.set(r.ranking_id, byRole);
  }
  return map;
}

export async function getBriefRow(userId: string, productId: string, briefId: string): Promise<BriefRow | null> {
  const { data, error } = await adminClient().from("angle_briefs").select("*").eq("user_id", userId).eq("product_id", productId).eq("id", briefId).maybeSingle();
  fail("Leer el desarrollo", error);
  return (data as BriefRow | null) ?? null;
}

// ---------------------------------------------------------------- A la pantalla

function toOption(s: ScoredAngle, i: number): AngleOption {
  return { angle: s.angle, name: ANGLES[s.angle].name, rank: i + 1, score: s.score, why: s.why, risks: s.risks, breakdown: s.breakdown };
}

/** `currentAvatarId`: el cliente ideal aprobado hoy; si es otro, la evaluación quedó vieja. */
export function toRankingView(r: RankingRow, currentAvatarId: string | undefined): AngleRankingView {
  const scores = r.scores ?? [];
  const missing: AngleRankingView["missing"] = [];
  const potential = (r.input.potential ?? {}) as Partial<Record<"reviews" | "expert", number>>;
  if (scores.some((s) => s.risks.some((k) => k.fix === "reviews"))) {
    missing.push({ text: `Reseñas reales: subirían Historia personal hasta ~${potential.reviews ?? 70}`, fix: "reviews" });
  }
  if (scores.some((s) => s.risks.some((k) => k.fix === "expert"))) {
    missing.push({ text: `Un experto real que lo recomiende: subiría Autoridad hasta ~${potential.expert ?? 70}`, fix: "expert" });
  }
  for (const m of r.payload?.missing_inputs ?? []) missing.push({ text: m.gain ? `${m.text}: ${m.gain}` : m.text });
  return {
    id: r.id,
    status: r.status,
    error: r.error_message ?? undefined,
    createdAt: r.created_at,
    angles: scores.map(toOption),
    suggested: r.suggested_primary && r.suggested_secondary ? { primary: r.suggested_primary, secondary: r.suggested_secondary } : undefined,
    chosen: r.confirmed_at && r.primary_angle && r.secondary_angle ? { primary: r.primary_angle, secondary: r.secondary_angle } : undefined,
    confirmedAt: r.confirmed_at ?? undefined,
    combos: (r.payload?.combinations ?? []).map((c) => ({ primary: c.primary, secondary: c.secondary, text: c.how })),
    missing,
    avatarChanged: Boolean(currentAvatarId && r.input.avatar_id && r.input.avatar_id !== currentAvatarId),
  };
}

export function toBriefView(b: BriefRow): AngleBriefView {
  const p = b.payload;
  return {
    id: b.id,
    angle: b.angle,
    name: ANGLES[b.angle].name,
    role: b.role,
    generation: b.generation,
    error: b.error_message ?? undefined,
    status: toUiStatus(b.status),
    content: p
      ? {
          coreMessage: p.core_message,
          hooks: p.hooks.map((h) => h.text),
          recommendedHook: Math.min(Math.max(0, p.recommended_hook), Math.max(0, p.hooks.length - 1)),
          aida: p.aida_summary,
          objections: p.objection_handling,
          offer: p.offer_layer,
        }
      : undefined,
    createdAt: b.created_at,
    editedAt: b.edited_at ?? undefined,
  };
}
