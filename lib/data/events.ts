// Eventos para las pantallas (/events y /events/[slug]): el calendario del mercado de la tienda, lo
// que activó el comerciante, cómo se ve cada evento y, por producto, qué le toca y sus textos.
import "server-only";
import { accentCheck } from "@/lib/copy/accent";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { activeComponents, currentContent } from "@/lib/copy/store";
import { KIND_LABEL } from "@/lib/events/catalog";
import { effectiveWindow, eventPhase, resolveProductEvents, themeWithOverrides, type ActivationRow, type EventRow } from "@/lib/events/resolve";
import { copyOf, listActivations, listEventCopies, listEvents } from "@/lib/events/store";
import { dateInput, phaseLabel, rangeLabel } from "@/lib/events/view";
import { sessionUser } from "@/lib/integrations/session";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { countryName, DEFAULT_MARKET } from "@/lib/market";
import { staleEventProducts } from "@/lib/pipeline/events";
import { connectionProblem, getPublications } from "@/lib/pipeline/publish";
import { getPricingPlan } from "@/lib/pricing/store";
import { baseImage, listImageRows, listProductRows, withDisplayUrls } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import type { EventActivationView, EventDetail, EventLook, EventProductView, EventsOverview, EventView } from "@/lib/types";

async function context() {
  const user = await sessionUser();
  if (!user) return null;
  const conn = await getShopifyConnection(user.id);
  const { market } = await getMarket(user.id, conn);
  const timezone = market.timezone ?? DEFAULT_MARKET.timezone!;
  return { userId: user.id, conn, market: market.countryCode, timezone };
}

function activationView(a: ActivationRow, timezone: string): EventActivationView {
  return {
    enabled: a.enabled,
    intensity: a.intensity,
    overrides: (a.overrides ?? {}) as EventActivationView["overrides"],
    startsOn: a.starts_at ? dateInput(Date.parse(a.starts_at), timezone) : null,
    endsOn: a.ends_at ? dateInput(Date.parse(a.ends_at) - 1000, timezone) : null,
  };
}

function look(event: EventRow, overrides: unknown): EventLook {
  const t = themeWithOverrides(event, overrides);
  return {
    accent: t.accent,
    onAccent: accentCheck(t.accent).onAccent,
    surface: t.surface,
    onSurface: t.on_surface,
    badge: t.badge_label,
    announcement: t.announcement,
    decor: t.decor,
    earlyLabel: t.early_label,
    countdownDuring: t.countdown_during,
  };
}

function eventView(event: EventRow, activations: ActivationRow[], now: number, timezone: string): EventView {
  const store = activations.find((a) => a.event_id === event.id && !a.product_id) ?? null;
  const w = effectiveWindow(event, store);
  const phase = eventPhase(w, now);
  return {
    slug: event.slug,
    name: event.name,
    kindLabel: KIND_LABEL[event.kind],
    phase,
    phaseLabel: phaseLabel(phase, w, now, timezone),
    eventLabel: rangeLabel(Date.parse(event.starts_at), Date.parse(event.ends_at), timezone),
    windowLabel: rangeLabel(w.from, w.to, timezone),
    defaultStartsOn: dateInput(Date.parse(event.campaign_starts_at), timezone),
    defaultEndsOn: dateInput(Date.parse(event.ends_at) - 1000, timezone),
    look: look(event, store?.overrides),
    store: store ? activationView(store, timezone) : null,
    productOverrides: activations.filter((a) => a.event_id === event.id && a.product_id).length,
  };
}

async function overview(ctx: NonNullable<Awaited<ReturnType<typeof context>>>, now: number) {
  const [events, activations, stale, rows] = await Promise.all([
    listEvents(ctx.market, now),
    listActivations(ctx.userId),
    staleEventProducts(ctx.userId, ctx.market, now),
    listProductRows(ctx.userId),
  ]);
  const pubs = await getPublications(ctx.userId, rows.map((r) => r.id));
  const base: EventsOverview = {
    timezone: ctx.timezone,
    countryName: countryName(ctx.market),
    events: events.map((e) => eventView(e, activations, now, ctx.timezone)),
    connection: connectionProblem(ctx.conn),
    stale: stale.map((s) => ({ id: s.id, name: s.title })),
    publishedProducts: rows.filter((r) => pubs.get(r.id)?.status === "published").length,
  };
  return { base, events, activations, rows, pubs };
}

