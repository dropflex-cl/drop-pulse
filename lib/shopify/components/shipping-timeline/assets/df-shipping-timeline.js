// DropFlex · <df-shipping-timeline>: fechas de despacho/entrega y cuenta regresiva al corte.
//
// Todo se calcula en el navegador porque la página puede venir cacheada por el CDN: Liquid solo
// deja la configuración logística (JSON embebido) y los textos. La hora "de verdad" es la de la
// TIENDA (zona IANA de la logística, America/Santiago por defecto), no la del comprador.
//
// Las fechas se manejan como días de calendario: un entero = días desde 1970-01-01. Sumar 1 es
// "mañana" sin importar el cambio de horario (Chile cambia en abril y septiembre); solo la
// cuenta regresiva convierte un día + hora de la tienda a un instante real (epochOf).
//
// Refresco: cada cambio de minuto (no cada segundo: menos ansiedad y menos CPU) y al volver a la
// pestaña. Al vencer el corte se recalcula todo: el despacho pasa al siguiente día hábil.
// Varias instancias en la página: cada una busca solo dentro de sí misma.

if (!customElements.get('df-shipping-timeline')) {
  const DAY = 864e5;
  const HOUR = 36e5;

  // ---------- Funciones puras (fechas de calendario) ----------

  /** Formateador de reloj de pared en la zona de la tienda; cae a America/Santiago y luego al navegador. */
  const clockFor = (tz) => {
    for (const timeZone of [tz, 'America/Santiago', undefined]) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        });
      } catch {
        // Zona inválida: se prueba la siguiente.
      }
    }
    return null;
  };

  /** Instante → { day, hour, minute, second } en el reloj de la tienda. */
  const wallClock = (clock, t) => {
    const p = {};
    for (const part of clock.formatToParts(t)) p[part.type] = part.value;
    return {
      day: Date.UTC(+p.year, +p.month - 1, +p.day) / DAY,
      hour: +p.hour % 24,
      minute: +p.minute,
      second: +p.second,
    };
  };

  /**
   * Día + hora del reloj de la tienda → instante (ms). Dos candidatos (desfase antes y después de
   * un cambio de horario); si la hora no existe (Chile salta de 24:00 a 01:00 en septiembre), el
   * instante en que el reloj la cruza, que es el mayor de los dos.
   */
  const epochOf = (clock, day, hour) => {
    const target = day * DAY + hour * HOUR;
    const local = (t) => {
      const w = wallClock(clock, t);
      return w.day * DAY + w.hour * HOUR + w.minute * 6e4 + w.second * 1e3;
    };
    const offset = (t) => local(t) - Math.floor(t / 1e3) * 1e3;
    const a = target - offset(target);
    const b = target - offset(a);
    if (local(b) === target) return b;
    if (local(a) === target) return a;
    return Math.max(a, b);
  };

  const weekday = (day) => new Date(day * DAY).getUTCDay();

  /** "YYYY-MM-DD" → día de calendario (o null si no es una fecha). */
  const parseDay = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null;
  };

  /**
   * Día en que se prepara y despacha: sin feriados y, en modo hábil, sin domingo; el sábado solo si
   * la tienda despacha los sábados.
   */
  const isWorkDay = (cal, day) => {
    if (cal.holidays.has(day)) return false;
    if (!cal.biz) return true;
    const wd = weekday(day);
    return wd !== 0 && (wd !== 6 || cal.shipSat);
  };

  /** Día en que el courier entrega: nunca domingo ni feriado; sábado solo si reparte sábado. */
  const isDeliveryDay = (cal, day) => {
    if (cal.holidays.has(day)) return false;
    if (!cal.biz) return true;
    const wd = weekday(day);
    return wd !== 0 && (wd !== 6 || cal.sat);
  };

  /** Suma n días que cumplen `ok` (n = 0 devuelve el mismo día). Tope de un año por seguridad. */
  const addDays = (day, n, ok) => {
    let left = n;
    for (let guard = 0; left > 0 && guard < 366; guard += 1) {
      day += 1;
      if (ok(day)) left -= 1;
    }
    return day;
  };

  const nextMatching = (day, ok) => {
    for (let guard = 0; !ok(day) && guard < 366; guard += 1) day += 1;
    return day;
  };

  /**
   * Plan de envío para un momento del reloj de la tienda.
   * order: día en que el pedido entra a preparación (pasado el corte, o en día inhábil, el siguiente hábil).
   * ship: order + días de preparación. from/to: ship + tránsito mínimo/máximo (días de entrega) en
   * la ciudad principal; regionsFrom/regionsTo: los mismos más los días extra a regiones.
   * deadline: hasta cuándo pedir para conservar este plan (el corte del día `order`; con corte 0,
   * la medianoche que lo cierra).
   */
  const plan = (now, cal) => {
    const work = (d) => isWorkDay(cal, d);
    const deliver = (d) => isDeliveryDay(cal, d);
    let order = now.day;
    if (cal.cutoff > 0 && now.hour >= cal.cutoff) order += 1;
    order = nextMatching(order, work);
    const ship = addDays(order, cal.handling, work);
    const from = addDays(ship, cal.tmin, deliver);
    const to = addDays(ship, Math.max(cal.tmin, cal.tmax), deliver);
    return {
      today: now.day,
      order,
      ship,
      from,
      to,
      regionsFrom: addDays(from, cal.extra, deliver),
      regionsTo: addDays(to, cal.extra, deliver),
      deadline: cal.cutoff > 0 ? { day: order, hour: cal.cutoff } : { day: order + 1, hour: 0 },
    };
  };

  /** Minutos restantes → "3 h 05 min" / "42 min" (redondeo hacia arriba: nunca "0 min"). */
  const formatLeft = (ms) => {
    const minutes = Math.max(1, Math.ceil(ms / 6e4));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  };

  const readJson = (el, selector) => {
    try {
      return JSON.parse(el.querySelector(selector)?.textContent || '{}');
    } catch {
      return {};
    }
  };

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- Elemento ----------

  class DfShippingTimeline extends HTMLElement {
    connectedCallback() {
      const cfg = readJson(this, '[data-df-config]');
      this.texts = readJson(this, '[data-df-texts]');
      const num = (v, fallback) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : fallback);
      this.cal = {
        cutoff: Math.min(23, num(cfg.cutoff, 0)),
        handling: num(cfg.handling, 1),
        tmin: num(cfg.tmin, 2),
        tmax: num(cfg.tmax, 5),
        biz: cfg.biz !== false,
        sat: cfg.sat === true,
        shipSat: cfg.shipSat === true,
        extra: cfg.city ? num(cfg.extra, 0) : 0,
        holidays: new Set((Array.isArray(cfg.holidays) ? cfg.holidays : []).map(parseDay).filter((d) => d !== null)),
      };
      this.clock = clockFor(cfg.tz || 'America/Santiago');
      if (!this.clock) return;

      let locale = cfg.locale || 'es';
      try {
        Intl.getCanonicalLocales(locale);
      } catch {
        locale = 'es';
      }
      this.spanish = locale.toLowerCase().startsWith('es');
      // timeZone UTC a propósito: los días de calendario ya están en la hora de la tienda.
      const dtf = (opts) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' });
      this.fmtShort = dtf({ day: 'numeric', month: 'short' });
      this.fmtWeekday = dtf({ weekday: 'long' });
      this.fmtWeekdayDate = dtf({ weekday: 'short', day: 'numeric', month: 'short' });
      this.fmtLong = dtf({ day: 'numeric', month: 'long' });
      this.relative = typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }) : null;
      this.useWeekday = cfg.format === 'weekday';

      this.titleEl = this.querySelector('[data-df-title]');
      this.shipEl = this.querySelector('[data-df-ship]');
      this.deliveryEl = this.querySelector('[data-df-delivery]');
      this.regionsEl = this.querySelector('[data-df-delivery-regions]');
      this.city = String(cfg.city || '');
      this.summaryEl = this.querySelector('[data-df-summary]');

      document.addEventListener('visibilitychange', this.onVisibility);
      this.render();
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }

    onVisibility = () => {
      if (document.visibilityState === 'visible') this.render();
      else clearTimeout(this.timer);
    };

    /** "hoy" / "mañana" / "viernes" (dentro de la semana) / "26 sept". */
    day(d, today) {
      const diff = d - today;
      if (this.relative && diff >= 0 && diff <= 1) return this.relative.format(diff, 'day');
      const date = new Date(d * DAY);
      if (this.useWeekday && diff > 1 && diff <= 6) return this.fmtWeekday.format(date);
      return (this.useWeekday ? this.fmtWeekdayDate : this.fmtShort).format(date);
    }

    /** {ship} dentro de una frase: "hoy", "mañana", "el viernes", "el 26 sept". */
    dayInSentence(d, today) {
      const text = this.day(d, today);
      const diff = d - today;
      return this.spanish && (diff < 0 || diff > 1) ? `el ${text}` : text;
    }

    range(from, to, today) {
      if (from === to) return capitalize(this.day(from, today));
      const a = new Date(from * DAY);
      const b = new Date(to * DAY);
      return typeof this.fmtShort.formatRange === 'function'
        ? this.fmtShort.formatRange(a, b)
        : `${this.fmtShort.format(a)} – ${this.fmtShort.format(b)}`;
    }

    render() {
      clearTimeout(this.timer);
      const nowMs = Date.now();
      const now = wallClock(this.clock, nowMs);
      const p = plan(now, this.cal);
      const t = this.texts;

      if (this.shipEl) this.shipEl.textContent = capitalize(this.day(p.ship, p.today));
      const regions = this.cal.extra > 0;
      if (this.deliveryEl) {
        const range = this.range(p.from, p.to, p.today);
        this.deliveryEl.textContent = regions ? `${this.city}: ${range}` : range;
      }
      if (this.regionsEl) {
        this.regionsEl.hidden = !regions;
        if (regions) this.regionsEl.textContent = `${t.regions || 'Regiones'}: ${this.range(p.regionsFrom, p.regionsTo, p.today)}`;
      }
      if (this.summaryEl) {
        const sentence = (a, b) => {
          const from = this.fmtLong.format(new Date(a * DAY));
          const to = this.fmtLong.format(new Date(b * DAY));
          const template = a === b ? t.summary_single : t.summary_range;
          return (template || '').replaceAll('{from}', from).replaceAll('{to}', to);
        };
        this.summaryEl.textContent = regions
          ? `${sentence(p.from, p.to)} en ${this.city}; ${(t.regions || 'Regiones').toLowerCase()}: ${sentence(p.regionsFrom, p.regionsTo).toLowerCase()}`
          : sentence(p.from, p.to);
      }

      // Cuenta regresiva: solo si el corte llega dentro de 24 h (un contador de 60 h no significa nada).
      const left = epochOf(this.clock, p.deadline.day, p.deadline.hour) - nowMs;
      const ship = this.dayInSentence(p.ship, p.today);
      if (this.titleEl) {
        const counting = t.countdown && left > 0 && left <= 24 * HOUR;
        const template = counting ? t.countdown : t.closed;
        this.titleEl.hidden = !template;
        if (template) {
          const [before, after = ''] = template.replaceAll('{ship}', ship).split('{time}');
          const strong = document.createElement('strong');
          strong.className = 'df-shipping-timeline__time';
          strong.textContent = formatLeft(left);
          this.titleEl.replaceChildren(before, ...(counting ? [strong, after] : []));
        }
        this.titleEl.removeAttribute('data-pending');
      }

      // Siguiente refresco: al cambio de minuto o justo al vencer el corte, lo que llegue antes.
      const toNextMinute = 6e4 - (nowMs % 6e4) + 50;
      const delay = left > 0 ? Math.min(toNextMinute, left + 50) : toNextMinute;
      if (document.visibilityState !== 'hidden') this.timer = setTimeout(() => this.render(), delay);
    }
  }

  customElements.define('df-shipping-timeline', DfShippingTimeline);
}
