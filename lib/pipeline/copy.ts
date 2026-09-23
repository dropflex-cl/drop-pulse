import "server-only";
import { AI_MODEL, AiStepError, generateStructured, type AiUsage } from "@/lib/ai/claude";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import { ANGLES, type AngleRole } from "@/lib/angles/catalog";
import { currentBriefs, fail, latestRankings, type BriefRow } from "@/lib/angles/store";
import { BLOCKS, blockDef, editProblem, joinFaq, type CopyKey } from "@/lib/copy/blocks";
import { copySystem, copyUser, type CopyContext } from "@/lib/copy/prompts";
import { COPY_PROMPT_VERSION, allowedAmounts, copyProblems, pageCopySchema, type CopyFacts } from "@/lib/copy/schemas";
import { activeItems, getItemRow, toCopyItems, type BriefStamp, type ContentItemRow, type CopyRunRow } from "@/lib/copy/store";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { getProductRow, latestAvatars, latestBrief } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { OptimizeError } from "./optimize";

// Etapa Textos: la página del producto (docs/spec-textos.md). Con los 2 desarrollos de ángulo
// aprobados, el redactor de página escribe los bloques; el comerciante acepta, edita o descarta cada
// uno. «Rehacer descartados» reescribe lo que no está aprobado y conserva lo aprobado.

/** Tope de escrituras por comerciante en 24 h (cada una es una llamada a Claude Opus). */
const DAILY_RUNS = 20;

async function logGeneration(userId: string, productId: string, usage: AiUsage | undefined, error?: string) {
  const { error: dbError } = await adminClient()
    .from("ai_generations")
    .insert({
      user_id: userId,
      product_id: productId,
      step: "page_copy",
      model: usage?.model ?? AI_MODEL,
      status: error ? "failed" : "succeeded",
      error_code: error ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cache_read_tokens: usage?.cacheReadTokens ?? null,
      cache_write_tokens: usage?.cacheWriteTokens ?? null,
      cost_usd: usage?.costUsd ?? null,
      latency_ms: usage?.latencyMs ?? null,
    });
  if (dbError) console.error("[copy] registrar la generación", dbError.message);
}

/** Los 2 desarrollos aprobados de la elección confirmada, o null si todavía no están. */
export async function approvedBriefs(userId: string, productId: string): Promise<Record<AngleRole, BriefRow> | null> {
  const ranking = (await latestRankings(userId, [productId])).get(productId);
  if (!ranking?.confirmed_at) return null;
  const briefs = (await currentBriefs(userId, [ranking.id])).get(ranking.id) ?? {};
  const ok = (b?: BriefRow) => b && b.generation === "succeeded" && b.status === "approved" && b.payload;
  return ok(briefs.primary) && ok(briefs.secondary) ? { primary: briefs.primary!, secondary: briefs.secondary! } : null;
}

async function freeShipping(userId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("merchant_settings").select("free_shipping").eq("user_id", userId).maybeSingle();
  fail("Leer cómo despacha la tienda", error);
  return (data as { free_shipping: boolean } | null)?.free_shipping ?? true;
}

async function loadContext(userId: string, productId: string) {
  const [product, brief, avatars, pricing, labels, briefs] = await Promise.all([
    getProductRow(userId, productId),
    latestBrief(userId, productId),
    latestAvatars(userId, [productId]),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    approvedBriefs(userId, productId),
  ]);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief || !pricing) throw new OptimizeError("Aprueba tu cliente ideal y guarda el precio en Información base.", 409);
  if (!briefs) throw new OptimizeError("Aprueba los 2 desarrollos de Ángulos para escribir la página.", 409);
  return { product, brief, avatar, pricing: pricing as PricingPlan, labels: labels?.status === "approved" ? labels.payload : undefined, briefs };
}

/**
 * Crea la escritura (queued). Sin `redo`, devuelve la activa o, si la página ya está escrita, nada
 * nuevo: tocar dos veces no cobra dos veces. Con `redo`, reescribe lo que no está aprobado.
 */
