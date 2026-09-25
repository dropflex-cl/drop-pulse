import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { AngleBriefView, AngleCandidateView, AngleOption, AngleRankingView, RunStatus, TestAngleView } from "@/lib/types";
import { ANGLES, testAngleName, type AngleSlot, type SalesAngle, type TestAngle } from "./catalog";
import type { AngleBriefPayload, AngleRouterOutput } from "./schemas";
import { rankCandidates, type ScoredAngle } from "./score";
import { angleForPrompt, type AngleForPrompt } from "./approved";

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
  /** Índices de payload.test_angles que sugiere el código. */
  suggested_slots: number[] | null;
  /** La elección confirmada: 2 o 3 ángulos, uno por slot. */
  chosen_angles: TestAngle[] | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface BriefRow {
  id: string;
  product_id: string;
  user_id: string;
  ranking_id: string;
  /** La forma con que se cuenta el ángulo. */
  angle: SalesAngle;
  slot: AngleSlot;
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

/** Los desarrollos de una evaluación, por slot. */
export type BriefsBySlot<T> = Partial<Record<AngleSlot, T>>;

/** El desarrollo vigente de cada ángulo (el más reciente que no se descartó) de las evaluaciones dadas. */
export async function currentBriefs(userId: string, rankingIds: string[]): Promise<Map<string, BriefsBySlot<BriefRow>>> {
  if (!rankingIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("angle_briefs")
    .select("id, product_id, user_id, ranking_id, angle, slot, generation, error_message, payload, status, edited_at, created_at")
    .eq("user_id", userId)
    .in("ranking_id", rankingIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  fail("Leer los desarrollos", error);
  const map = new Map<string, BriefsBySlot<BriefRow>>();
  for (const r of (data ?? []) as BriefRow[]) {
    const bySlot = map.get(r.ranking_id) ?? {};
    if (!bySlot[r.slot]) bySlot[r.slot] = r;
    map.set(r.ranking_id, bySlot);
  }
  return map;
}

/** Lo que la ruta de etapas mira de una evaluación y de un desarrollo (sin payload). */
export type RankingState = Pick<RankingRow, "id" | "product_id" | "status" | "error_message" | "confirmed_at" | "chosen_angles" | "created_at">;
export type BriefState = Pick<BriefRow, "id" | "ranking_id" | "angle" | "slot" | "generation" | "error_message" | "status" | "edited_at">;

/** Como latestRankings, sin la evaluación: solo para la posición en la ruta. */
export async function latestRankingStates(userId: string, productIds: string[]): Promise<Map<string, RankingState>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("angle_rankings")
    .select("id, product_id, status, error_message, confirmed_at, chosen_angles, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer los ángulos", error);
  const map = new Map<string, RankingState>();
  for (const r of (data ?? []) as RankingState[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Como currentBriefs, sin el desarrollo: solo para la posición en la ruta. */
export async function currentBriefStates(userId: string, rankingIds: string[]): Promise<Map<string, BriefsBySlot<BriefState>>> {
  if (!rankingIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("angle_briefs")
    .select("id, ranking_id, angle, slot, generation, error_message, status, edited_at")
    .eq("user_id", userId)
    .in("ranking_id", rankingIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  fail("Leer los desarrollos", error);
  const map = new Map<string, BriefsBySlot<BriefState>>();
  for (const r of (data ?? []) as BriefState[]) {
    const bySlot = map.get(r.ranking_id) ?? {};
    if (!bySlot[r.slot]) bySlot[r.slot] = r;
    map.set(r.ranking_id, bySlot);
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

/** Los ángulos elegidos, en orden de slot. */
export function chosenAngles(r: Pick<RankingRow, "chosen_angles" | "confirmed_at">): TestAngle[] {
  if (!r.confirmed_at) return [];
  return [...(r.chosen_angles ?? [])].sort((a, b) => a.slot - b.slot);
}

/** ¿Están todos los ángulos elegidos desarrollados y aprobados? (2 o 3; los de antes, 2). */
export function allApproved(chosen: Pick<TestAngle, "slot">[], briefs: BriefsBySlot<Pick<BriefState, "generation" | "status">>): boolean {
  return chosen.length >= 2 && chosen.every((a) => briefs[a.slot]?.generation === "succeeded" && briefs[a.slot]?.status === "approved");
}

export function toTestAngleView(a: TestAngle): TestAngleView {
  return {
    slot: a.slot,
    frame: a.frame,
    frameName: ANGLES[a.frame].name,
    title: a.title,
    name: testAngleName(a),
    painOrDesire: a.pain_or_desire,
    segment: a.segment,
    promise: a.promise,
    triggerMoment: a.trigger_moment,
    competition: a.competition,
  };
}

/** Los candidatos del orquestador con su puntaje (forma + competencia), calculado en código. */
export function candidateViews(r: Pick<RankingRow, "payload" | "scores" | "input">): AngleCandidateView[] {
  const list = r.payload?.test_angles ?? [];
  if (!list.length) return [];
  const competitors = Number((r.input as { competitors?: number }).competitors ?? 0);
  const { candidates } = rankCandidates(list, r.scores ?? [], competitors);
  return list.map((c, i) => ({
    index: i,
    title: c.title,
    painOrDesire: c.pain_or_desire,
    segment: c.segment,
    promise: c.promise,
    frame: c.frame,
    frameName: ANGLES[c.frame]?.name ?? c.frame,
    triggerMoment: c.trigger_moment,
    competition: c.competition,
    competitorsUsing: candidates[i].competitorsUsing,
    score: candidates[i].score,
    frameScore: candidates[i].frameScore,
    competitionDelta: candidates[i].competition,
  }));
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
  // Evaluaciones de la versión 1 guardaban { text, gain }.
  for (const m of (r.payload?.missing_inputs ?? []) as (string | { text: string; gain?: string })[]) missing.push({ text: typeof m === "string" ? m : m.gain ? `${m.text}: ${m.gain}` : m.text });
  const chosen = chosenAngles(r);
  return {
    id: r.id,
    status: r.status,
    error: r.error_message ?? undefined,
    createdAt: r.created_at,
    angles: scores.map(toOption),
    candidates: candidateViews(r),
    suggested: r.suggested_slots ?? [],
    chosen: chosen.length ? chosen.map(toTestAngleView) : undefined,
    confirmedAt: r.confirmed_at ?? undefined,
    competitors: Number((r.input as { competitors?: number }).competitors ?? 0),
    missing,
    avatarChanged: Boolean(currentAvatarId && r.input.avatar_id && r.input.avatar_id !== currentAvatarId),
  };
}

export function toBriefView(b: BriefRow, angle?: TestAngle): AngleBriefView {
  const p = b.payload;
  return {
    id: b.id,
    angle: b.angle,
    name: angle ? testAngleName(angle) : ANGLES[b.angle].name,
    frameName: ANGLES[b.angle].name,
    slot: b.slot,
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

/**
 * Los desarrollos de una corrida (por id, en el orden de la huella) con su ángulo, listos para un
 * prompt. Falta uno → null: los ángulos cambiaron y hay que volver a empezar.
 */
export async function anglesForPrompt(userId: string, ids: string[]): Promise<AngleForPrompt[] | null> {
  if (!ids.length) return null;
  const db = adminClient();
  const { data, error } = await db.from("angle_briefs").select("id, angle, slot, payload, ranking_id").eq("user_id", userId).in("id", ids);
  fail("Leer los desarrollos", error);
  const rows = (data ?? []) as Pick<BriefRow, "id" | "angle" | "slot" | "payload" | "ranking_id">[];
  if (rows.length !== ids.length || rows.some((r) => !r.payload)) return null;
  const rankingIds = [...new Set(rows.map((r) => r.ranking_id))];
  const { data: rankings, error: rankingError } = await db.from("angle_rankings").select("id, chosen_angles, confirmed_at").eq("user_id", userId).in("id", rankingIds);
  fail("Leer los ángulos", rankingError);
  const chosen = new Map((rankings ?? []).map((r) => [r.id as string, chosenAngles(r as Pick<RankingRow, "chosen_angles" | "confirmed_at">)]));
  return ids.map((id) => {
    const r = rows.find((x) => x.id === id)!;
    const angle = chosen.get(r.ranking_id)?.find((a) => a.slot === r.slot) ?? { slot: r.slot, frame: r.angle, title: "", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" };
    return angleForPrompt(angle, r.payload!, r.angle);
  });
}
