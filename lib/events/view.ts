// Eventos para la pantalla (docs/spec-eventos.md › UX): fechas en la zona de la tienda, días que
// faltan y la conversión de los campos de fecha. Puro (con tests).
import { localDate, zonedTime } from "@/lib/ads/schedule";
import type { EventPhase } from "./resolve";

const DAY = 86_400_000;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «5 oct» (Intl da «sept»; el resto de la app escribe «sep»). */
function dayMonth(ms: number, timeZone: string): string {
  const [, m, d] = localDate(new Date(ms), timeZone).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** «5 – 7 oct», «28 sep – 7 oct», «11 nov» (el término es el último día con evento). */
export function rangeLabel(from: number, to: number, timeZone: string): string {
  const end = to - 1000; // 23:59:59 → ese mismo día
  const a = localDate(new Date(from), timeZone);
  const b = localDate(new Date(end), timeZone);
  if (a === b) return dayMonth(from, timeZone);
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${sameMonth ? Number(a.slice(8)) : dayMonth(from, timeZone)} – ${dayMonth(end, timeZone)}`;
}

/** Días calendario (en la zona de la tienda) entre hoy y el día de `target`. */
export function daysUntil(now: number, target: number, timeZone: string): number {
  const [y1, m1, d1] = localDate(new Date(now), timeZone).split("-").map(Number);
  const [y2, m2, d2] = localDate(new Date(target), timeZone).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

/** Qué dice la fila del evento según su fase: «En 11 días», «En antesala · empieza en 3 días», «En curso · termina el 30 nov». */
export function phaseLabel(phase: EventPhase, w: { from: number; start: number; to: number }, now: number, timeZone: string): string {
  const inDays = (n: number) => (n <= 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);
  if (phase === "upcoming") {
    const n = daysUntil(now, w.from, timeZone);
    return `Se ve ${inDays(n)}`;
  }
  if (phase === "teaser") return `En antesala · el evento empieza ${inDays(daysUntil(now, w.start, timeZone))}`;
  if (phase === "live") return `En curso · termina el ${dayMonth(w.to - 1000, timeZone)}`;
  return "Terminado";
}

/** El valor de un <input type="date"> para un instante. */
export const dateInput = (ms: number, timeZone: string) => localDate(new Date(ms), timeZone);

/** «AAAA-MM-DD» de un campo de fecha → el instante: 00:00 al empezar, 23:59:59 al terminar. null si no es una fecha. */
export function parseDateInput(value: string, edge: "start" | "end", timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = zonedTime(y, mo, d, 0, timeZone).getTime();
  return new Date(edge === "start" ? t : zonedTime(y, mo, d + 1, 0, timeZone).getTime() - 1000).toISOString();
}
