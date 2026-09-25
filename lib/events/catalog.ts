// Eventos (docs/spec-eventos.md): el tema por defecto de cada tipo de evento y las capas que suma
// cada intensidad. Puro: sin I/O. Los hex viven aquí (lib/), nunca en components/ ni app/.
//
// Un evento de la tabla `events` toma el tema de su `kind` y le aplica `events.theme` (parcial);
// después la activación del comerciante aplica sus `overrides`. Todo pasa por `eventThemeSchema`.
import * as z from "zod/v4";
import { normalizeHex } from "@/lib/copy/accent";

export const EVENT_KINDS = ["cyber", "black_friday", "halloween", "singles_day", "christmas", "new_year", "summer_sale", "back_to_school"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Adorno del evento: un dibujo chico de snippets/df-event-decor.liquid (y de la vista previa). */
export const DECOR_KEYS = ["bolt", "tag", "pumpkin", "heart", "snowflake", "sparkles", "sun", "pencil"] as const;
export type DecorKey = (typeof DECOR_KEYS)[number];

export const INTENSITIES = ["subtle", "medium", "full"] as const;
export type Intensity = (typeof INTENSITIES)[number];

/** Qué capas enciende cada intensidad (spec › Concepto). Cada una incluye la anterior. */
export const INTENSITY_LAYERS: Record<Intensity, { badge: boolean; announcement: boolean; tokens: boolean; countdown: boolean; decor: boolean; copy: boolean }> = {
  subtle: { badge: true, announcement: true, tokens: false, countdown: false, decor: false, copy: false },
  medium: { badge: true, announcement: true, tokens: true, countdown: true, decor: false, copy: false },
  full: { badge: true, announcement: true, tokens: true, countdown: true, decor: true, copy: true },
};

export const INTENSITY_LABEL: Record<Intensity, { name: string; detail: string }> = {
  subtle: { name: "Sutil", detail: "Etiqueta en el precio y barra de aviso" },
  medium: { name: "Media", detail: "Además, el color del evento y la cuenta regresiva" },
  full: { name: "Total", detail: "Además, adornos y textos adaptados al evento" },
};

export const ANNOUNCEMENT_MAX = 90;
export const BADGE_MAX = 16;
export const COUNTDOWN_LABEL_MAX = 24;
export const EARLY_LABEL_MAX = 48;

const hex = z.string().refine((s) => normalizeHex(s) === s.toLowerCase() && s.length === 7, { message: "color en #rrggbb" });

export const eventThemeSchema = z.object({
  /** Botón y etiqueta del precio (texto encima: blanco o negro, el de más contraste). */
  accent: hex,
  /** Fondo y texto de la barra de aviso. */
  surface: hex,
  on_surface: hex,
  decor: z.enum(DECOR_KEYS),
  /** Etiqueta junto al precio: «BLACK» → «BLACK −40 %» si la variante tiene tachado real. */
  badge_label: z.string().min(1).max(BADGE_MAX),
  announcement: z.string().min(1).max(ANNOUNCEMENT_MAX),
  /**
   * Antes del evento (antesala), sin reloj: el precio del evento ya está disponible. Nunca «Empieza
   * en»: una cuenta hasta el inicio le dice al comprador que espere. Honesto solo porque el precio de
   * la antesala es el mismo del evento (la etiqueta sale del tachado real, igual en ambas fases).
   */
  early_label: z.string().min(1).max(EARLY_LABEL_MAX),
  /** Durante: «Termina en» (días; reloj en las últimas 48 h; «Último día» el día del término). */
  countdown_during: z.string().min(1).max(COUNTDOWN_LABEL_MAX),
  /** Para la IA: el concepto del evento (tono, qué siente el comprador). Nunca se muestra. */
  copy_concept: z.string().min(1).max(300),
});
export type EventTheme = z.infer<typeof eventThemeSchema>;

/** Lo que el comerciante puede cambiar en su activación. */
export const activationOverridesSchema = z
  .object({
    accent: hex.optional(),
    announcement: z.string().trim().min(1).max(ANNOUNCEMENT_MAX).optional(),
    badge_label: z.string().trim().min(1).max(BADGE_MAX).optional(),
  })
  .strict();
export type ActivationOverrides = z.infer<typeof activationOverridesSchema>;

/**
 * Tema por defecto de cada tipo. Contraste probado en catalog.test.ts: el acento pasa 4.5:1 con su
 * texto y 3:1 sobre blanco (accentCheck), y el texto de la barra 4.5:1 sobre su fondo.
 */
export const EVENT_THEMES: Record<EventKind, EventTheme> = {
  cyber: {
    accent: "#7e22ce",
    surface: "#1e1b4b",
    on_surface: "#ffffff",
    decor: "bolt",
    badge_label: "CYBER",
    announcement: "Cyber: precios especiales por pocos días",
    early_label: "Precio Cyber adelantado · ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Evento de compras online de pocos días: el comprador ya planeó comprar y compara precios. Tono directo y rápido: el precio de este evento y que termina pronto.",
  },
  black_friday: {
    accent: "#111827",
    surface: "#0a0a0a",
    on_surface: "#facc15",
    decor: "tag",
    badge_label: "BLACK",
    announcement: "Black Friday: el mejor precio del año hasta el lunes",
    early_label: "Precio Black Friday adelantado · ya disponible",
    countdown_during: "Termina en",
    copy_concept: "El evento de descuentos más grande del año. El comprador espera el precio más bajo y decide rápido. Tono seguro y urgente, sin exagerar: precio de Black Friday y fecha de término real.",
  },
  halloween: {
    accent: "#c2410c",
    surface: "#1c1917",
    on_surface: "#fb923c",
    decor: "pumpkin",
    badge_label: "HALLOWEEN",
    announcement: "Especial Halloween: date un gusto esta semana",
    early_label: "Precio Halloween adelantado · ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Fecha de tono lúdico, más decoración que descuento. Un guiño de Halloween (noche, dulce o truco) sin asustar y sin cambiar la promesa del producto.",
  },
  singles_day: {
    accent: "#be123c",
    surface: "#be123c",
    on_surface: "#ffffff",
    decor: "heart",
    badge_label: "11.11",
    announcement: "11.11: un día para darte un gusto",
    early_label: "Precio 11.11 adelantado · ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Día de compras de un solo día (11 de noviembre), nacido para regalarse a uno mismo. Tono cercano: un gusto propio que se merece, solo hoy.",
  },
  christmas: {
    accent: "#b91c1c",
    surface: "#14532d",
    on_surface: "#ffffff",
    decor: "snowflake",
    badge_label: "NAVIDAD",
    announcement: "Navidad: pide con tiempo y llega antes del 24",
    early_label: "Precio de Navidad ya disponible",
    countdown_during: "Quedan",
    copy_concept: "Temporada de regalos. El comprador busca un regalo que se use de verdad y que llegue a tiempo. Tono cálido: para quién es el regalo y por qué lo va a usar. Nunca prometas una fecha de entrega: la pone la tienda.",
  },
  new_year: {
    accent: "#92400e",
    surface: "#111827",
    on_surface: "#fcd34d",
    decor: "sparkles",
    badge_label: "AÑO NUEVO",
    announcement: "Año nuevo: empieza el año con lo que necesitas",
    early_label: "Precio de Año Nuevo ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Cierre de año y propósitos nuevos. Tono optimista: el producto como parte de empezar el año mejor, sin promesas de resultados.",
  },
  summer_sale: {
    accent: "#0e7490",
    surface: "#fef3c7",
    on_surface: "#78350f",
    decor: "sun",
    badge_label: "VERANO",
    announcement: "Liquidación de verano: precios especiales",
    early_label: "Precio de liquidación ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Liquidación de temporada en pleno verano (enero y febrero en el hemisferio sur). Tono relajado: vacaciones, calor, aprovechar el precio.",
  },
  back_to_school: {
    accent: "#1e3a8a",
    surface: "#1e3a8a",
    on_surface: "#ffffff",
    decor: "pencil",
    badge_label: "CLASES",
    announcement: "Vuelta a clases: prepárate para marzo",
    early_label: "Precio vuelta a clases ya disponible",
    countdown_during: "Termina en",
    copy_concept: "Regreso a clases y a la rutina de marzo. Tono práctico y ordenado: el producto ayuda a volver a la rutina.",
  },
};

export const KIND_LABEL: Record<EventKind, string> = {
  cyber: "Cyber",
  black_friday: "Black Friday",
  halloween: "Halloween",
  singles_day: "11.11",
  christmas: "Navidad",
  new_year: "Año Nuevo",
  summer_sale: "Verano",
  back_to_school: "Vuelta a clases",
};

/** El tema del evento: el de su tipo con los cambios del calendario. Si los cambios no validan, el del tipo. */
export function eventTheme(kind: EventKind, patch: unknown): EventTheme {
  const base = EVENT_THEMES[kind];
  if (!patch || typeof patch !== "object") return base;
  const merged = eventThemeSchema.safeParse({ ...base, ...(patch as object) });
  return merged.success ? merged.data : base;
}
