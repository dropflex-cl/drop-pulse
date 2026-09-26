import "server-only";
import { createHash } from "node:crypto";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { retryableContent } from "@/lib/ai/content";
import { recordAiGeneration } from "@/lib/ai/track";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import { ANGLES, MIN_TEST_ANGLES, SALES_ANGLES, TEST_ANGLES, type AngleSlot, type SalesAngle, type TestAngle } from "@/lib/angles/catalog";
import { angleRouterContext, angleRouterSystem, angleRouterTail, angleSystem, angleUser, type AngleContext } from "@/lib/angles/prompts";
import {
  ANGLE_BRIEF_PROMPT_VERSION,
  ANGLE_ROUTER_PROMPT_VERSION,
  angleBriefEditSchema,
  angleBriefSchema,
  angleRouterSchema,
  evaluationsFrom,
  routerProblems,
  type AngleBriefEdit,
  type AngleBriefPayload,
} from "@/lib/angles/schemas";
import { potentialScore, rankAngles, rankCandidates, type ScoredAngle } from "@/lib/angles/score";
import { allApproved, chosenAngles, currentBriefs, fail, getBriefRow, latestRankings, type BriefRow, type RankingRow } from "@/lib/angles/store";
import { analyzedCompetitors, getDifferentiator } from "@/lib/competitors/store";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { getProductRow, latestAvatars, latestBrief } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { OptimizeError } from "./optimize";

// Etapa Ángulos, segunda parte del pipeline de agentes creativos (agentes-creativos/README.md y
// docs/spec-angulos-testeo.md §4):
//   1. angle-router → evalúa las 6 formas y propone 5 ángulos para testear; los puntajes y la
//      sugerencia de 3 se calculan en código (forma + competencia)
//   2. el comerciante elige 2 o 3 ángulos (uno por conjunto de anuncios) y la forma de cada uno
//   3. un agente por ángulo (el de su forma), en paralelo → un brief por ángulo
// Parte del cliente ideal APROBADO, el diferenciador, la competencia, la ficha y el precio.

/** Tope de evaluaciones y de desarrollos por comerciante en 24 h (cada uno es una llamada a Claude Opus). */
const DAILY_RANKINGS = 20;
const DAILY_BRIEFS = 90;

/**
 * Cortacircuito: si las últimas evaluaciones de un producto fallaron por respuestas que no se pueden
 * puntuar (cada una ya cobró 2 intentos), otra más fallaría igual. Se frena por unas horas o hasta
 * que cambie la versión del prompt o del esquema (ANGLE_ROUTER_PROMPT_VERSION), que es como se corrige.
 */
const BREAKER_FAILURES = 2;
const BREAKER_WINDOW_MS = 6 * 60 * 60 * 1000;
const UNSCORABLE = ["invalid_output", "invalid_scores"];

async function breakerOpen(userId: string, productId: string): Promise<boolean> {
  const { data, error } = await adminClient()
    .from("angle_rankings")
    .select("status, error_code, prompt_version, created_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(BREAKER_FAILURES);
  fail("Leer las evaluaciones", error);
  const rows = (data ?? []) as { status: string; error_code: string | null; prompt_version: number | null; created_at: string }[];
  const since = Date.now() - BREAKER_WINDOW_MS;
  return (
    rows.length === BREAKER_FAILURES &&
    rows.every((r) => r.status === "failed" && UNSCORABLE.includes(r.error_code ?? "") && r.prompt_version === ANGLE_ROUTER_PROMPT_VERSION && Date.parse(r.created_at) > since)
  );
}


async function dailyCount(table: "angle_rankings" | "angle_briefs", userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await adminClient().from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las generaciones", error);
  return count ?? 0;
}

/** Lo que leen el orquestador y los agentes: ficha, cliente ideal aprobado, precio y etiquetas aprobadas. */
async function loadContext(userId: string, productId: string) {
  const [product, brief, avatars, pricing, labels, differentiator, competitors] = await Promise.all([
    getProductRow(userId, productId),
    latestBrief(userId, productId),
    latestAvatars(userId, [productId]),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    getDifferentiator(userId, productId),
    analyzedCompetitors(userId, productId),
  ]);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief) throw new OptimizeError("Aprueba tu cliente ideal en Información base para elegir ángulos.", 409);
  if (!pricing) throw new OptimizeError("Guarda el precio y los packs en Información base para elegir ángulos.", 409);
  return {
    product,
    brief,
    avatar,
    pricing: pricing as PricingPlan,
    labels: labels?.status === "approved" ? labels.payload : undefined,
    differentiator,
    competitors,
  };
}

