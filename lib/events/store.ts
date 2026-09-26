// Eventos en Supabase (docs/spec-eventos.md): el calendario, lo que activa cada comerciante, los
// textos del evento por producto (IA) y su publicación en el metafield dropflex.event.
// Escrituras con service_role, siempre filtradas por el usuario.
import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import type { CustomerAvatar } from "@/lib/ai/schemas";
import { recordAiGeneration } from "@/lib/ai/track";
import { fail } from "@/lib/angles/store";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { allowedAmounts } from "@/lib/copy/schemas";
import { activeComponents, currentContent } from "@/lib/copy/store";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection, type ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { DEFAULT_MARKET, type Market } from "@/lib/market";
import { approvedAngles } from "@/lib/pipeline/angles";
import { getDifferentiator } from "@/lib/competitors/store";
import { testAngleName } from "@/lib/angles/catalog";
import { OptimizeError } from "@/lib/pipeline/optimize";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { ProductApiError } from "@/lib/products/http";
import { getProductRow, latestAvatars } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { SHARED_METAFIELDS } from "@/lib/shopify/components/define";
import { deleteMetafields, setMetafields } from "@/lib/shopify/publish/metafields";
import { activationOverridesSchema, eventTheme, INTENSITIES, type Intensity } from "./catalog";
import { EVENT_COPY_PROMPT_VERSION, eventCopyProblems, eventCopySchema, eventCopySystem, eventCopyUser, type EventCopy } from "./copy";
import { eventMetafield, resolveProductEvents, type ActivationRow, type ApprovedEventCopy, type EventRow } from "./resolve";

/** Una escritura de textos que no terminó en este plazo se da por fallida (la instancia murió). */
const STALE_MS = 5 * 60 * 1000;
/** Tope de textos de evento por comerciante en 24 h. */
const DAILY_COPIES = 40;

export interface EventCopyRow {
  id: string;
  user_id: string;
  product_id: string;
  event_id: string;
  status: "generating" | "generated" | "approved" | "failed";
  proposal: EventCopy | null;
  content: EventCopy | null;
  error_message: string | null;
  decided_at: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------- Calendario

/** Los eventos del mercado que no terminaron hace más de 30 días, en orden de fecha. */
export async function listEvents(market: string, now = Date.now()): Promise<EventRow[]> {
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const { data, error } = await adminClient()
    .from("events")
    .select("id, slug, kind, name, market, campaign_starts_at, starts_at, ends_at, priority, theme")
    .eq("market", market)
    .eq("status", "published")
    .gte("ends_at", since)
    .order("campaign_starts_at");
  fail("Leer el calendario de eventos", error);
  return (data ?? []) as EventRow[];
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const { data, error } = await adminClient()
    .from("events")
    .select("id, slug, kind, name, market, campaign_starts_at, starts_at, ends_at, priority, theme")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  fail("Leer el evento", error);
  return (data as EventRow | null) ?? null;
}

// ---------------------------------------------------------------- Activaciones

export async function listActivations(userId: string): Promise<ActivationRow[]> {
  const { data, error } = await adminClient()
    .from("event_activations")
    .select("id, event_id, product_id, enabled, intensity, overrides, starts_at, ends_at, updated_at")
    .eq("user_id", userId);
  fail("Leer tus eventos", error);
  return (data ?? []) as ActivationRow[];
}

export interface ActivationInput {
  productId: string | null;
  enabled?: boolean;
  intensity?: unknown;
  overrides?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
}

const isoOrNull = (v: unknown, field: string): string | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new ProductApiError("Elige una fecha válida.", 400, field);
  return new Date(v).toISOString();
};

