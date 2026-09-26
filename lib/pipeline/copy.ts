import "server-only";
import { GALLERY_MIN } from "@/lib/page-images/catalog";
import { pageImageCounts } from "@/lib/page-images/store";
import { AiStepError } from "@/lib/ai/claude";
import { recordAiGeneration } from "@/lib/ai/track";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import { stampEntries } from "@/lib/angles/approved";
import { anglesForPrompt, fail } from "@/lib/angles/store";
import { getDifferentiator } from "@/lib/competitors/store";
import { catalogImages } from "@/lib/copy/images";
import { LISTING } from "@/lib/copy/listing";
import { productFactText, schemaProblems, toWrite } from "@/lib/copy/page-schema";
import { avatarStamp, differentiatorStamp, type CopyContextStamp } from "@/lib/copy/stale";
import type { CopyContext } from "@/lib/copy/prompts";
import { writePage } from "@/lib/copy/write";
import { COPY_PROMPT_VERSION, allowedAmounts } from "@/lib/copy/schemas";
import { activeComponents, currentContent, getComponentRow, type BriefStamp, type CopyRunRow } from "@/lib/copy/store";
import { approvedAngles } from "./angles";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { getProductRow, latestAvatars, latestBrief, latestBriefId } from "@/lib/products/store";
import { approvedReviewRows, displayText } from "@/lib/reviews/rows";
import { getMarket } from "@/lib/settings/market";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import type { ImagePick } from "@/lib/types";
import { OptimizeError } from "./optimize";

// Etapa Página del producto (docs/spec-pagina-componentes.md). Con los 2 desarrollos de ángulo
// aprobados, UNA llamada a Claude escribe la ficha y el contenido de cada componente de conversión
// del catálogo. El comerciante elige cuáles usa en la página, los edita y los aprueba. «Reescribir»
// vuelve a escribir lo que no está aprobado y conserva lo aprobado.

/** Tope de escrituras por comerciante en 24 h (cada una es una llamada a Claude Opus). */
const DAILY_RUNS = 20;

async function freeShipping(userId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("merchant_settings").select("free_shipping").eq("user_id", userId).maybeSingle();
  fail("Leer cómo despacha la tienda", error);
  return (data as { free_shipping: boolean } | null)?.free_shipping ?? true;
}

async function loadContext(userId: string, productId: string) {
  const [product, brief, avatars, pricing, labels, briefs, counts] = await Promise.all([
    getProductRow(userId, productId),
    latestBrief(userId, productId),
    latestAvatars(userId, [productId]),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    approvedAngles(userId, productId),
    pageImageCounts(userId, [productId]),
  ]);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief || !pricing) throw new OptimizeError("Aprueba tu cliente ideal y guarda el precio en Información base.", 409);
  if (!briefs) throw new OptimizeError("Aprueba los desarrollos de tus ángulos para escribir la página.", 409);
  // Imágenes va antes: los componentes de la página usan las imágenes elegidas.
  const images = counts(productId);
  if (!images.cover || images.gallery < GALLERY_MIN) throw new OptimizeError(`Elige la portada y al menos ${GALLERY_MIN} imágenes de galería en Imágenes para escribir la página.`, 409);
  return { product, brief, avatar, pricing: pricing as PricingPlan, labels: labels?.status === "approved" ? labels.payload : undefined, briefs };
}

/**
 * Cómo se reescribe (docs/spec-angulos-testeo.md §5.8):
 * - `missing` («Escribir» y «Reescribir lo no aprobado»): lo que no está aprobado y lo que falta;
 * - `all` («Reescribir toda la página»): todo, también lo aprobado (queda con superseded_at);
 * - `only` («Volver a escribir con IA» en la hoja de un componente): solo ese, aunque esté aprobado.
 */
export type CopyMode = { kind: "missing" } | { kind: "all" } | { kind: "only"; component: string };

/**
 * Crea la escritura (queued). En modo `missing` sin `redo`, devuelve la activa o, si la página ya
 * está escrita, nada nuevo: tocar dos veces no cobra dos veces.
 */