// ---------------------------------------------------------------- 1. Evaluar (angle-router)

/** Crea la evaluación (queued). Devuelve la activa si ya había una: tocar dos veces no cobra dos veces. */
export async function startRanking(userId: string, productId: string): Promise<{ ranking: RankingRow; created: boolean }> {
  const ctx = await loadContext(userId, productId);
  // El método parte del diferenciador: sin él no hay ángulo que sirva (spec §3.1).
  if (!ctx.differentiator.confirmed) throw new OptimizeError("Antes de elegir ángulos: confirma en Información base en qué se diferencia tu producto de lo que tu cliente ya usa.", 409);
  const db = adminClient();
  const active = await db.from("angle_rankings").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la evaluación", active.error);
  if (active.data) return { ranking: active.data as RankingRow, created: false };
  if (await breakerOpen(userId, productId)) {
    console.error(`[angles] cortacircuito: ${BREAKER_FAILURES} evaluaciones seguidas sin puntuar (producto ${productId}, prompt v${ANGLE_ROUTER_PROMPT_VERSION})`);
    throw new OptimizeError("La IA no está pudiendo evaluar los ángulos de este producto y no queremos cobrarte más intentos. Ya quedó registrado para revisarlo; vuelve a intentarlo en unas horas.", 409);
  }
  if ((await dailyCount("angle_rankings", userId)) >= DAILY_RANKINGS) {
    throw new OptimizeError(`Llegaste al máximo de ${DAILY_RANKINGS} evaluaciones de ángulos en 24 horas. Vuelve mañana.`, 429);
  }
  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const { data, error } = await db
    .from("angle_rankings")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "queued",
      // Copia de lo que se evalúa: si el comerciante cambia algo a mitad, la evaluación no se mezcla.
      input: {
        market,
        pricing: ctx.pricing,
        avatar_id: ctx.avatar.id,
        labels: ctx.labels ?? null,
        differentiator: ctx.differentiator.value,
        competitors: ctx.competitors.length,
        competitor_analyses: ctx.competitors,
      },
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const again = await db.from("angle_rankings").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la evaluación", again.error);
    return { ranking: again.data as RankingRow, created: false };
  }
  fail("Crear la evaluación", error);
  return { ranking: data as RankingRow, created: true };
}

async function avatarById(userId: string, id: string): Promise<CustomerAvatar> {
  const { data, error } = await adminClient().from("customer_avatars").select("payload").eq("user_id", userId).eq("id", id).single();
  fail("Leer el cliente ideal", error);
  if (!data) throw new AiStepError("not_found", "El cliente ideal ya no existe. Vuelve a evaluar.");
  return data.payload as CustomerAvatar;
}

async function contextFor(r: { user_id: string; product_id: string }, input: Record<string, unknown>): Promise<AngleContext> {
  const [product, brief, avatar] = await Promise.all([
    getProductRow(r.user_id, r.product_id),
    latestBrief(r.user_id, r.product_id),
    avatarById(r.user_id, input.avatar_id as string),
  ]);
  if (!product || !brief) throw new AiStepError("not_found", "El producto o su ficha ya no existen.");
  return {
    brief,
    avatar,
    pricing: input.pricing as PricingPlan,
    labels: (input.labels as PackLabel[] | null) ?? undefined,
    baseInfo: product.base_info,
    differentiator: (input.differentiator as AngleContext["differentiator"]) ?? brief.differentiator ?? null,
    competitors: (input.competitor_analyses as AngleContext["competitors"]) ?? [],
  };
}

/**
 * Huella de lo que lee un agente de ángulo. Mismo valor = misma entrada: un desarrollo nuevo saldría
 * de lo mismo. Los textos de la evaluación (por qué, riesgos) no entran: son la redacción del modelo
 * sobre estas mismas entradas y cambian en cada evaluación aunque nada haya cambiado.
 */