/** Crea o cambia la activación de la tienda (productId null) o de un producto. Valida todo en el servidor. */
export async function saveActivation(userId: string, event: EventRow, input: ActivationInput): Promise<void> {
  if (input.productId && !(await getProductRow(userId, input.productId))) throw new ProductApiError("No encontramos ese producto.", 404);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.intensity !== undefined) {
    if (!INTENSITIES.includes(input.intensity as Intensity)) throw new ProductApiError("Elige una intensidad.", 400, "intensity");
    patch.intensity = input.intensity;
  }
  if (input.overrides !== undefined) {
    const parsed = activationOverridesSchema.safeParse(input.overrides ?? {});
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "overrides");
      throw new ProductApiError(field === "accent" ? "Escribe el color en formato hex, por ejemplo #1f4bd8." : "Revisa el largo de los textos del evento.", 400, field);
    }
    patch.overrides = parsed.data;
  }
  if (input.startsAt !== undefined) patch.starts_at = isoOrNull(input.startsAt, "startsAt");
  if (input.endsAt !== undefined) patch.ends_at = isoOrNull(input.endsAt, "endsAt");
  const from = (patch.starts_at as string | null | undefined) ?? event.campaign_starts_at;
  const to = (patch.ends_at as string | null | undefined) ?? event.ends_at;
  if (Date.parse(from) >= Date.parse(to)) throw new ProductApiError("La fecha de término tiene que ser después del inicio.", 400, "endsAt");

  const db = adminClient();
  let query = db.from("event_activations").select("id").eq("user_id", userId).eq("event_id", event.id);
  query = input.productId ? query.eq("product_id", input.productId) : query.is("product_id", null);
  const existing = await query.maybeSingle();
  fail("Leer tu evento", existing.error);
  if (existing.data) {
    fail("Guardar tu evento", (await db.from("event_activations").update(patch).eq("id", (existing.data as { id: string }).id)).error);
  } else {
    fail("Activar el evento", (await db.from("event_activations").insert({ user_id: userId, event_id: event.id, product_id: input.productId, ...patch })).error);
  }
}

/** Quita la activación (la de la tienda o la de un producto, que vuelve a heredar la de la tienda). */
export async function removeActivation(userId: string, eventId: string, productId: string | null): Promise<void> {
  let q = adminClient().from("event_activations").delete().eq("user_id", userId).eq("event_id", eventId);
  q = productId ? q.eq("product_id", productId) : q.is("product_id", null);
  fail("Quitar el evento", (await q).error);
}

// ---------------------------------------------------------------- Textos del evento (IA)

const copyColumns = "id, user_id, product_id, event_id, status, proposal, content, error_message, decided_at, updated_at";

export async function listEventCopies(userId: string, filter: { productId?: string; eventId?: string }): Promise<EventCopyRow[]> {
  let q = adminClient().from("event_copy").select(copyColumns).eq("user_id", userId);
  if (filter.productId) q = q.eq("product_id", filter.productId);
  if (filter.eventId) q = q.eq("event_id", filter.eventId);
  const { data, error } = await q;
  fail("Leer los textos del evento", error);
  const rows = (data ?? []) as EventCopyRow[];
  // Lo colgado se da por fallido (la instancia murió a mitad).
  const stale = rows.filter((r) => r.status === "generating" && Date.now() - Date.parse(r.updated_at) > STALE_MS);
  if (stale.length) {
    await adminClient().from("event_copy").update({ status: "failed", error_message: "La escritura se cortó. Intenta de nuevo.", updated_at: new Date().toISOString() }).in("id", stale.map((r) => r.id));
    for (const r of stale) Object.assign(r, { status: "failed", error_message: "La escritura se cortó. Intenta de nuevo." });
  }
  return rows;
}

export const copyOf = (r: Pick<EventCopyRow, "content" | "proposal">): EventCopy | null => r.content ?? r.proposal;

export function approvedCopies(rows: EventCopyRow[]): ApprovedEventCopy[] {
  return rows.flatMap((r) => {
    const c = r.status === "approved" ? copyOf(r) : null;
    return c ? [{ event_id: r.event_id, ...c }] : [];
  });
}

