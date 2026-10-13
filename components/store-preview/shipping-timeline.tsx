import { PdpEmptyPreview } from "./pdp-empty";
import { EXAMPLE, fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";
import { ShippingTimelineRuntime } from "./shipping-timeline-runtime";

// blocks/df-shipping-timeline.liquid como queda después de assets/df-shipping-timeline.js, en el
// estado con cuenta regresiva: se simula que faltan EXAMPLE.time para el corte del próximo día
// hábil (en la zona de la tienda) y con eso se calculan las fechas de despacho y entrega igual que
// el JS. Los plazos salen de facts.logistics; sin logística completa no se calculan fechas.

interface Content {
  heading?: string;
  parcel_label?: string;
  countdown_label?: string;
  arrival_template?: string;
  cutoff_template?: string;
  dispatch_template?: string;
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
      for (const part of new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).formatToParts(now))
        p[part.type] = part.value;
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

export function ShippingTimelinePreview({
  content,
  facts,
}: PreviewProps<Content>) {
  const s = settingsOf("shipping-timeline");
  if (!facts.logistics || facts.logistics.cutoff == null || facts.logistics.handling == null)
    return <PdpEmptyPreview component="shipping-timeline" />;
  content = content ?? {};

  const tOrdered = content.node_ordered_label || String(s.ordered_label ?? "");
  const tShipped = content.node_shipped_label || String(s.shipped_label ?? "");
  const tDelivered =
    content.node_delivered_label || String(s.delivered_label ?? "");
  let tCountdown =
    s.show_countdown === false
      ? ""
      : content.countdown_template || String(s.countdown_text ?? "");
  const tClosed =
    s.show_countdown === false
      ? ""
      : content.closed_template || String(s.closed_text ?? "");
  if (!tCountdown.includes("{time}")) tCountdown = "";
  if (!tOrdered || !tShipped || !tDelivered)
    return <PdpEmptyPreview component="shipping-timeline" />;

  // Plazos de Ajustes › Envíos (facts.logistics). `max` es el de
  // regiones cuando hay plazo de regiones: la ciudad principal termina `extra` días antes.
  const L = facts.logistics;
  const handling = Math.max(0, L?.handling ?? (Number(s.handling_days) || 0));
  const city = L ? L.city : String(s.main_city ?? "").trim();
  const extra = city
    ? Math.max(0, L ? (L.extra ?? 0) : Number(s.regions_extra_days) || 0)
    : 0;
  const tmin = L
    ? Math.max(0, L.min - handling)
    : Math.max(0, Number(s.transit_days_min) || 0);
  const tmax = Math.max(
    tmin,
    L ? L.max - extra - handling : Number(s.transit_days_max) || 0,
  );
  const biz = L?.businessDaysOnly ?? s.business_days_only !== false;
  const sat = L?.saturdayDelivery ?? s.saturday_delivery === true;
  const shipSat = L
    ? L.saturdayDispatch === true
    : s.saturday_dispatch === true;

  // Calendario compartido con el JS, incluidos los feriados vigentes.
  const holidays = new Set((L.holidays ?? []).map(date => Date.parse(`${date}T00:00:00Z`) / DAY));
  const weekday = (d: number) => new Date(d * DAY).getUTCDay();
  const work = (d: number) =>
    !holidays.has(d) && (!biz || (weekday(d) !== 0 && (weekday(d) !== 6 || shipSat)));
  const deliver = (d: number) =>
    !holidays.has(d) && (!biz || (weekday(d) !== 0 && (weekday(d) !== 6 || sat)));

  // «Hoy» simulado: el próximo día de despacho, antes del corte (así hay cuenta regresiva).
  const today = nextMatching(
    todayIn(L.timezone || String(s.timezone || "America/Santiago")),
    work,
  );
  const ship = addDays(today, handling, work);
  const from = addDays(ship, tmin, deliver);
  const to = addDays(ship, tmax, deliver);
  const regionsFrom = addDays(from, extra, deliver);
  const regionsTo = addDays(to, extra, deliver);
  const regionsLabel = String(s.regions_label || "Regiones");

  const dtf = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: "UTC" });
  const fmtShort = dtf({ day: "numeric", month: "short" });
  const fmtWeekday = dtf({ weekday: "long" });
  const fmtWeekdayDate = dtf({
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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
  const inSentence = (d: number) =>
    d - today > 1 ? `el ${dayText(d)}` : dayText(d);
  const rangeOf = (a: number, b: number) =>
    a === b
      ? capitalize(dayText(a))
      : fmtShort.formatRange(new Date(a * DAY), new Date(b * DAY));
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
  const [before, after = ""] = template
    .replaceAll("{ship}", inSentence(ship))
    .replaceAll("{arrive}", inSentence(from))
    .split("{time}");

  const arrivalTemplate = content.arrival_template || String(s.arrival_text || "Recíbelo desde {arrive}");
  const dispatchTemplate = content.dispatch_template || String(s.dispatch_text || "Despacho estimado: {ship}");
  const cutoffTemplate = content.cutoff_template || String(s.cutoff_text || "Confirma antes de {cutoff}");
  const cutoffTime = dtf({ hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date((L.cutoff ?? 0) * 36e5));
  const config = { cutoff: L.cutoff, handling, tmin, tmax, biz, sat, shipSat, extra, city: city || "", holidays: L.holidays ?? [],
    tz: L.timezone || String(s.timezone || "America/Santiago"), locale: LOCALE, format: s.date_format };
  const texts = { countdown: tCountdown, closed: tClosed, arrival: arrivalTemplate, cutoff: cutoffTemplate, dispatch: dispatchTemplate,
    summary_range: "Entrega estimada entre el {from} y el {to}", summary_single: "Entrega estimada el {from}", regions: regionsLabel };
  const json = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
  const label = (text: string, token: string) => text.replaceAll(token, "").replaceAll(":", "").trim();

  return (
    <>
    <df-shipping-timeline
      key={json({ config, texts })}
      className={`df df-shipping-timeline${s.animate_line ? " df-shipping-timeline--animate" : ""}`}
      style={{ marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      {template ? <p className="df-visually-hidden" data-df-title="">{fill(before, facts)}{counting ? <><strong className="df-shipping-timeline__time">{EXAMPLE.time}</strong>{fill(after, facts)}</> : null}</p> : null}
      <div className="df-shipping-timeline__ticket">
        <div className="df-shipping-timeline__ticket-top">
        <p className="df-shipping-timeline__eyebrow"><DfIcon name="truck" /> {content.countdown_label || String(s.countdown_label || "Próximo despacho")}</p>
        <h3 className="df-shipping-timeline__headline">{content.heading || String(s.ticket_heading || "Que el próximo lleve el tuyo")}</h3>
        <div className="df-shipping-timeline__route" aria-hidden="true">
          <span className="df-shipping-timeline__rail"><span className="df-shipping-timeline__rail-fill" /></span>
          <span className="df-shipping-timeline__parcel"><span>{content.parcel_label || String(s.parcel_label || "Tu pedido")}</span></span>
        </div>
      <div className="df-shipping-timeline__countdown" data-df-countdown="" data-pending="">
        <p className="df-shipping-timeline__clock" data-df-clock="">
          <span className="df-shipping-timeline__unit"><strong data-df-hours="">—</strong><span aria-hidden="true">h</span><span className="df-visually-hidden">horas</span></span>
          <span className="df-shipping-timeline__colon" aria-hidden="true">:</span>
          <span className="df-shipping-timeline__unit"><strong data-df-minutes="">—</strong><span aria-hidden="true">min</span><span className="df-visually-hidden">minutos</span></span>
          <span className="df-shipping-timeline__unit"><strong data-df-seconds="">—</strong><span aria-hidden="true">s</span><span className="df-visually-hidden">segundos</span></span>
        </p>
        <p className="df-shipping-timeline__cutoff" data-df-cutoff="">{cutoffTemplate.replaceAll("{cutoff}", `${inSentence(today)}, ${cutoffTime}`)}</p>
      </div>
        </div>
        <div className="df-shipping-timeline__dates" aria-hidden="true">
          {s.show_ship_date ? <div><p>{label(dispatchTemplate, "{ship}")}</p><strong data-df-ship-date="">{fmtWeekday.format(new Date(ship * DAY))}</strong></div> : null}
          <div><p>{label(arrivalTemplate, "{arrive}")}</p><strong data-df-arrival-date="">{fmtWeekday.format(new Date(from * DAY))}</strong></div>
        </div>
      </div>
      {s.show_ship_date ? <p className="df-visually-hidden" data-df-ship="">{dispatchTemplate.replaceAll("{ship}", inSentence(ship))}</p> : null}
      <p className="df-visually-hidden" data-df-arrival="">{arrivalTemplate.replaceAll("{arrive}", inSentence(from))}</p>
        <div className="df-shipping-timeline__destinations">
          <p className="df-shipping-timeline__destination" data-df-delivery="">{range}</p>
          {extra ? <p className="df-shipping-timeline__destination" data-df-delivery-regions="">{`${regionsLabel}: ${rangeOf(regionsFrom, regionsTo)}`}</p> : null}
        </div>
      <p className="df-visually-hidden" data-df-summary="">{summary}</p>
      <script type="application/json" data-df-config="" dangerouslySetInnerHTML={{ __html: json(config) }} />
      <script type="application/json" data-df-texts="" dangerouslySetInnerHTML={{ __html: json(texts) }} />
    </df-shipping-timeline>
    <ShippingTimelineRuntime />
    </>
  );
}