function briefInputKey(ctx: AngleContext, market: unknown, angle: TestAngle, others: TestAngle[]): string {
  const input = { v: ANGLE_BRIEF_PROMPT_VERSION, market, angle, others: others.map((o) => ({ ...o, slot: 0 })), ...ctx };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function facts(brief: ProductBrief, avatar: CustomerAvatar, pricing: PricingPlan) {
  return {
    hasRealExpert: Boolean(brief.proof.real_expert?.trim()),
    hasRealReviews: brief.proof.real_reviews.some((r) => r.trim()),
    sophistication: avatar.market_sophistication,
    hasRealEvent: Boolean(brief.real_deadline_or_event?.trim()),
    packEarnsMore: pricing.packs.some((p) => p.units > 1 && p.earnsMoreThanPrevious && p.profit > 0),
  };
}

/** Ejecuta la evaluación. Pensada para `after()`: nunca lanza; deja el resultado en la fila. */
export async function runRanking(rankingId: string): Promise<void> {
  const db = adminClient();
  const claimed = await db
    .from("angle_rankings")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", rankingId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return;
  const r = claimed.data as RankingRow;
  try {
    const ctx = await contextFor(r, r.input);
    // Si la lista de puntajes no calza con los criterios, se pide otra una vez (diciendo qué falló);
    // nunca se completa con ceros.
    const evaluate = (retry: string[]) =>
      generateStructured({
        system: angleRouterSystem(r.input.market as Market),
        // El contexto con punto de caché: el segundo intento lo lee a 0,1×.
        content: retryableContent([], angleRouterContext(ctx), angleRouterTail(retry)),
        schema: angleRouterSchema,
        effort: "medium",
      });
    let problems: string[] = [];
    let result: Awaited<ReturnType<typeof evaluate>> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await evaluate(problems);
      problems = routerProblems(result.data);
      await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "angle_ranking", usage: result.usage, error: problems.length ? "invalid_scores" : null, problems });
      if (!problems.length) break;
      console.warn("[angles] puntajes inválidos", problems);
    }
    if (problems.length || !result) throw new AiStepError("invalid_output", "La IA respondió con puntajes incompletos. Toca Reintentar.", undefined, true);
    const { data, usage } = result;
    const evals = evaluationsFrom(data);
    const ranking = rankAngles(evals, facts(ctx.brief, ctx.avatar, ctx.pricing));
    const candidates = rankCandidates(data.test_angles ?? [], ranking.angles, ctx.competitors?.length ?? 0, TEST_ANGLES);
    const now = new Date().toISOString();
    fail(
      "Guardar la evaluación",
      (
        await db
          .from("angle_rankings")
          .update({
            status: "succeeded",
            payload: data,
            scores: ranking.angles,
            suggested_slots: candidates.suggested,
            // Cuánto subirían con la prueba que falta (“Para elegir mejor, falta”).
            input: { ...r.input, potential: { reviews: potentialScore("personal_story", evals), expert: potentialScore("authority", evals) } },
            prompt_version: ANGLE_ROUTER_PROMPT_VERSION,
            model: usage.model,
            finished_at: now,
            updated_at: now,
          })
          .eq("id", r.id)
      ).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[angles] evaluar", e);
    if (known && !e.logged) await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "angle_ranking", usage: e.usage, error: e.code });
    const now = new Date().toISOString();
    const { error } = await db
      .from("angle_rankings")
      .update({
        status: "failed",
        error_code: known ? e.code : "unexpected",
        error_message: known ? e.message : "No pudimos terminar la evaluación. Toca Reintentar.",
        // Con qué versión falló: el cortacircuito solo frena fallas de la versión vigente.
        prompt_version: ANGLE_ROUTER_PROMPT_VERSION,
        finished_at: now,
        updated_at: now,
      })
      .eq("id", r.id);
    if (error) console.error("[angles] guardar la falla", error.message);
  }
}