export async function startCopy(userId: string, productId: string, redo = false, mode: CopyMode = { kind: "missing" }): Promise<{ run: CopyRunRow | null; created: boolean }> {
  const ctx = await loadContext(userId, productId);
  const db = adminClient();
  const active = await db.from("copy_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la escritura", active.error);
  if (active.data) return { run: active.data as CopyRunRow, created: false };
  const rows = (await activeComponents(userId, [productId])).get(productId) ?? [];
  if (mode.kind === "missing" && rows.length && !redo) return { run: null, created: false };
  const reviews = await approvedReviewRows(userId, productId);
  if (mode.kind === "missing" && redo && rows.length && !toWrite(rows, reviews.length).length) throw new OptimizeError("Ya aprobaste toda la página: no hay nada que reescribir.", 409);
  if (mode.kind === "only") {
    const def = mode.component === LISTING ? true : componentById(mode.component);
    if (!def || !toWrite([], reviews.length).includes(mode.component)) throw new OptimizeError("Ese componente no se puede escribir ahora.", 400);
  }
  if (mode.kind !== "missing" && !rows.length) throw new OptimizeError("Primero escribe la página.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db.from("copy_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las escrituras", countError);
  if ((count ?? 0) >= DAILY_RUNS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_RUNS} escrituras de la página en 24 horas. Vuelve mañana.`, 429);

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const briefs: BriefStamp = ctx.briefs.map((b) => ({ id: b.brief.id, edited_at: b.brief.edited_at }));
  // La huella del contexto: si después cambia, la pantalla ofrece reescribir toda la página (lib/copy/stale.ts).
  const [briefId, differentiator] = await Promise.all([latestBriefId(userId, productId), getDifferentiator(userId, productId)]);
  const context: CopyContextStamp = { avatar: avatarStamp(ctx.avatar), brief: briefId, differentiator: differentiatorStamp(differentiator.value), prompt_version: COPY_PROMPT_VERSION };
  const { data, error } = await db
    .from("copy_runs")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "queued",
      input: {
        market,
        pricing: ctx.pricing,
        labels: ctx.labels ?? null,
        avatar_id: ctx.avatar.id,
        briefs,
        context,
        free_shipping: await freeShipping(userId),
        redo: mode.kind === "missing" ? redo && rows.length > 0 : true,
        mode,
      },
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

/** Orden en la página: la ficha primero y los componentes en el orden del catálogo. */
const positionOf = (id: string) => (id === LISTING ? 0 : CATALOG.findIndex((c) => c.id === id) + 1);

type RunInput = { market: Market; pricing: PricingPlan; labels: PackLabel[] | null; avatar_id: string; briefs: BriefStamp; context?: CopyContextStamp; free_shipping: boolean; redo: boolean; mode?: CopyMode };

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
  const r = claimed.data as CopyRunRow & { input: RunInput };
  // Lo que estuvo mal en el último intento: queda en la fila si la escritura falla.
  let problems: string[] = [];
  try {
    const input = r.input;
    const [product, brief, avatarRow, angles, current, reviews, differentiator] = await Promise.all([
      getProductRow(r.user_id, r.product_id),
      latestBrief(r.user_id, r.product_id),
      db.from("customer_avatars").select("payload").eq("user_id", r.user_id).eq("id", input.avatar_id).single(),
      anglesForPrompt(r.user_id, stampEntries(input.briefs).map((b) => b.id)),
      activeComponents(r.user_id, [r.product_id]).then((m) => m.get(r.product_id) ?? []),
      approvedReviewRows(r.user_id, r.product_id),
      getDifferentiator(r.user_id, r.product_id),
    ]);
    fail("Leer el cliente ideal", avatarRow.error);
    if (!product || !brief || !avatarRow.data) throw new AiStepError("not_found", "El producto o su ficha ya no existen.");
    if (!angles) throw new AiStepError("not_found", "Un desarrollo de Ángulos ya no existe. Vuelve a aprobarlos.");

    const mode: CopyMode = input.mode ?? { kind: "missing" };
    // Lo aprobado que no se reescribe va como contexto: lo nuevo tiene que calzar con eso.
    const approved = mode.kind === "all" ? [] : mode.kind === "only" ? current.filter((c) => c.status === "approved" && c.component !== mode.component) : input.redo ? current.filter((c) => c.status === "approved") : [];
    const write = mode.kind === "all" ? toWrite([], reviews.length) : mode.kind === "only" ? [mode.component] : toWrite(approved, reviews.length);
    const returnDays = brief.proof.guarantee_days && brief.proof.guarantee_days > 0 ? brief.proof.guarantee_days : null;

    const ctx: CopyContext = {
      brief,
      avatar: avatarRow.data.payload as CustomerAvatar,
      pricing: input.pricing,
      labels: input.labels ?? undefined,
      angles,
      differentiator: differentiator.value,
      shopify: { title: product.title, description: product.description },
      countryCode: input.market.countryCode,
      freeShipping: input.free_shipping,
      returnDays,
      reviews: reviews.map((v) => ({ id: v.id, rating: v.rating, text: displayText(v), country: v.country ?? undefined, photos: v.photos.length })),
      write,
      approved: approved.map((a) => ({ component: a.component, content: currentContent(a) })),
    };
    // Los números de uso que puede citar la pregunta de duración: los que dio el comerciante.
    const facts = { currency: input.pricing.currency, amounts: allowedAmounts(input.pricing), reviewIds: reviews.map((v) => v.id), factText: productFactText(brief, product.base_info) };
    const written = await writePage({
      ctx,
      market: input.market,
      facts,
      onAttempt: async (a) => {
        await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "page_copy", usage: a.usage, error: a.problems.length ? "invalid_copy" : null, problems: a.problems });
        if (a.problems.length) console.warn(`[copy] página inválida${a.partial ? ` (corrección de ${a.parts.join(", ")})` : ""}`, a.problems);
      },
    });
    problems = written.problems;
    const { data, usage } = written;
    if (problems.length || !data || !usage) throw new AiStepError("invalid_output", "La IA escribió textos que no cumplen las reglas. Toca Reintentar.", undefined, true);

    const rows = write.map((id) => ({
      product_id: r.product_id,
      user_id: r.user_id,
      run_id: r.id,
      component: id,
      position: positionOf(id),
      proposal: id === LISTING ? data.listing : data.components[id],
      // La ficha siempre va en la página; los componentes los elige el comerciante.
      enabled: id === LISTING,
      status: "generated",
    }));
    const now = new Date().toISOString();
    // Primero se retira lo que se reemplaza (uno vigente por componente) y después se inserta. Si la
    // inserción falla, lo retirado vuelve: la página nunca queda a medias.
    // En `missing` lo aprobado nunca se toca; en `all` y `only` se reemplaza (queda con superseded_at).
    const replaced = current.filter((c) => write.includes(c.component) && (mode.kind !== "missing" || c.status !== "approved")).map((c) => c.id);
    if (replaced.length) fail("Reemplazar la página anterior", (await db.from("page_components").update({ superseded_at: now, updated_at: now }).in("id", replaced)).error);
    const inserted = await db.from("page_components").insert(rows);
    if (inserted.error) {
      if (replaced.length) await db.from("page_components").update({ superseded_at: null, updated_at: now }).in("id", replaced);
      fail("Guardar la página", inserted.error);
    }
    fail(
      "Guardar la escritura",
      (await db.from("copy_runs").update({ status: "succeeded", payload: data, prompt_version: COPY_PROMPT_VERSION, model: usage.model, finished_at: now, updated_at: now }).eq("id", r.id)).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[copy] escribir", e);
    if (known && !e.logged) await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "page_copy", usage: e.usage, error: e.code });
    const now = new Date().toISOString();
    const { error } = await db
      .from("copy_runs")
      .update({
        status: "failed",
        error_code: known ? e.code : "unexpected",
        error_message: known ? e.message : "No pudimos terminar de escribir la página. Toca Reintentar.",
        problems: problems.length ? problems : null,
        finished_at: now,
        updated_at: now,
      })
      .eq("id", r.id);
    if (error) console.error("[copy] guardar la falla", error.message);
  }
}

// ---------------------------------------------------------------- Decidir

export interface ComponentPatch {
  /** Tu versión (valida con el esquema del componente). */
  content?: unknown;
  /** «Usar en la página». Activar aprueba. */
  enabled?: boolean;
  /** Las fotos elegidas para sus espacios de imagen. */
  images?: ImagePick[];
  /** Aprobar sin cambios (la ficha: «Aprobar ficha»). */
  approve?: boolean;
}

/** Por qué no se pueden guardar esas imágenes: espacio que no existe, de más, o que no es del producto. */
export function imageProblem(component: string, images: ImagePick[], allowed: Set<string>): string | null {
  const slots = componentById(component)?.imageSlots ?? [];
  for (const pick of images) {
    if (!slots.some((s) => s.key === pick.slot)) return "Ese componente no lleva esa imagen.";
    if (!allowed.has(`${pick.source}:${pick.id}`)) return "Esa imagen ya no está en el producto. Actualiza la página.";
  }
  for (const s of slots) {
    const n = images.filter((p) => p.slot === s.key).length;
    if (n > s.max) return `${s.label}: elige hasta ${s.max}.`;
  }
  return null;
}

/**
 * Guardar la hoja de edición (contenido e imágenes = aprobado y en la página), activar o desactivar
 * «Usar en la página» (activar = aprobado) o aprobar la ficha. Desactivar conserva el contenido.
 */
export async function updateComponent(userId: string, productId: string, component: string, patch: ComponentPatch) {
  const row = await getComponentRow(userId, productId, component);
  if (!row) throw new OptimizeError("Ese componente ya no está en la página. Actualiza.", 409);
  const listing = component === LISTING;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (patch.content !== undefined) {
    const problems = schemaProblems(component, patch.content);
    if (problems.length) throw new OptimizeError(problems[0].replace(/^[^:]+: /, ""), 400);
    const same = JSON.stringify(patch.content) === JSON.stringify(row.proposal);
    update.content = same ? null : patch.content;
  }
  if (patch.images !== undefined) {
    if (listing) throw new OptimizeError("La ficha no lleva imágenes aquí: están en la etapa Imágenes.", 400);
    const allowed = new Set((await catalogImages(userId, productId, false)).map((i) => `${i.source}:${i.id}`));
    const problem = imageProblem(component, patch.images, allowed);
    if (problem) throw new OptimizeError(problem, 400);
    update.images = patch.images;
  }
  if (patch.enabled !== undefined && !listing) {
    const def = componentById(component);
    if (patch.enabled && def?.minReviews && (await approvedReviewRows(userId, productId)).length < def.minReviews) {
      throw new OptimizeError("Aprueba reseñas en la etapa Reseñas para usar este componente.", 409);
    }
    update.enabled = patch.enabled;
  }
  // Guardar la hoja, activar o aprobar la ficha deja el componente aprobado.
  const approves = patch.approve || patch.content !== undefined || patch.images !== undefined || patch.enabled === true;
  if (approves) {
    update.status = "approved";
    update.decided_at = now;
    if (!listing && (patch.content !== undefined || patch.images !== undefined) && patch.enabled === undefined) update.enabled = true;
  }
  fail("Guardar el componente", (await adminClient().from("page_components").update(update).eq("id", row.id)).error);
}

/**
 * «Deshacer» después de «Volver a escribir con IA»: la versión anterior de ese componente vuelve a
 * ser la vigente y la nueva queda como reemplazada (docs/spec-angulos-testeo.md §5.8).
 */
export async function restoreComponent(userId: string, productId: string, component: string): Promise<void> {
  const db = adminClient();
  const current = await getComponentRow(userId, productId, component);
  if (!current) throw new OptimizeError("Ese componente ya no está en la página. Actualiza.", 409);
  const { data, error } = await db
    .from("page_components")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("component", component)
    .not("superseded_at", "is", null)
    .lt("created_at", current.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Leer la versión anterior", error);
  if (!data) throw new OptimizeError("No hay una versión anterior de este componente.", 409);
  const now = new Date().toISOString();
  // Primero se aparta la nueva: el índice único admite un solo componente vigente.
  fail("Apartar la versión nueva", (await db.from("page_components").update({ superseded_at: now, updated_at: now }).eq("id", current.id)).error);
  const back = await db.from("page_components").update({ superseded_at: null, updated_at: now }).eq("id", (data as { id: string }).id);
  if (back.error) {
    await db.from("page_components").update({ superseded_at: null, updated_at: now }).eq("id", current.id);
    fail("Recuperar la versión anterior", back.error);
  }
}
