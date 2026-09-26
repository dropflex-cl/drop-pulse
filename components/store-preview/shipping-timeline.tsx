import { EXAMPLE, fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-shipping-timeline.liquid como queda después de assets/df-shipping-timeline.js, en el
// estado con cuenta regresiva: se simula que faltan EXAMPLE.time para el corte del próximo día
// hábil (en la zona de la tienda) y con eso se calculan las fechas de despacho y entrega igual que
// el JS. Los plazos salen de facts.logistics; sin ellos, de los ajustes del bloque, como la tienda.

interface Content {
  countdown_template?: string;
  closed_template?: string;
  node_ordered_label?: string;
  node_ordered_sub?: string;
  node_shipped_label?: string;
  node_delivered_label?: string;
  node_delivered_sub_suffix?: string;
}

const DAY = 864e5;
const LOCALE = "es-CL";

/** Día de calendario (días desde 1970-01-01) de hoy en el reloj de la tienda. */
function todayIn(tz: string): number {
  const now = new Date();
  for (const timeZone of [tz, "America/Santiago", undefined]) {
    try {
      const p: Record<string, string> = {};
      for (const part of new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now)) p[part.type] = part.value;
      return Date.UTC(+p.year, +p.month - 1, +p.day) / DAY;
    } catch {
      // Zona inválida: se prueba la siguiente.
    }
  }
  return Math.floor(now.getTime() / DAY);
}

/** Suma n días que cumplen `ok` (n = 0 devuelve el mismo día), como addDays del JS. */
function addDays(day: number, n: number, ok: (d: number) => boolean): number {
  let left = n;
  for (let guard = 0; left > 0 && guard < 366; guard += 1) {
    day += 1;
    if (ok(day)) left -= 1;
  }
  return day;
}