const dateLabel = (iso: string, timeZone: string) => new Intl.DateTimeFormat("es-CL", { timeZone, day: "numeric", month: "long" }).format(new Date(iso));

/** Lo que necesita la llamada: la ficha aprobada, el cliente ideal, el diferenciador, los ángulos y el precio. */
async function copyContext(userId: string, productId: string) {
  const [components, avatars, briefs, pricing, labels, differentiator] = await Promise.all([
    activeComponents(userId, [productId]).then((m) => m.get(productId) ?? []),
    latestAvatars(userId, [productId]),
    approvedAngles(userId, productId),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    getDifferentiator(userId, productId),
  ]);
  const listingRow = components.find((c) => c.component === LISTING && c.status === "approved");
  const avatar = avatars.get(productId);
  if (!listingRow) throw new OptimizeError("Aprueba la ficha en Página del producto: los textos del evento parten de ella.", 409);
  if (!avatar || avatar.status !== "approved" || !briefs || !pricing) throw new OptimizeError("Aprueba tu cliente ideal y los desarrollos de tus ángulos primero.", 409);
  return {
    listing: currentContent(listingRow) as Listing,
    avatarSummary: (avatar.payload as CustomerAvatar).summary,
    differentiator: differentiator.value ? { versus: differentiator.value.versus, claim: differentiator.value.claim } : null,
    angles: briefs.map((b) => testAngleName({ ...b.angle, frame: b.brief.angle })),
    pricing,
    labels: labels?.status === "approved" ? labels.payload : undefined,
  };
}

/** Deja la escritura «generando» y la corre en segundo plano. Tocar dos veces no cobra dos veces. */
export async function startEventCopy(userId: string, productId: string, event: EventRow): Promise<void> {
  await copyContext(userId, productId); // Falla antes de cobrar si falta algo.
  const db = adminClient();
  const current = (await listEventCopies(userId, { productId, eventId: event.id }))[0];
  if (current?.status === "generating") return;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("step", "event_copy").gte("created_at", since);
  if ((recent.count ?? 0) >= DAILY_COPIES) throw new OptimizeError(`Llegaste al máximo de ${DAILY_COPIES} textos de evento en 24 horas. Vuelve mañana o escríbelos a mano.`, 429);
  const now = new Date().toISOString();
  const { error } = await db
    .from("event_copy")
    .upsert({ user_id: userId, product_id: productId, event_id: event.id, status: "generating", error_message: null, updated_at: now }, { onConflict: "product_id,event_id" });
  fail("Empezar los textos del evento", error);
  after(() => runEventCopy(userId, productId, event).catch((e) => console.error("[event-copy]", e)));
}

/** Pensada para `after()`: nunca lanza; deja el resultado en la fila. */
export async function runEventCopy(userId: string, productId: string, event: EventRow): Promise<void> {
  const db = adminClient();
  const save = (patch: Record<string, unknown>) =>
    db.from("event_copy").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("product_id", productId).eq("event_id", event.id);
  try {
    const conn = await getShopifyConnection(userId);
    const [ctx, { market }] = await Promise.all([copyContext(userId, productId), getMarket(userId, conn)]);
    const theme = eventTheme(event.kind, event.theme);
    const input = {
      ...ctx,
      event: { name: event.name, startsLabel: dateLabel(event.campaign_starts_at, market.timezone ?? DEFAULT_MARKET.timezone!), endsLabel: dateLabel(event.ends_at, market.timezone ?? DEFAULT_MARKET.timezone!), theme },
    };
    const facts = { currency: ctx.pricing.currency, amounts: allowedAmounts(ctx.pricing) };
    let problems: string[] = [];
    let data: EventCopy | null = null;
    let model: string | null = null;
    for (let i = 0; i < 2; i++) {
      const result = await generateStructured({
        system: eventCopySystem(market as Market),
        content: [{ type: "text", text: eventCopyUser(input, problems) }],
        schema: eventCopySchema,
        effort: "low",
        maxTokens: 4000,
      });
      problems = eventCopyProblems(result.data, facts);
      await recordAiGeneration({ userId, productId, step: "event_copy", detail: event.name, usage: result.usage, error: problems.length ? "invalid_copy" : null, problems });
      data = result.data;
      model = result.usage.model;
      if (!problems.length) break;
      console.warn("[event-copy] textos inválidos", problems);
    }
    if (problems.length || !data) throw new AiStepError("invalid_output", "La IA escribió textos que no cumplen las reglas. Toca Reintentar.", undefined, true);
    await save({ status: "generated", proposal: data, content: null, error_message: null, prompt_version: EVENT_COPY_PROMPT_VERSION, model, decided_at: null });
  } catch (e) {
    const known = e instanceof AiStepError || e instanceof OptimizeError;
    if (!known) console.error("[event-copy]", e);
    if (e instanceof AiStepError && !e.logged) await recordAiGeneration({ userId, productId, step: "event_copy", detail: event.name, usage: e.usage, error: e.code });
    await save({ status: "failed", error_message: known ? (e as Error).message : "No pudimos escribir los textos. Intenta de nuevo." });
  }
}

