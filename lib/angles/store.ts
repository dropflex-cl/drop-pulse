import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import type { DbContentStatus } from "@/lib/products/store";
import type { RunStatus } from "@/lib/types";
import type { AngleSlot, SalesAngle, TestAngle } from "./catalog";
import type { AngleBriefPayload, LegacyScoredAngle, RankingPayload } from "./schemas";
import { angleForPrompt, type AngleForPrompt } from "./approved";

// angle_rankings y angle_briefs: los ángulos elegidos y sus desarrollos, como los leen los pasos
// siguientes. Desde la estrategia (lib/pipeline/strategy.ts) se escriben al confirmar, ya aprobados.
// Siempre con service_role filtrando por el dueño (como lib/products/store.ts).

export interface RankingRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  error_message: string | null;
  input: Record<string, unknown>;
  /** La propuesta del orquestador (v7) o, en las de antes, su evaluación de las 6 formas. */
  payload: RankingPayload | null;
  /** Solo en las evaluaciones de antes del orquestador v7: el puntaje de las 6 formas. */
  scores: LegacyScoredAngle[] | null;
  /** Índices de los candidatos que sugiere el orquestador. */
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

// ---------------------------------------------------------------- A la pantalla

/** Los ángulos elegidos, en orden de slot. */
export function chosenAngles(r: Pick<RankingRow, "chosen_angles" | "confirmed_at">): TestAngle[] {
  if (!r.confirmed_at) return [];
  return [...(r.chosen_angles ?? [])].sort((a, b) => a.slot - b.slot);
}

/** ¿Están todos los ángulos elegidos desarrollados y aprobados? (2 o 3; los de antes, 2). */
export function allApproved(chosen: Pick<TestAngle, "slot">[], briefs: BriefsBySlot<Pick<BriefState, "generation" | "status">>): boolean {
  return chosen.length >= 2 && chosen.every((a) => briefs[a.slot]?.generation === "succeeded" && briefs[a.slot]?.status === "approved");
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

/** Los ángulos elegidos con su desarrollo aprobado (los leen Imágenes, Página, Creativos, Video y Eventos), o null si falta alguno. */
export async function approvedAngles(userId: string, productId: string): Promise<{ angle: TestAngle; brief: BriefRow }[] | null> {
  const ranking = (await latestRankings(userId, [productId])).get(productId);
  if (!ranking?.confirmed_at) return null;
  const chosen = chosenAngles(ranking);
  const briefs = (await currentBriefs(userId, [ranking.id])).get(ranking.id) ?? {};
  if (!allApproved(chosen, briefs)) return null;
  return chosen.map((angle) => ({ angle, brief: briefs[angle.slot]! })).filter((a) => a.brief.payload);
}
