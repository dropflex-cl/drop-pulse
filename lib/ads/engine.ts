// El motor de decisión (docs/spec-anuncios.md §5.2). Puro: recibe las métricas de una unidad y la
// configuración de SU campaña y dice qué hacer, con la cifra que lo justifica y la regla que lo
// disparó. No lee la base ni llama a Meta (eso es lib/pipeline/ads-engine.ts).
//
// Orden: Esperar manda (si una regla de espera no se cumple, no se pausa ni se escala) → la primera
// regla de Pausar que se cumple → Escalar → Mantener. `winners_to_cbo` se evalúa aparte, a nivel de
// la campaña ABO, y nunca se aplica solo.

import { money } from "@/lib/format";
import { roundingFor } from "@/lib/pricing/calculator";
import { derive, sumMetrics, type Metrics } from "./meta/insights";
import { addDays, localDate } from "./schedule";
import type { EngineConfig, Rule, RuleOf } from "./schemas";

export type Verdict = "wait" | "keep" | "pause" | "scale" | "winners";
export type UnitLevel = "campaign" | "adset" | "ad";

export interface DayMetrics extends Metrics {
  /** Fecha local de la cuenta (AAAA-MM-DD). */
  date: string;
}

export interface EngineUnit {
  id: string;
  level: UnitLevel;
  name: string;
  /** Entregando o en condiciones de entregar (effective_status ACTIVE). */
  active: boolean;
  /** Presupuesto diario, si esta unidad lo tiene (conjunto en ABO, campaña en CBO). */
  budget: number | null;
  /** Desde cuándo puede entregar (publicación o inicio programado). */
  startedAt: string | null;
  /** Último cambio de presupuesto o estado (regla after_change y cadencia del escalado). */
  lastChangedAt: string | null;
  /** Un registro por día local, en cualquier orden. */
  days: DayMetrics[];
  /** Primera vez que se vio un pago iniciado (regla intent_expired). */
  firstCheckoutAt?: string | null;
}

export interface EngineContext {
  now: Date;
  timeZone: string;
  currency: string;
  /** Lo que la campaña compromete por día hoy (ABO: suma de los conjuntos activos; CBO: el de la campaña). */
  dailyTotal: number;
}

/** Qué puede decidir el motor sobre esta unidad (tabla «Nivel según estructura»). */
export interface Allowed {
  pause: boolean;
  scale: boolean;
}

export interface Decision {
  unitId: string;
  level: UnitLevel;
  verdict: Verdict;
  ruleId: string | null;
  /** La frase de la regla que la disparó («Pausar si gasta 1× el CPA límite sin ventas»). */
  rule: string | null;
  /** La razón con la cifra, para el comerciante. */
  reason: string;
  /** Esperar: cuánto se avanzó (0 a 1). */
  progress: number | null;
  /** Escalar: el presupuesto nuevo. Ganadores: el de la CBO. */
  suggestedBudget: number | null;
  /** Ganadores: los conjuntos. */
  winners?: string[];
  metrics: { spend: number; purchases: number; cpa: number | null; ctr: number | null; impressions: number; days: number };
  /** La unidad ya está en pausa. */
  paused?: boolean;
}

const HOUR = 3_600_000;

/** 1× · 1,5× · 0,7× */
export function xLabel(v: number): string {
  return `${Number.isInteger(v) ? v : v.toLocaleString("es-CL", { maximumFractionDigits: 2 })}×`;
}

const pct = (v: number) => `${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CL")} ${n === 1 ? one : many}`;