/** Guardar la hoja aprueba (con o sin cambios). `copy` null = aprobar la propuesta tal cual. */
export async function approveEventCopy(userId: string, productId: string, eventId: string, copy: EventCopy | null): Promise<void> {
  const row = (await listEventCopies(userId, { productId, eventId }))[0];
  if (!row || !row.proposal) throw new ProductApiError("Todavía no hay textos para este evento.", 409);
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from("event_copy")
    .update({ status: "approved", content: copy, decided_at: now, updated_at: now })
    .eq("id", row.id);
  fail("Aprobar los textos del evento", error);
}

/** Descartar vuelve a los textos por defecto del evento (la fila se borra). */
export async function discardEventCopy(userId: string, productId: string, eventId: string): Promise<void> {
  fail("Descartar los textos del evento", (await adminClient().from("event_copy").delete().eq("user_id", userId).eq("product_id", productId).eq("event_id", eventId)).error);
}

// ---------------------------------------------------------------- Publicar

export const EVENT_KEY = SHARED_METAFIELDS.event.key;

/** Lo que va en dropflex.event para un producto, o null (se borra). */
export async function eventMetafieldFor(userId: string, productId: string, market: string, now = Date.now()) {
  const [events, activations, copies] = await Promise.all([listEvents(market, now), listActivations(userId), listEventCopies(userId, { productId })]);
  return eventMetafield(resolveProductEvents(events, activations, productId, now), approvedCopies(copies), now);
}

export const eventFingerprint = (value: unknown) => createHash("md5").update(JSON.stringify(value ?? null)).digest("hex");

export async function marketOf(userId: string, conn: ShopifyConnection | null): Promise<string> {
  return (await getMarket(userId, conn)).market.countryCode;
}

/** Escribe (o borra) dropflex.event en un producto ya publicado y anota la huella. */
export async function publishProductEvent(conn: ShopifyConnection, userId: string, productId: string, productGid: string, present: boolean | null = null): Promise<boolean> {
  const value = await eventMetafieldFor(userId, productId, await marketOf(userId, conn));
  if (value) {
    await setMetafields(conn, productGid, [{ namespace: "dropflex", key: EVENT_KEY, type: SHARED_METAFIELDS.event.type, value: JSON.stringify(value) }]);
  } else if (present !== false) {
    await deleteMetafields(conn, productGid, [EVENT_KEY]).catch(() => undefined); // Si no existía, no hay nada que borrar.
  }
  const now = new Date().toISOString();
  fail(
    "Guardar la publicación del evento",
    (await adminClient().from("product_publications").update({ event_fingerprint: eventFingerprint(value), events_published_at: now }).eq("user_id", userId).eq("product_id", productId)).error,
  );
  return Boolean(value);
}
