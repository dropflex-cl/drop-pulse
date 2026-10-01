import "server-only";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { retryableContent } from "@/lib/ai/content";
import { recordAiGeneration } from "@/lib/ai/track";
import type Anthropic from "@anthropic-ai/sdk";
import { angleForPrompt } from "@/lib/angles/approved";
import { ANGLES, testAngleName, type TestAngle } from "@/lib/angles/catalog";
import { frameHookTemplates, type AngleContext } from "@/lib/angles/prompts";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { chosenAngles, fail, getBriefRow, type RankingRow } from "@/lib/angles/store";
import { hooksContextText, hooksSystem, hooksTail, type HooksContext } from "@/lib/hooks/prompts";
import { hookProblems, hooksOutputSchema, hooksToPayload, type HooksOutput } from "@/lib/hooks/schemas";
import { adminClient } from "@/lib/integrations/admin";
import type { Market } from "@/lib/market";
import { imagesForGeneration, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { imageBlock } from "./images";
import { OptimizeError, requireAiKey } from "./optimize";

// El agente de ganchos COD LatAm (agentes-creativos/hook-cod-latam.md, lib/hooks/): escribe los 10
// ganchos de un ángulo justo después de su desarrollo (runBrief) y otra vez con «Otros ganchos». Lo
// que valida el código (largos, patrones, montos, política, material real) vuelve al modelo hasta
// HOOK_ATTEMPTS veces.

const HOOK_ATTEMPTS = 3;
/**
 * Dentro de runBrief van después del desarrollo (effort high, 1–2 min) en la misma función de 300 s:
 * un intento menos. Si no salen, el desarrollo se guarda igual y se piden con «Otros ganchos».
 */
export const HOOK_ATTEMPTS_AFTER_BRIEF = 2;
/** Tope de «Otros ganchos» por comerciante en 24 h (cada uno puede ser hasta 3 llamadas). */
const DAILY_REGENERATIONS = 30;

/** La foto base del producto para el modelo, o null si no hay o no se puede leer (los ganchos siguen sin ella). */
export async function baseImageBlock(userId: string, productId: string): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  const [row] = imagesForGeneration(await listImageRows(userId, [productId]));
  if (!row) return null;
  const url = (await withDisplayUrls([row])).get(row.id);
  return url ? imageBlock(url).catch(() => null) : null;
}

export interface WriteHooksInput {
  userId: string;
  productId: string;
  market: Market;
  ctx: AngleContext;
  angle: TestAngle;
  /** El desarrollo del ángulo (los ganchos que traiga se ignoran). */
  payload: Omit<AngleBriefPayload, "hooks" | "recommended_hook"> & Partial<Pick<AngleBriefPayload, "hooks" | "recommended_hook">>;
  others: TestAngle[];
  image: Anthropic.Beta.BetaImageBlockParam | null;
  /** Los ganchos que ya tenía el ángulo («Otros ganchos»): no se repiten. */
  avoid?: string[];
  attempts?: number;
}