/** /events: el calendario con lo activado. null sin sesión. */
export async function getEventsOverview(at?: number): Promise<EventsOverview | null> {
  const ctx = await context();
  if (!ctx) return null;
  // La hora se lee después de la sesión: la página ya es dinámica (sin prerender con Date.now()).
  return (await overview(ctx, at ?? Date.now())).base;
}

/** El próximo evento que conviene preparar (para Hoy): el primero sin terminar, o null. */
export async function getNextEvent(at?: number): Promise<EventView | null> {
  const ctx = await context();
  if (!ctx) return null;
  const now = at ?? Date.now();
  const [events, activations] = await Promise.all([listEvents(ctx.market, now), listActivations(ctx.userId)]);
  const views = events.map((e) => eventView(e, activations, now, ctx.timezone)).filter((v) => v.phase !== "ended");
  return views[0] ?? null;
}

/** /events/[slug]: el evento, cómo se ve y qué le toca a cada producto. null si no existe. */
export async function getEventDetail(slug: string, at?: number): Promise<EventDetail | null> {
  const ctx = await context();
  if (!ctx) return null;
  const now = at ?? Date.now();
  const { base, events, activations, rows, pubs } = await overview(ctx, now);
  const event = events.find((e) => e.slug === slug);
  const view = base.events.find((e) => e.slug === slug);
  if (!event || !view) return null;

  const ids = rows.map((r) => r.id);
  const [components, copies, images, pricing] = await Promise.all([
    activeComponents(ctx.userId, ids),
    listEventCopies(ctx.userId, { eventId: event.id }),
    listImageRows(ctx.userId, ids),
    Promise.all(rows.map((r) => getPricingPlan(ctx.userId, r.id))),
  ]);
  const thumbs = rows.map((r) => baseImage(images.filter((i) => i.product_id === r.id))).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const urls = await withDisplayUrls(thumbs);

  const products: EventProductView[] = rows.map((r, i) => {
    const listingRow = (components.get(r.id) ?? []).find((c) => c.component === LISTING && c.status === "approved");
    const listing = listingRow ? (currentContent(listingRow) as Listing) : null;
    const resolved = resolveProductEvents([event], activations, r.id, Number.NEGATIVE_INFINITY)[0] ?? null;
    const own = activations.find((a) => a.event_id === event.id && a.product_id === r.id);
    const copy = copies.find((c) => c.product_id === r.id);
    const thumb = thumbs.find((t) => t.product_id === r.id);
    const plan = pricing[i];
    return {
      id: r.id,
      name: listing?.short_name ?? r.title,
      image: thumb ? (urls.get(thumb.id) ?? "") : "",
      published: pubs.get(r.id)?.status === "published",
      effective: resolved ? { scope: resolved.scope, intensity: resolved.intensity } : null,
      override: own ? activationView(own, ctx.timezone) : null,
      copy: copy ? { status: copy.status, text: copyOf(copy), error: copy.error_message } : null,
      copyLocked: listing ? null : "Aprueba la ficha en Página del producto para adaptar sus textos.",
      preview: {
        title: listing?.title ?? r.title,
        subtitle: listing?.short_description ?? "",
        price: plan?.salePrice ?? r.price ?? null,
        compareAt: plan?.compareAtPrice ?? r.compare_at_price ?? null,
        currency: plan?.currency ?? r.currency,
      },
    };
  });
  // Primero los publicados (son los que ve el comprador).
  products.sort((a, b) => Number(b.published) - Number(a.published));
  return { ...base, event: view, products };
}