/** La regla como frase, para «Regla: …» y los resúmenes. */
export function ruleSentence(rule: Rule, currency: string): string {
  switch (rule.type) {
    case "min_spend":
      return `No decidir antes de gastar ${xLabel(rule.spend_x)} el CPA límite o de ${rule.or_hours} h`;
    case "after_change":
      return `Tras un cambio, esperar ${rule.hours} h`;
    case "min_days":
      return `Esperar ${plural(rule.days, "día completo", "días completos")}`;
    case "no_sales":
      return `Pausar si gasta ${xLabel(rule.spend_x)} el CPA límite sin ventas`;
    case "cpa_over":
      return `Pausar si el CPA supera ${xLabel(rule.cpa_x)} el límite por ${plural(rule.days, "día", "días")}`;
    case "low_ctr":
      return `Pausar si el CTR es menor a ${pct(rule.ctr_pct)} tras ${rule.min_impressions.toLocaleString("es-CL")} impresiones, sin ventas`;
    case "intent_expired":
      return `Pausar si hay pagos iniciados sin compra tras ${rule.hours} h`;
    case "cpa_under":
      return `Escalar si el CPA es ≤ ${xLabel(rule.cpa_x)} el límite por ${plural(rule.days, "día", "días")} con ${plural(rule.min_sales, "venta", "ventas")}: +${rule.step_pct} % cada ${rule.every_hours} h`;
    case "daily_cap":
      return `Nunca pasar de ${money(rule.amount, currency)} diarios`;
    case "winners_to_cbo":
      return `Con ${plural(rule.min_winners, "conjunto ganador", "conjuntos ganadores")}, sugerir una CBO de ${money(rule.cbo_budget, currency)}/día`;
  }
}

function enabled<T extends Rule["type"]>(engine: EngineConfig, type: T): RuleOf<T>[] {
  return engine.rules.filter((r): r is RuleOf<T> => r.type === type && r.enabled);
}

const hoursSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / HOUR : Infinity);