// ---------------------------------------------------------------- 2. Confirmar la elección

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Valida y normaliza lo que manda la pantalla: 2 o 3 ángulos, slots 1..n, formas válidas. */
export function normalizeChoice(raw: unknown): TestAngle[] {
  if (!Array.isArray(raw)) throw new OptimizeError(`Elige entre ${MIN_TEST_ANGLES} y ${TEST_ANGLES} ángulos.`, 400);
  if (raw.length < MIN_TEST_ANGLES || raw.length > TEST_ANGLES) throw new OptimizeError(`Elige entre ${MIN_TEST_ANGLES} y ${TEST_ANGLES} ángulos.`, 400);
  const out = raw.map((r, i) => {
    const a = (r ?? {}) as Record<string, unknown>;
    const frame = a.frame as SalesAngle;
    if (!SALES_ANGLES.includes(frame)) throw new OptimizeError("Hay un ángulo sin forma válida.", 400);
    const angle: TestAngle = {
      slot: (i + 1) as AngleSlot,
      frame,
      title: clip(a.title, 60),
      pain_or_desire: clip(a.pain_or_desire, 400),
      segment: clip(a.segment, 300),
      promise: clip(a.promise, 300),
      trigger_moment: clip(a.trigger_moment, 400),
      competition: clip(a.competition, 400),
    };
    if (!angle.title || !angle.pain_or_desire) throw new OptimizeError("Cada ángulo necesita un nombre y el dolor o deseo que destaca.", 400);
    return angle;
  });
  const names = new Set(out.map((a) => a.title.toLowerCase()));
  if (names.size !== out.length) throw new OptimizeError("Hay dos ángulos con el mismo nombre: elige ángulos distintos.", 400);
  return out;
}

const sameAngle = (a: TestAngle, b: TestAngle | undefined) =>
  Boolean(b) && (["frame", "title", "pain_or_desire", "segment", "promise", "trigger_moment", "competition"] as const).every((k) => a[k] === b![k]);

/**
 * Guarda los ángulos elegidos y crea los desarrollos que falten. Un desarrollo que ya existe para el
 * mismo slot y el mismo ángulo se conserva. Devuelve los desarrollos nuevos, para ejecutarlos en
 * segundo plano.
 *
 * La elección se guarda al final: si algo falla antes, la evaluación no queda confirmada sin sus
 * desarrollos. Confirmar otra vez completa lo que falte.
 */