/** Escribe y valida los ganchos. Registra cada intento; lanza AiStepError ya registrado si no salen. */
export async function writeHooks(w: WriteHooksInput): Promise<HooksOutput> {
  const detail = `${w.angle.slot} · ${testAngleName(w.angle)}`;
  const hooksCtx: HooksContext = {
    brief: w.ctx.brief,
    avatar: w.ctx.avatar,
    pricing: w.ctx.pricing,
    labels: w.ctx.labels,
    differentiator: w.ctx.differentiator,
    angle: angleForPrompt(w.angle, { hooks: [], recommended_hook: 0, ...w.payload } as AngleBriefPayload),
    others: w.others.map((o) => `«${testAngleName(o)}» (${ANGLES[o.frame].name})`),
    frameTemplates: frameHookTemplates(w.angle.frame),
    hasImage: Boolean(w.image),
  };
  const facts = {
    pricing: w.ctx.pricing,
    hasRealReviews: w.ctx.brief.proof.real_reviews.some((r) => r.trim()),
    hasRealExpert: Boolean(w.ctx.brief.proof.real_expert?.trim()),
  };
  let problems: string[] = [];
  for (let attempt = 0; attempt < (w.attempts ?? HOOK_ATTEMPTS); attempt++) {
    let result;
    try {
      result = await generateStructured({
        userId: w.userId,
        system: hooksSystem(w.market),
        // La foto y el contexto con punto de caché: un reintento los lee a 0,1×.
        content: retryableContent(w.image ? [w.image] : [], hooksContextText(hooksCtx), hooksTail(problems, w.avoid)),
        schema: hooksOutputSchema,
        effort: "medium",
        maxTokens: 16000,
      });
    } catch (e) {
      if (e instanceof AiStepError) {
        await recordAiGeneration({ userId: w.userId, productId: w.productId, step: "angle_hooks", detail, usage: e.usage, error: e.code });
        throw new AiStepError(e.code, e.message, e.usage, true);
      }
      throw e;
    }
    problems = hookProblems(result.data, facts);
    await recordAiGeneration({ userId: w.userId, productId: w.productId, step: "angle_hooks", detail, usage: result.usage, error: problems.length ? "invalid_hooks" : null, problems });
    if (!problems.length) return result.data;
    console.warn("[hooks] ganchos inválidos", problems);
  }
  throw new AiStepError("invalid_hooks", "La IA escribió ganchos que no cumplen las reglas. Toca Otros ganchos.", undefined, true);
}

/** «Otros ganchos»: reescribe solo los ganchos de un desarrollo. No cambia su aprobación ni lo demás. */
export async function regenerateHooks(userId: string, productId: string, briefId: string, contextFor: (r: RankingRow) => Promise<AngleContext>): Promise<void> {
  await requireAiKey(userId);
  const b = await getBriefRow(userId, productId, briefId);
  if (!b || b.status === "rejected") throw new OptimizeError("Ese desarrollo ya no está vigente. Actualiza la página.", 409);
  if (b.generation !== "succeeded" || !b.payload) throw new OptimizeError("Este desarrollo todavía no está listo.", 409);

  const db = adminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("step", "angle_hooks").gte("created_at", since);
  fail("Contar los ganchos", recent.error);
  if ((recent.count ?? 0) >= DAILY_REGENERATIONS * HOOK_ATTEMPTS) throw new OptimizeError("Llegaste al máximo de ganchos nuevos por hoy. Vuelve mañana o edítalos a mano.", 429);

  const { data: rankingData, error } = await db.from("angle_rankings").select("*").eq("id", b.ranking_id).single();
  fail("Leer la evaluación", error);
  const ranking = rankingData as RankingRow;
  const chosen = chosenAngles(ranking);
  const angle = chosen.find((a) => a.slot === b.slot) ?? { slot: b.slot, frame: b.angle, title: "", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" };
  let out: HooksOutput;
  try {
    out = await writeHooks({
      userId,
      productId,
      market: ranking.input.market as Market,
      ctx: await contextFor(ranking),
      angle: { ...angle, frame: b.angle },
      payload: b.payload,
      others: chosen.filter((a) => a.slot !== b.slot),
      image: await baseImageBlock(userId, productId),
      avoid: b.payload.hooks.map((h) => h.text),
    });
  } catch (e) {
    if (e instanceof AiStepError) throw new OptimizeError(e.message, 502);
    throw e;
  }
  const current = await getBriefRow(userId, productId, briefId);
  if (!current?.payload || current.status === "rejected") throw new OptimizeError("Ese desarrollo cambió mientras escribíamos. Actualiza la página.", 409);
  const now = new Date().toISOString();
  fail("Guardar los ganchos", (await db.from("angle_briefs").update({ payload: { ...current.payload, ...hooksToPayload(out) }, updated_at: now }).eq("id", briefId)).error);
}
