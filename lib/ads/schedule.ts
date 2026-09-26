// Cuándo empieza a entregar una campaña (docs/spec-anuncios.md §7.1). Meta retiene un conjunto hasta su
// `start_time` aunque la campaña esté activa: por defecto, la próxima primera hora EN LA HORA DE LA CUENTA (hoy si aún no llega)
// (Impulso: 06:00; Pancho: 05:00), porque el presupuesto diario se reinicia a medianoche y lanzar en la
// tarde quema el día en pocas horas. Portado de dropflex (lib/ads/launch/schedule.ts), que usaba una
// hora UTC fija (R6). Puro: `now` siempre es un argumento.

/** Partes de fecha y hora de un instante en una zona horaria. */
function partsIn(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

/** Minutos que la zona está adelantada respecto de UTC en ese instante (Chile en verano: −180). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** El instante en que la zona marca esa fecha y hora local. */
export function zonedTime(y: number, m: number, d: number, hour: number, timeZone: string): Date {
  let t = Date.UTC(y, m - 1, d, hour);
  // Dos pasadas: la segunda corrige cuando el cambio de horario cae entre medio.
  for (let i = 0; i < 2; i++) t = Date.UTC(y, m - 1, d, hour) - offsetMinutes(new Date(t), timeZone) * 60_000;
  return new Date(t);
}

/** La fecha local (AAAA-MM-DD) de un instante en la zona. */
export function localDate(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Suma días a una fecha AAAA-MM-DD. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Margen para que el lanzamiento (medios, conjuntos, anuncios) termine antes de la hora de inicio. */
const LEAD_MS = 15 * 60 * 1000;

/**
 * La próxima vez que la cuenta marca `hour`, en ISO UTC: hoy si todavía no llega (a la 1:20 con inicio
 * a las 6:00, hoy a las 6:00), si no mañana. El presupuesto del día igual está entero.
 */
export function nextMorning(now: Date, hour: number, timeZone: string): string {
  const today = localDate(now, timeZone);
  for (const day of [today, addDays(today, 1)]) {
    const [y, m, d] = day.split("-").map(Number);
    const t = zonedTime(y, m, d, hour, timeZone);
    if (t.getTime() - now.getTime() >= LEAD_MS) return t.toISOString();
  }
  const [y, m, d] = addDays(today, 2).split("-").map(Number); // inalcanzable: mañana siempre está a > 15 min
  return zonedTime(y, m, d, hour, timeZone).toISOString();
}

/** «mañana 6:00» / «hoy 6:00» / «25-09 6:00», en la hora de la cuenta, para los resúmenes. */
export function startLabel(iso: string, now: Date, timeZone: string): string {
  const day = localDate(new Date(iso), timeZone);
  const today = localDate(now, timeZone);
  const p = partsIn(new Date(iso), timeZone);
  const hm = `${p.h}:${String(p.min).padStart(2, "0")}`;
  if (day === today) return `hoy ${hm}`;
  if (day === addDays(today, 1)) return `mañana ${hm}`;
  const [, m, d] = day.split("-");
  return `${d}-${m} ${hm}`;
}
