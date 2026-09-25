// Eventos, lo puro (docs/spec-eventos.md › Modelo de datos): qué eventos le tocan a un producto,
// con qué ventana y con qué capas, y lo que se publica en el metafield dropflex.event.
// El mismo resultado alimenta la vista previa de la app y la tienda: lo que se ve en DropFlex es
// lo que sale en Shopify. Sin red ni base (con tests).
import { accentCheck, normalizeHex } from "@/lib/copy/accent";
import {
  activationOverridesSchema,
  eventTheme,
  INTENSITY_LAYERS,
  type DecorKey,
  type EventKind,
  type EventTheme,
  type Intensity,
} from "./catalog";

export interface EventRow {
  id: string;
  slug: string;
  kind: EventKind;
  name: string;
  market: string;
  campaign_starts_at: string;
  starts_at: string;
  ends_at: string;
  priority: number;
  theme: unknown;
}

export interface ActivationRow {
  id: string;
  event_id: string;
  product_id: string | null;
  enabled: boolean;
  intensity: Intensity;
  overrides: unknown;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
}

/** Textos del evento para un producto (lib/events/copy.ts › EventCopy), ya aprobados. */
export interface ApprovedEventCopy {
  event_id: string;
  announcement: string;
  subtitle: string;
  badge_label: string;
}

/** Un evento que le toca a un producto, con todo resuelto. */
export interface ResolvedEvent {
  event: EventRow;
  /** De dónde sale: la activación del producto o la de la tienda. */
  scope: "product" | "store";
  activationId: string;
  intensity: Intensity;
  theme: EventTheme;
  /** Ventana visible en la tienda (antesala incluida), en ms. */
  from: number;
  to: number;
  /** Cuándo empieza el evento en sí (el contador cuenta hasta aquí antes, y hasta `to` durante). */
  start: number;
}

export type EventPhase = "upcoming" | "teaser" | "live" | "ended";

const ms = (iso: string) => Date.parse(iso);

/** Ventana efectiva: la de la activación o, si no tiene, la del evento (con antesala). */
export function effectiveWindow(event: EventRow, activation: Pick<ActivationRow, "starts_at" | "ends_at"> | null): { from: number; to: number; start: number } {
  const from = activation?.starts_at ? ms(activation.starts_at) : ms(event.campaign_starts_at);
  const to = activation?.ends_at ? ms(activation.ends_at) : ms(event.ends_at);
  // El evento en sí nunca empieza antes de lo que se ve.
  const start = Math.max(from, Math.min(ms(event.starts_at), to));
  return { from, to, start };
}

/** Dónde está el evento hoy: por venir, en antesala, en curso o terminado. */
export function eventPhase(window: { from: number; to: number; start: number }, now: number): EventPhase {
  if (now >= window.to) return "ended";
  if (now < window.from) return "upcoming";
  return now < window.start ? "teaser" : "live";
}

/** El tema final: el del evento con los cambios del comerciante. Un acento sin contraste AA se ignora. */
export function themeWithOverrides(event: EventRow, overrides: unknown): EventTheme {
  const theme = eventTheme(event.kind, event.theme);
  const parsed = activationOverridesSchema.safeParse(overrides ?? {});
  if (!parsed.success) return theme;
  const o = parsed.data;
  const accent = o.accent ? normalizeHex(o.accent) : null;
  return {
    ...theme,
    ...(accent && accentCheck(accent).ok ? { accent } : {}),
    ...(o.announcement ? { announcement: o.announcement } : {}),
    ...(o.badge_label ? { badge_label: o.badge_label } : {}),
  };
}

/**
 * Los eventos que le tocan a un producto, que no terminaron, del de mayor prioridad al de menor
 * (a igual prioridad, el que empieza antes). Reglas:
 * 1. La activación del producto le gana a la de la tienda para ese evento (también si lo apaga).
 * 2. Solo cuenta lo encendido y lo que todavía no termina.
 */