function nextMatching(day: number, ok: (d: number) => boolean): number {
  for (let guard = 0; !ok(day) && guard < 366; guard += 1) day += 1;
  return day;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ShippingTimelinePreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("shipping-timeline");

  const tOrdered = content.node_ordered_label || String(s.ordered_label ?? "");
  const tOrderedSub = content.node_ordered_sub || String(s.ordered_sub ?? "");
  const tShipped = content.node_shipped_label || String(s.shipped_label ?? "");
  const tDelivered = content.node_delivered_label || String(s.delivered_label ?? "");
  const tSuffix = content.node_delivered_sub_suffix || String(s.delivered_suffix ?? "");
  let tCountdown = s.show_countdown === false ? "" : content.countdown_template || String(s.countdown_text ?? "");
  const tClosed = s.show_countdown === false ? "" : content.closed_template || String(s.closed_text ?? "");
  if (!tCountdown.includes("{time}")) tCountdown = "";
  if (!tOrdered || !tShipped || !tDelivered) return null;

  // Plazos: los de Ajustes › Envíos (facts.logistics); sin ellos, los del bloque. `max` es el de
  // regiones cuando hay plazo de regiones: la ciudad principal termina `extra` días antes.
  const L = facts.logistics;
  const handling = Math.max(0, L?.handling ?? (Number(s.handling_days) || 0));
  const city = L ? L.city : String(s.main_city ?? "").trim();
  const extra = city ? Math.max(0, L ? (L.extra ?? 0) : Number(s.regions_extra_days) || 0) : 0;
  const tmin = L ? Math.max(0, L.min - handling) : Math.max(0, Number(s.transit_days_min) || 0);
  const tmax = Math.max(tmin, L ? L.max - extra - handling : Number(s.transit_days_max) || 0);
  const biz = L?.businessDaysOnly ?? s.business_days_only !== false;
  const sat = L?.saturdayDelivery ?? s.saturday_delivery === true;
  const shipSat = L ? L.saturdayDispatch === true : s.saturday_dispatch === true;

  // Calendario del JS (sin feriados: la vista previa no los conoce).
  const weekday = (d: number) => new Date(d * DAY).getUTCDay();
  const work = (d: number) => !biz || (weekday(d) !== 0 && (weekday(d) !== 6 || shipSat));
  const deliver = (d: number) => !biz || (weekday(d) !== 0 && (weekday(d) !== 6 || sat));

  // «Hoy» simulado: el próximo día de despacho, antes del corte (así hay cuenta regresiva).
  const today = nextMatching(todayIn(String(s.timezone || "America/Santiago")), work);
  const ship = addDays(today, handling, work);
  const from = addDays(ship, tmin, deliver);
  const to = addDays(ship, tmax, deliver);
  const regionsFrom = addDays(from, extra, deliver);
  const regionsTo = addDays(to, extra, deliver);
  const regionsLabel = String(s.regions_label || "Regiones");

  const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: "UTC" });
  const fmtShort = dtf({ day: "numeric", month: "short" });
  const fmtWeekday = dtf({ weekday: "long" });
  const fmtWeekdayDate = dtf({ weekday: "short", day: "numeric", month: "short" });
  const fmtLong = dtf({ day: "numeric", month: "long" });
  const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const useWeekday = s.date_format === "weekday";

  /** «hoy» / «mañana» / «viernes» (dentro de la semana) / «26 sept». */
  const dayText = (d: number) => {
    const diff = d - today;
    if (diff >= 0 && diff <= 1) return relative.format(diff, "day");
    const date = new Date(d * DAY);
    if (useWeekday && diff > 1 && diff <= 6) return fmtWeekday.format(date);
    return (useWeekday ? fmtWeekdayDate : fmtShort).format(date);
  };
  const inSentence = (d: number) => (d - today > 1 ? `el ${dayText(d)}` : dayText(d));
  const rangeOf = (a: number, b: number) => (a === b ? capitalize(dayText(a)) : fmtShort.formatRange(new Date(a * DAY), new Date(b * DAY)));
  const range = extra ? `${city}: ${rangeOf(from, to)}` : rangeOf(from, to);
  const sentence = (a: number, b: number) =>
    a === b
      ? `Entrega estimada el ${fmtLong.format(new Date(a * DAY))}`
      : `Entrega estimada entre el ${fmtLong.format(new Date(a * DAY))} y el ${fmtLong.format(new Date(b * DAY))}`;
  const summary = extra
    ? `${sentence(from, to)} en ${city}; ${regionsLabel.toLowerCase()}: ${sentence(regionsFrom, regionsTo).toLowerCase()}`
    : sentence(from, to);

  // Título: la plantilla con {ship}, {arrive} y el tiempo al corte en <strong>, como lo arma el JS.
  const counting = Boolean(tCountdown);
  const template = counting ? tCountdown : tClosed;
  const [before, after = ""] = template.replaceAll("{ship}", inSentence(ship)).replaceAll("{arrive}", inSentence(from)).split("{time}");

  return (
    <df-shipping-timeline
      className={`df df-shipping-timeline df-shipping-timeline--icons-${s.icon_style} df-shipping-timeline--time-${s.time_color}${s.animate_line ? " df-shipping-timeline--animate" : ""}`}
      style={{ marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      {template ? (
        <p className="df-shipping-timeline__title" data-df-title="">
          {fill(before, facts)}
          {counting ? (
            <>
              <strong className="df-shipping-timeline__time">{EXAMPLE.time}</strong>
              {fill(after, facts)}
            </>
          ) : null}
        </p>
      ) : null}

      <ol className="df-shipping-timeline__steps">
        <li className="df-shipping-timeline__step">
          <span className="df-shipping-timeline__circle">
            <DfIcon name="cart" />
          </span>
          <span className="df-shipping-timeline__label">{fill(tOrdered, facts)}</span>
          <span className="df-shipping-timeline__sub">{fill(tOrderedSub, facts)}</span>
        </li>
        <li className="df-shipping-timeline__step">
          <span className="df-shipping-timeline__circle">
            <DfIcon name="truck" />
          </span>
          <span className="df-shipping-timeline__label">{fill(tShipped, facts)}</span>
          {s.show_ship_date ? (
            <span className="df-shipping-timeline__sub" data-df-ship="">
              {capitalize(dayText(ship))}
            </span>
          ) : null}
        </li>
        <li className="df-shipping-timeline__step">
          <span className="df-shipping-timeline__circle">
            <DfIcon name="package" />
          </span>
          <span className="df-shipping-timeline__label">{fill(tDelivered, facts)}</span>
          <span className="df-shipping-timeline__sub" data-df-delivery="">
            {range}
          </span>
          {extra ? (
            <span className="df-shipping-timeline__sub" data-df-delivery-regions="">
              {`${regionsLabel}: ${rangeOf(regionsFrom, regionsTo)}`}
            </span>
          ) : null}
          {tSuffix ? <span className="df-shipping-timeline__sub df-shipping-timeline__suffix">{fill(tSuffix, facts)}</span> : null}
        </li>
      </ol>

      <p className="df-visually-hidden" data-df-summary="">
        {summary}
      </p>
    </df-shipping-timeline>
  );
}