/** Días locales completos desde el inicio (hoy no cuenta). */
function completeDays(unit: EngineUnit, ctx: EngineContext): number {
  if (!unit.startedAt) return 0;
  const start = localDate(new Date(unit.startedAt), ctx.timeZone);
  const today = localDate(ctx.now, ctx.timeZone);
  const [a, b] = [Date.parse(`${start}T00:00:00Z`), Date.parse(`${today}T00:00:00Z`)];
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Los últimos N días completos (sin hoy), o null si todavía no hay N. */
function window(unit: EngineUnit, ctx: EngineContext, n: number): Metrics | null {
  if (completeDays(unit, ctx) < n) return null;
  const today = localDate(ctx.now, ctx.timeZone);
  const dates = new Set(Array.from({ length: n }, (_, i) => addDays(today, -(i + 1))));
  return sumMetrics(unit.days.filter((d) => dates.has(d.date)));
}

function summary(unit: EngineUnit, ctx: EngineContext): Decision["metrics"] {
  const m = derive(sumMetrics(unit.days));
  return { spend: m.spend, purchases: m.purchases, cpa: m.cpa, ctr: m.ctr, impressions: m.impressions, days: completeDays(unit, ctx) };
}

/** Si el CPA de una ventana está bajo el umbral con las ventas mínimas (la condición de ganador). */
function winsWindow(unit: EngineUnit, ctx: EngineContext, rule: RuleOf<"cpa_under">, limit: number): { cpa: number; sales: number } | null {
  const w = window(unit, ctx, rule.days);
  if (!w || w.purchases < rule.min_sales) return null;
  const cpa = w.spend / w.purchases;
  return cpa <= rule.cpa_x * limit ? { cpa, sales: w.purchases } : null;
}

/** Lo que falta para poder decidir, o null si todas las esperas se cumplen. */
function waitFor(unit: EngineUnit, engine: EngineConfig, ctx: EngineContext, spend: number): Omit<Decision, "unitId" | "level" | "metrics"> | null {
  const cpa = engine.cpa_limit;
  for (const r of engine.rules) {
    if (!r.enabled || r.group !== "wait") continue;
    const text = ruleSentence(r, ctx.currency);
    if (r.type === "min_spend") {
      const target = r.spend_x * cpa;
      const hours = hoursSince(unit.startedAt, ctx.now);
      if (spend >= target || hours >= r.or_hours) continue;
      const progress = Math.min(1, Math.max(spend / target, Number.isFinite(hours) ? hours / r.or_hours : 0));
      return {
        verdict: "wait",
        ruleId: r.id,
        rule: text,
        progress,
        suggestedBudget: null,
        reason: `Falta gastar ${money(target - spend, ctx.currency)} para decidir (${Math.round((spend / target) * 100)} % de ${xLabel(r.spend_x)} CPA).`,
      };
    }
    if (r.type === "after_change") {
      const since = hoursSince(unit.lastChangedAt, ctx.now);
      if (since >= r.hours) continue;
      return { verdict: "wait", ruleId: r.id, rule: text, progress: since / r.hours, suggestedBudget: null, reason: `Cambió hace ${Math.floor(since)} h: espera ${Math.ceil(r.hours - since)} h más para decidir.` };
    }
    if (r.type === "min_days") {
      const done = completeDays(unit, ctx);
      if (done >= r.days) continue;
      return { verdict: "wait", ruleId: r.id, rule: text, progress: done / r.days, suggestedBudget: null, reason: `Lleva ${plural(done, "día completo", "días completos")}: ${r.days - done === 1 ? "falta" : "faltan"} ${plural(r.days - done, "día", "días")} para decidir.` };
    }
  }
  return null;
}

function pauseFor(unit: EngineUnit, engine: EngineConfig, ctx: EngineContext, total: Metrics): Omit<Decision, "unitId" | "level" | "metrics"> | null {
  const cpa = engine.cpa_limit;
  const hit = (r: Rule, reason: string) => ({ verdict: "pause" as const, ruleId: r.id, rule: ruleSentence(r, ctx.currency), progress: null, suggestedBudget: null, reason });
  for (const r of engine.rules) {
    if (!r.enabled || r.group !== "pause") continue;
    if (r.type === "no_sales" && total.purchases === 0 && total.spend >= r.spend_x * cpa) {
      return hit(r, `Gastó ${money(total.spend, ctx.currency)} (${xLabel(Math.round((total.spend / cpa) * 10) / 10)} tu CPA límite) sin ventas.`);
    }
    if (r.type === "cpa_over") {
      const w = window(unit, ctx, r.days);
      if (!w || w.spend <= 0) continue;
      const over = w.purchases === 0 ? w.spend > r.cpa_x * cpa : w.spend / w.purchases > r.cpa_x * cpa;
      if (!over) continue;
      const wCpa = w.purchases ? w.spend / w.purchases : null;
      return hit(
        r,
        wCpa != null
          ? `CPA ${money(wCpa, ctx.currency)} en ${plural(r.days, "día", "días")}: ${Math.round((wCpa / cpa - 1) * 100)} % sobre tu límite.`
          : `Gastó ${money(w.spend, ctx.currency)} en ${plural(r.days, "día", "días")} sin ventas.`,
      );
    }
    if (r.type === "low_ctr" && total.purchases === 0 && total.impressions >= r.min_impressions) {
      const ctr = (total.clicks / total.impressions) * 100;
      if (ctr < r.ctr_pct) return hit(r, `CTR ${pct(Math.round(ctr * 100) / 100)} tras ${total.impressions.toLocaleString("es-CL")} impresiones, sin ventas.`);
    }
    if (r.type === "intent_expired" && total.purchases === 0 && total.initiated_checkouts > 0) {
      const since = hoursSince(unit.firstCheckoutAt, ctx.now);
      if (Number.isFinite(since) && since >= r.hours) return hit(r, `${plural(total.initiated_checkouts, "pago iniciado", "pagos iniciados")} y ninguna compra en ${Math.floor(since)} h.`);
    }
  }
  return null;
}

/** El presupuesto nuevo sin pasar del tope: pasos de la moneda, hacia abajo. */
function floorToStep(v: number, currency: string): number {
  const step = roundingFor(currency).step;
  return Math.floor(v / step) * step;
}

function scaleFor(unit: EngineUnit, engine: EngineConfig, ctx: EngineContext): Omit<Decision, "unitId" | "level" | "metrics"> | null {
  if (unit.budget == null) return null;
  const cap = enabled(engine, "daily_cap")[0];
  for (const r of enabled(engine, "cpa_under")) {
    const win = winsWindow(unit, ctx, r, engine.cpa_limit);
    if (!win) continue;
    const text = ruleSentence(r, ctx.currency);
    const under = Math.round((1 - win.cpa / engine.cpa_limit) * 100);
    const why = `CPA ${money(win.cpa, ctx.currency)} por ${plural(r.days, "día", "días")}: ${under} % bajo tu límite, con ${plural(win.sales, "venta", "ventas")}.`;
    const since = hoursSince(unit.lastChangedAt, ctx.now);
    if (since < r.every_hours) {
      return { verdict: "keep", ruleId: r.id, rule: text, progress: null, suggestedBudget: null, reason: `${why} Escala otra vez en ${Math.ceil(r.every_hours - since)} h.` };
    }
    let next = floorToStep(unit.budget * (1 + r.step_pct / 100), ctx.currency);
    if (cap) next = Math.min(next, floorToStep(unit.budget + (cap.amount - ctx.dailyTotal), ctx.currency));
    if (next <= unit.budget) {
      return { verdict: "keep", ruleId: cap?.id ?? r.id, rule: cap ? ruleSentence(cap, ctx.currency) : text, progress: null, suggestedBudget: null, reason: `${why} Ya está en el tope diario.` };
    }
    return { verdict: "scale", ruleId: r.id, rule: text, progress: null, suggestedBudget: next, reason: why };
  }
  return null;
}

/** La decisión para una unidad. */
export function evaluateUnit(unit: EngineUnit, engine: EngineConfig, ctx: EngineContext, allowed: Allowed): Decision {
  const total = sumMetrics(unit.days);
  const metrics = summary(unit, ctx);
  const base = { unitId: unit.id, level: unit.level, metrics };
  if (!unit.active) return { ...base, verdict: "keep", ruleId: null, rule: null, progress: null, suggestedBudget: null, reason: "En pausa.", paused: true };

  const wait = waitFor(unit, engine, ctx, total.spend);
  if (wait) return { ...base, ...wait };
  if (allowed.pause) {
    const pause = pauseFor(unit, engine, ctx, total);
    if (pause) return { ...base, ...pause };
  }
  if (allowed.scale) {
    const scale = scaleFor(unit, engine, ctx);
    if (scale) return { ...base, ...scale };
  }
  const cpa = derive(total).cpa;
  const reason =
    cpa != null
      ? `CPA ${money(cpa, ctx.currency)} (${Math.round((cpa / engine.cpa_limit) * 100)} % de tu límite) · ${plural(total.purchases, "venta", "ventas")}.`
      : `Gasto ${money(total.spend, ctx.currency)}, sin ventas todavía.`;
  return { ...base, verdict: "keep", ruleId: null, rule: null, progress: null, suggestedBudget: null, reason };
}

/** En una ABO: si hay suficientes conjuntos ganadores, sugiere crear la CBO con ellos. */
export function evaluateWinners(campaign: EngineUnit, adsets: EngineUnit[], engine: EngineConfig, ctx: EngineContext): Decision | null {
  const rule = enabled(engine, "winners_to_cbo")[0];
  const under = enabled(engine, "cpa_under")[0];
  if (!rule || !under) return null;
  const winners = adsets.filter((s) => s.active && winsWindow(s, ctx, under, engine.cpa_limit));
  if (winners.length < rule.min_winners) return null;
  return {
    unitId: campaign.id,
    level: "campaign",
    verdict: "winners",
    ruleId: rule.id,
    rule: ruleSentence(rule, ctx.currency),
    progress: null,
    suggestedBudget: rule.cbo_budget,
    winners: winners.map((w) => w.id),
    reason: `${plural(winners.length, "conjunto gana", "conjuntos ganan")} con CPA bajo ${xLabel(under.cpa_x)} tu límite: crea una CBO con ellos.`,
    metrics: summary(campaign, ctx),
  };
}

/** Lo que el motor automático nunca supera (§5.4): el paso de +30 %, el tope diario y una acción por espera. */
export function autoAllowed(decision: Decision, unit: EngineUnit, engine: EngineConfig, ctx: EngineContext): boolean {
  if (engine.mode !== "auto") return false;
  if (decision.verdict === "pause") return true;
  if (decision.verdict !== "scale" || decision.suggestedBudget == null || unit.budget == null) return false;
  if (decision.suggestedBudget > unit.budget * 1.3 + 1e-9) return false;
  const cap = enabled(engine, "daily_cap")[0];
  if (cap && ctx.dailyTotal - unit.budget + decision.suggestedBudget > cap.amount + 1e-9) return false;
  const wait = enabled(engine, "after_change")[0];
  return !wait || hoursSince(unit.lastChangedAt, ctx.now) >= wait.hours;
}