export async function startCopy(userId: string, productId: string, redo = false): Promise<{ run: CopyRunRow | null; created: boolean }> {
  const ctx = await loadContext(userId, productId);
  const db = adminClient();
  const active = await db.from("copy_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la escritura", active.error);
  if (active.data) return { run: active.data as CopyRunRow, created: false };
  const items = (await activeItems(userId, [productId])).get(productId) ?? [];
  if (items.length && !redo) return { run: null, created: false };
  if (redo && items.length && items.every((i) => i.status === "approved")) throw new OptimizeError("Ya aprobaste todos los textos: no hay nada que rehacer.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db.from("copy_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las escrituras", countError);
  if ((count ?? 0) >= DAILY_RUNS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_RUNS} escrituras de la página en 24 horas. Vuelve mañana.`, 429);

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const briefs: BriefStamp = {
    primary: { id: ctx.briefs.primary.id, edited_at: ctx.briefs.primary.edited_at },
    secondary: { id: ctx.briefs.secondary.id, edited_at: ctx.briefs.secondary.edited_at },
  };
  const { data, error } = await db
    .from("copy_runs")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "queued",
      // Copia de lo que se usa: si el comerciante cambia algo a mitad, la escritura no se mezcla.
      input: { market, pricing: ctx.pricing, labels: ctx.labels ?? null, avatar_id: ctx.avatar.id, briefs, free_shipping: await freeShipping(userId), redo: redo && items.length > 0 },
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const again = await db.from("copy_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la escritura", again.error);
    return { run: again.data as CopyRunRow, created: false };
  }
  fail("Crear la escritura", error);
  return { run: data as CopyRunRow, created: true };
}

async function briefById(userId: string, id: string): Promise<BriefRow> {
  const { data, error } = await adminClient().from("angle_briefs").select("*").eq("user_id", userId).eq("id", id).single();
  fail("Leer el desarrollo", error);
  if (!data?.payload) throw new AiStepError("not_found", "Un desarrollo de Ángulos ya no existe. Vuelve a aprobarlos.");
  return data as BriefRow;
}

/** Ejecuta la escritura. Pensada para `after()`: nunca lanza; deja el resultado en la fila. */
export async function runCopy(runId: string): Promise<void> {
  const db = adminClient();
  const claimed = await db
    .from("copy_runs")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return;
  const r = claimed.data as CopyRunRow & { input: { market: Market; pricing: PricingPlan; labels: PackLabel[] | null; avatar_id: string; briefs: BriefStamp; free_shipping: boolean; redo: boolean } };
  try {
    const input = r.input;
    const [product, brief, avatarRow, primary, secondary, current] = await Promise.all([
      getProductRow(r.user_id, r.product_id),
      latestBrief(r.user_id, r.product_id),
      db.from("customer_avatars").select("payload").eq("user_id", r.user_id).eq("id", input.avatar_id).single(),
      briefById(r.user_id, input.briefs.primary.id),
      briefById(r.user_id, input.briefs.secondary.id),
      activeItems(r.user_id, [r.product_id]).then((m) => m.get(r.product_id) ?? []),
    ]);
    fail("Leer el cliente ideal", avatarRow.error);
    if (!product || !brief || !avatarRow.data) throw new AiStepError("not_found", "El producto o su ficha ya no existen.");

    // Al reescribir: lo aprobado se conserva y va como contexto; lo demás se reemplaza.
    const views = toCopyItems(current);
    const approved = input.redo ? views.filter((v) => v.status === "aprobado") : [];
    const discarded = input.redo ? views.filter((v) => v.status === "rechazado") : [];
    const kept: Partial<Record<CopyKey, number>> = {};
    for (const a of approved) kept[a.key as CopyKey] = (kept[a.key as CopyKey] ?? 0) + 1;

    const ctx: CopyContext = {
      brief,
      avatar: avatarRow.data.payload as CustomerAvatar,
      pricing: input.pricing,
      labels: input.labels ?? undefined,
      primary: { name: ANGLES[primary.angle].name, payload: primary.payload! },
      secondary: { name: ANGLES[secondary.angle].name, payload: secondary.payload! },
      shopify: { title: product.title, description: product.description },
      countryCode: input.market.countryCode,
      freeShipping: input.free_shipping,
      approved: approved.map((a) => ({ label: a.label, text: a.text.replace("\n", " → ") })),
      discarded: discarded.map((d) => ({ label: d.label, text: d.text.replace("\n", " → ") })),
    };
    const facts: CopyFacts = { currency: input.pricing.currency, amounts: allowedAmounts(input.pricing), guaranteeDays: brief.proof.guarantee_days, kept };

    const write = (retry: string[]) =>
      generateStructured({
        system: copySystem(input.market),
        content: [{ type: "text", text: copyUser(ctx, retry) }],
        schema: pageCopySchema,
        effort: "medium",
        maxTokens: 12000,
      });
    let problems: string[] = [];
    let result: Awaited<ReturnType<typeof write>> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await write(problems);
      problems = copyProblems(result.data, facts);
      await logGeneration(r.user_id, r.product_id, result.usage, problems.length ? "invalid_copy" : undefined);
      if (!problems.length) break;
      console.warn("[copy] textos inválidos", problems);
    }
    if (problems.length || !result) throw new AiStepError("invalid_output", "La IA escribió textos que no cumplen las reglas. Toca Reintentar.");
    const { data, usage } = result;

    // Posición = orden del bloque en la página × 10 + su número; lo aprobado conserva la suya.
    const rows: Omit<ContentItemRow, "id" | "created_at" | "decided_at" | "edited_text">[] = [];
    BLOCKS.forEach((def, d) => {
      const keptRows = current.filter((c) => c.key === def.key && c.status === "approved");
      const room = Math.max(0, def.max - keptRows.length);
      let next = Math.max(-1, ...keptRows.map((k) => k.position - d * 10)) + 1;
      const fresh =
        def.key === "faq"
          ? data.faq.map((f) => ({ text: joinFaq(f.question, f.answer), angle: f.angle, note: f.note, missing: null as string | null }))
          : data.blocks.filter((b) => b.key === def.key).map((b) => ({ text: b.text.trim(), angle: b.angle, note: b.note, missing: b.missing }));
      for (const f of fresh.slice(0, room)) {
        rows.push({
          product_id: r.product_id,
          user_id: r.user_id,
          run_id: r.id,
          key: def.key,
          position: d * 10 + next++,
          original: def.key === "title" ? product.title : def.key === "how_it_works" ? product.description?.trim() || null : null,
          proposal: f.text,
          angle_role: f.angle === "none" ? null : f.angle,
          note: f.note?.trim() || null,
          missing: f.missing?.trim() || null,
          status: "generated",
        });
      }
    });
    const now = new Date().toISOString();
    if (rows.length) fail("Guardar los textos", (await db.from("content_items").insert(rows)).error);
    // Lo que no estaba aprobado queda reemplazado (se conserva en la base, fuera de la página).
    fail(
      "Reemplazar los textos anteriores",
      (await db.from("content_items").update({ superseded_at: now, updated_at: now }).eq("product_id", r.product_id).is("superseded_at", null).neq("run_id", r.id).neq("status", "approved")).error,
    );
    fail(
      "Guardar la escritura",
      (await db.from("copy_runs").update({ status: "succeeded", payload: data, prompt_version: COPY_PROMPT_VERSION, model: usage.model, finished_at: now, updated_at: now }).eq("id", r.id)).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[copy] escribir", e);
    if (known) await logGeneration(r.user_id, r.product_id, e.usage, e.code);
    const now = new Date().toISOString();
    const { error } = await db
      .from("copy_runs")
      .update({
        status: "failed",
        error_code: known ? e.code : "unexpected",
        error_message: known ? e.message : "No pudimos terminar de escribir la página. Toca Reintentar.",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", r.id);
    if (error) console.error("[copy] guardar la falla", error.message);
  }
}

// ---------------------------------------------------------------- Decidir

export type CopyDecision = "approve" | "reject" | "reopen";

/** Aceptar (con tu versión si traes `text`), descartar o volver a revisar (Deshacer). */
export async function decideItem(userId: string, productId: string, itemId: string, action: CopyDecision, text?: string) {
  const item = await getItemRow(userId, productId, itemId);
  if (!item) throw new OptimizeError("Ese texto ya no está vigente. Actualiza la página.", 409);
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (action === "approve") {
    const edited = text != null && text.trim() !== item.proposal.trim() ? text.trim() : null;
    if (edited != null) {
      const problem = editProblem(item.key, edited);
      if (problem) throw new OptimizeError(problem, 400);
    }
    patch = { status: "approved", edited_text: edited, decided_at: now };
  } else if (action === "reject") patch = { status: "rejected", decided_at: now };
  else patch = { status: "in_review", decided_at: null };
  if (!blockDef(item.key)) throw new OptimizeError("Ese bloque no existe.", 400);
  fail("Guardar tu decisión", (await adminClient().from("content_items").update({ ...patch, updated_at: now }).eq("id", itemId)).error);
}