export function resolveProductEvents(events: EventRow[], activations: ActivationRow[], productId: string, now: number): ResolvedEvent[] {
  const byEvent = new Map(events.map((e) => [e.id, e]));
  const chosen = new Map<string, { a: ActivationRow; scope: "product" | "store" }>();
  for (const a of activations) {
    if (a.product_id && a.product_id !== productId) continue;
    const scope = a.product_id ? "product" : "store";
    const prev = chosen.get(a.event_id);
    if (!prev || (prev.scope === "store" && scope === "product")) chosen.set(a.event_id, { a, scope });
  }
  const out: ResolvedEvent[] = [];
  for (const [eventId, { a, scope }] of chosen) {
    const event = byEvent.get(eventId);
    if (!event || !a.enabled) continue;
    const w = effectiveWindow(event, a);
    if (w.to <= now) continue;
    out.push({ event, scope, activationId: a.id, intensity: a.intensity, theme: themeWithOverrides(event, a.overrides), ...w });
  }
  return out.sort((x, y) => y.event.priority - x.event.priority || x.from - y.from);
}

/** El que se ve ahora (el primero de la lista que está dentro de su ventana), o null. */
export function activeEvent(list: ResolvedEvent[], now: number): ResolvedEvent | null {
  return list.find((r) => r.from <= now && now < r.to) ?? null;
}

// ---------------------------------------------------------------- Metafield dropflex.event

/**
 * Cuántos eventos lleva el metafield: los más próximos (la tienda elige por hora). Los que quedan
 * fuera entran al publicar de nuevo cuando termina uno (la huella cambia y la app lo avisa).
 */
export const METAFIELD_EVENTS_MAX = 4;

/**
 * Lo que lee la tienda (snippets/df-event-*.liquid). Horas en segundos Unix: Liquid compara con
 * `'now' | date: '%s'` y el navegador vuelve a comprobar (Shopify guarda el HTML en caché).
 * Cada capa aparece solo si la intensidad la enciende.
 */
export interface EventMetafieldEntry {
  slug: string;
  kind: EventKind;
  name: string;
  from: number;
  start: number;
  to: number;
  intensity: Intensity;
  announcement: string;
  surface: string;
  on_surface: string;
  badge_label: string;
  /** Capa de color: el botón y la etiqueta toman el acento del evento. */
  accent?: string;
  on_accent?: string;
  /** Antesala: texto sin reloj («Precio Cyber adelantado · ya disponible»). */
  early_label?: string;
  countdown_during?: string;
  decor?: DecorKey;
  /** Bajada del evento (reemplaza a dropflex.subtitle mientras dura). */
  subtitle?: string;
}

export interface EventMetafield {
  events: EventMetafieldEntry[];
}

const sec = (n: number) => Math.floor(n / 1000);

export function metafieldEntry(r: ResolvedEvent, copy: ApprovedEventCopy | null): EventMetafieldEntry {
  const layers = INTENSITY_LAYERS[r.intensity];
  const t = r.theme;
  const useCopy = layers.copy && copy ? copy : null;
  return {
    slug: r.event.slug,
    kind: r.event.kind,
    name: r.event.name,
    from: sec(r.from),
    start: sec(r.start),
    to: sec(r.to),
    intensity: r.intensity,
    announcement: useCopy?.announcement || t.announcement,
    surface: t.surface,
    on_surface: t.on_surface,
    badge_label: useCopy?.badge_label || t.badge_label,
    ...(layers.tokens ? { accent: t.accent, on_accent: accentCheck(t.accent).onAccent } : {}),
    ...(layers.countdown ? { early_label: t.early_label, countdown_during: t.countdown_during } : {}),
    ...(layers.decor ? { decor: t.decor } : {}),
    ...(useCopy?.subtitle ? { subtitle: useCopy.subtitle } : {}),
  };
}

/**
 * El valor del metafield para un producto, o null si no hay nada que mostrar (se borra). Lleva los
 * METAFIELD_EVENTS_MAX más próximos, ordenados por prioridad: la tienda muestra el primero que está
 * dentro de su ventana.
 */
export function eventMetafield(list: ResolvedEvent[], copies: ApprovedEventCopy[], now: number): EventMetafield | null {
  const byEvent = new Map(copies.map((c) => [c.event_id, c]));
  const events = list
    .filter((r) => r.to > now)
    .sort((a, b) => a.from - b.from)
    .slice(0, METAFIELD_EVENTS_MAX)
    .sort((a, b) => b.event.priority - a.event.priority || a.from - b.from)
    .map((r) => metafieldEntry(r, byEvent.get(r.event.id) ?? null));
  return events.length ? { events } : null;
}