export async function confirmSelection(userId: string, productId: string, rawAngles: unknown): Promise<string[]> {
  const angles = normalizeChoice(rawAngles);
  const ranking = (await latestRankings(userId, [productId])).get(productId);
  if (!ranking || ranking.status !== "succeeded") throw new OptimizeError("Primero elige ángulos con IA.", 409);
  await loadContext(userId, productId); // el cliente ideal sigue aprobado y hay precio

  const db = adminClient();
  const now = new Date().toISOString();

  // 1. Solo lecturas: qué se descarta, qué se reutiliza y qué se crea.
  const existing = (await currentBriefs(userId, [ranking.id])).get(ranking.id) ?? {};
  const previous = new Map(chosenAngles(ranking).map((a) => [a.slot, a]));
  const toReject: BriefRow[] = [];
  const toReuse: string[] = [];
  const toCreate: TestAngle[] = [];
  let ctx: AngleContext | null = null;
  for (const angle of angles) {
    const b = existing[angle.slot];
    if (b && b.angle === angle.frame && sameAngle(angle, previous.get(angle.slot)) && b.generation !== "failed") continue;
    if (b) toReject.push(b);
    // Volver a evaluar sin que cambie nada: el desarrollo vigente del mismo ángulo se conserva (con
    // su aprobación) en vez de pagar otro que saldría de lo mismo.
    ctx ??= await contextFor(ranking, ranking.input);
    const key = briefInputKey(ctx, ranking.input.market, { ...angle, slot: 1 }, angles.filter((o) => o.slot !== angle.slot));
    const { data: reusable, error: reuseError } = await db
      .from("angle_briefs")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("slot", angle.slot)
      .eq("angle", angle.frame)
      .eq("generation", "succeeded")
      .neq("status", "rejected")
      .neq("ranking_id", ranking.id)
      .eq("input_key", key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail("Buscar un desarrollo que sirva", reuseError);
    if (reusable) toReuse.push(reusable.id as string);
    else toCreate.push(angle);
  }
  // Un slot que ya no se usa (de 3 a 2 ángulos): su desarrollo queda descartado.
  for (const [slot, b] of Object.entries(existing)) if (b && Number(slot) > angles.length) toReject.push(b);
  if (toCreate.length && (await dailyCount("angle_briefs", userId)) + toCreate.length > DAILY_BRIEFS) {
    throw new OptimizeError(`Llegaste al máximo de ${DAILY_BRIEFS} desarrollos en 24 horas. Vuelve mañana.`, 429);
  }

  // 2. Escrituras: los desarrollos primero, la elección al final.
  for (const b of toReject) {
    fail(
      "Descartar el desarrollo anterior",
      (
        await db
          .from("angle_briefs")
          .update({ status: "rejected", ...(b.generation === "queued" || b.generation === "running" ? { generation: "failed", error_code: "superseded" } : {}), updated_at: now })
          .eq("id", b.id)
      ).error,
    );
  }
  for (const id of toReuse) {
    fail("Conservar el desarrollo", (await db.from("angle_briefs").update({ ranking_id: ranking.id, updated_at: now }).eq("id", id)).error);
  }
  let created: string[] = [];
  if (toCreate.length) {
    const { data, error } = await db
      .from("angle_briefs")
      .insert(toCreate.map((a) => ({ product_id: productId, user_id: userId, ranking_id: ranking.id, angle: a.frame, slot: a.slot, generation: "queued" })))
      .select("id");
    fail("Crear los desarrollos", error);
    created = (data ?? []).map((d) => d.id as string);
  }
  fail("Guardar la elección", (await db.from("angle_rankings").update({ chosen_angles: angles, confirmed_at: now, updated_at: now }).eq("id", ranking.id)).error);
  return created;
}

/** Los ángulos aprobados de la elección confirmada (2 o 3, en orden), o null si falta aprobar alguno. */
export async function approvedAngles(userId: string, productId: string): Promise<{ angle: TestAngle; brief: BriefRow }[] | null> {
  const ranking = (await latestRankings(userId, [productId])).get(productId);
  if (!ranking?.confirmed_at) return null;
  const chosen = chosenAngles(ranking);
  const briefs = (await currentBriefs(userId, [ranking.id])).get(ranking.id) ?? {};
  if (!allApproved(chosen, briefs)) return null;
  return chosen.map((angle) => ({ angle, brief: briefs[angle.slot]! })).filter((a) => a.brief.payload);
}

// ---------------------------------------------------------------- 3. Desarrollar (angulo-*)

/** Ejecuta un desarrollo. Pensada para `after()`: nunca lanza. */
export async function runBrief(briefId: string): Promise<void> {
  const db = adminClient();
  const claimed = await db
    .from("angle_briefs")
    .update({ generation: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .eq("generation", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return;
  const b = claimed.data as BriefRow;
  try {
    const { data: rankingData, error } = await db.from("angle_rankings").select("*").eq("id", b.ranking_id).single();
    fail("Leer la evaluación", error);
    const r = rankingData as RankingRow;
    const ctx = await contextFor(r, r.input);
    const scored = (r.scores ?? []).find((s: ScoredAngle) => s.angle === b.angle);
    const chosen = chosenAngles(r);
    const angle = chosen.find((a) => a.slot === b.slot) ?? { slot: b.slot, frame: b.angle, title: "", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" };
    const others = chosen.filter((a) => a.slot !== b.slot);
    const inputKey = briefInputKey(ctx, r.input.market, { ...angle, slot: 1 }, others);
    const { data, usage } = await generateStructured({
      system: angleSystem(b.angle, r.input.market as Market),
      content: [
        {
          type: "text",
          text: angleUser(b.angle, ctx, {
            angle: { ...angle, frame: b.angle },
            others,
            why: scored?.why ?? ANGLES[b.angle].gist,
            risks: scored?.risks.map((k) => k.text) ?? [],
            aidaEmphasis: r.payload?.aida_emphasis ?? "",
            complianceFlags: r.payload?.compliance_flags ?? [],
          }),
        },
      ],
      schema: angleBriefSchema(b.angle),
      effort: "high",
      maxTokens: 20000,
    });
    await recordAiGeneration({ userId: b.user_id, productId: b.product_id, step: "angle_brief", detail: `${b.slot} · ${ANGLES[b.angle].name}`, usage });
    const now = new Date().toISOString();
    fail(
      "Guardar el desarrollo",
      (
        await db
          .from("angle_briefs")
          .update({ generation: "succeeded", payload: data, status: "generated", prompt_version: ANGLE_BRIEF_PROMPT_VERSION, model: usage.model, input_key: inputKey, finished_at: now, updated_at: now })
          .eq("id", b.id)
          .eq("generation", "running") // si se reemplazó mientras generaba, no se pisa
      ).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[angles] desarrollar", e);
    if (known) await recordAiGeneration({ userId: b.user_id, productId: b.product_id, step: "angle_brief", detail: `${b.slot} · ${ANGLES[b.angle].name}`, usage: e.usage, error: e.code });
    const now = new Date().toISOString();
    const { error } = await db
      .from("angle_briefs")
      .update({
        generation: "failed",
        error_code: known ? e.code : "unexpected",
        error_message: known ? e.message : "No pudimos terminar este desarrollo. Toca Regenerar.",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", b.id)
      .eq("generation", "running");
    if (error) console.error("[angles] guardar la falla", error.message);
  }
}

/** “Regenerar”: un desarrollo nuevo del mismo ángulo y papel; el anterior queda descartado. */
export async function regenerateBrief(userId: string, productId: string, briefId: string): Promise<string> {
  const b = await getBriefRow(userId, productId, briefId);
  if (!b || b.status === "rejected") throw new OptimizeError("Ese desarrollo ya no está vigente. Actualiza la página.", 409);
  if (b.generation === "queued" || b.generation === "running") throw new OptimizeError("Este desarrollo todavía se está generando.", 409);
  await loadContext(userId, productId);
  if ((await dailyCount("angle_briefs", userId)) >= DAILY_BRIEFS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_BRIEFS} desarrollos en 24 horas. Vuelve mañana.`, 429);
  const db = adminClient();
  const now = new Date().toISOString();
  fail("Descartar el desarrollo anterior", (await db.from("angle_briefs").update({ status: "rejected", updated_at: now }).eq("id", b.id)).error);
  const { data, error } = await db
    .from("angle_briefs")
    .insert({ product_id: productId, user_id: userId, ranking_id: b.ranking_id, angle: b.angle, slot: b.slot, generation: "queued" })
    .select("id")
    .single();
  fail("Crear el desarrollo", error);
  return data!.id as string;
}

// ---------------------------------------------------------------- Decidir

async function ready(userId: string, productId: string, briefId: string): Promise<BriefRow> {
  const b = await getBriefRow(userId, productId, briefId);
  if (!b || b.status === "rejected") throw new OptimizeError("Ese desarrollo ya no está vigente. Actualiza la página.", 409);
  if (b.generation !== "succeeded" || !b.payload) throw new OptimizeError("Este desarrollo todavía no está listo.", 409);
  return b;
}

export async function decideBrief(userId: string, productId: string, briefId: string, action: "approve" | "reopen") {
  await ready(userId, productId, briefId);
  const now = new Date().toISOString();
  const patch = action === "approve" ? { status: "approved", decided_at: now } : { status: "in_review", decided_at: null };
  fail("Guardar tu decisión", (await adminClient().from("angle_briefs").update({ ...patch, updated_at: now }).eq("id", briefId)).error);
}

/** Aplica lo editado sobre el brief guardado (lo demás del brief no cambia). */
export function applyEdit(payload: AngleBriefPayload, edit: AngleBriefEdit): AngleBriefPayload {
  const hooks = edit.hooks.map((text, i) => {
    const before = payload.hooks.find((h) => h.text === text) ?? payload.hooks[i];
    return before ? { ...before, text } : { text, visual_first_3s: "", policy_ok: false };
  });
  return {
    ...payload,
    hooks,
    recommended_hook: Math.min(edit.recommended_hook, hooks.length - 1),
    aida_summary: edit.aida_summary,
    objection_handling: edit.objection_handling,
    offer_layer: edit.offer_layer,
  };
}

export async function editBrief(userId: string, productId: string, briefId: string, raw: unknown, approve: boolean) {
  const parsed = angleBriefEditSchema.safeParse(raw);
  if (!parsed.success) throw new OptimizeError("Hay campos vacíos. Revisa y vuelve a guardar.", 400);
  const b = await ready(userId, productId, briefId);
  const now = new Date().toISOString();
  fail(
    "Guardar los cambios",
    (
      await adminClient()
        .from("angle_briefs")
        .update({
          payload: applyEdit(b.payload!, parsed.data),
          edited_at: now,
          ...(approve ? { status: "approved", decided_at: now } : { status: "in_review" }),
          updated_at: now,
        })
        .eq("id", briefId)
    ).error,
  );
}
