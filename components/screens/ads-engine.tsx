"use client";

import { RuleGroup, RuleRow, type RuleGroupKind, type RulePart } from "@/components/df";
import { ruleSentence, xLabel } from "@/lib/ads/engine";
import { MAX_SCALE_STEP_PCT, type EngineConfig, type Rule, type RuleType, type Structure } from "@/lib/ads/schemas";
import { currencySymbol, money } from "@/lib/format";

// Las reglas del motor como frases con los valores en línea (RuleGroup + RuleRow, design-system/
// anuncios.md). La configuración es de ESTA campaña: el configurador y el detalle de la campaña
// editan la misma forma.

const MULTIPLIERS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.3, 1.5, 2, 3];
const HOURS = [6, 12, 24, 48, 72, 96, 120];
const DAYS = [1, 2, 3, 4, 5, 7];
const STEPS = [10, 15, 20, 25, MAX_SCALE_STEP_PCT];

const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));

function sel(label: string, value: number, list: number[], fmt: (v: number) => string, onChange: (v: number) => void): RulePart {
  return { kind: "select", label, value: String(value), options: withValue(list, value).map((v) => ({ value: String(v), label: fmt(v) })), onChange: (v) => onChange(Number(v)) };
}

const hoursFmt = (v: number) => `${v} h`;
const daysFmt = (v: number) => (v === 1 ? "1 día" : `${v} días`);

/** Las partes de la frase de cada regla, con sus controles. */
function ruleParts(r: Rule, set: (patch: Partial<Rule>) => void, cpa: number, currency: string): RulePart[] {
  const sym = currencySymbol(currency);
  switch (r.type) {
    case "min_spend":
      return ["No decidir antes de gastar ", sel("Veces el CPA límite", r.spend_x, MULTIPLIERS, xLabel, (v) => set({ spend_x: v })), ` tu CPA límite (${money(r.spend_x * cpa, currency)}) o de `, sel("Horas", r.or_hours, HOURS, hoursFmt, (v) => set({ or_hours: v }))];
    case "after_change":
      return ["Tras editar o escalar, esperar ", sel("Horas", r.hours, HOURS, hoursFmt, (v) => set({ hours: v }))];
    case "min_days":
      return ["No decidir antes de ", sel("Días completos", r.days, DAYS, daysFmt, (v) => set({ days: v })), " completos"];
    case "no_sales":
      return ["Si gasta ", sel("Veces el CPA límite", r.spend_x, MULTIPLIERS, xLabel, (v) => set({ spend_x: v })), " el CPA límite sin ventas"];
    case "cpa_over":
      return ["Si el CPA supera ", sel("Veces el CPA límite", r.cpa_x, MULTIPLIERS, xLabel, (v) => set({ cpa_x: v })), " el límite por ", sel("Días", r.days, DAYS, daysFmt, (v) => set({ days: v }))];
    case "low_ctr":
      return [
        "Si el CTR es menor a ",
        { kind: "number", label: "CTR mínimo", value: r.ctr_pct, min: 0.1, max: 10, suffix: "%", format: (v) => v.toLocaleString("es-CL"), onChange: (v) => set({ ctr_pct: v }) },
        " tras ",
        { kind: "number", label: "Impresiones", value: r.min_impressions, min: 100, max: 1_000_000, onChange: (v) => set({ min_impressions: Math.round(v) }) },
        " impresiones, sin ventas",
      ];
    case "intent_expired":
      return ["Si hay pagos iniciados sin compra tras ", sel("Horas", r.hours, HOURS, hoursFmt, (v) => set({ hours: v }))];
    case "cpa_under":
      return [
        "Si el CPA es ",
        sel("Veces el CPA límite", r.cpa_x, MULTIPLIERS, (v) => `≤ ${xLabel(v)}`, (v) => set({ cpa_x: v })),
        " el límite por ",
        sel("Días", r.days, DAYS, daysFmt, (v) => set({ days: v })),
        " con ",
        { kind: "number", label: "Ventas mínimas", value: r.min_sales, min: 1, max: 100, onChange: (v) => set({ min_sales: Math.round(v) }) },
        " ventas, subir ",
        sel("Paso de escalado", r.step_pct, STEPS, (v) => `+${v} %`, (v) => set({ step_pct: v })),
        " cada ",
        sel("Horas", r.every_hours, HOURS, hoursFmt, (v) => set({ every_hours: v })),
      ];
    case "daily_cap":
      return ["Nunca pasar de ", { kind: "number", label: "Tope diario", value: r.amount, min: 1, prefix: sym, onChange: (v) => set({ amount: v }) }, " diarios"];
    case "winners_to_cbo":
      return [
        "Con ",
        { kind: "number", label: "Conjuntos ganadores", value: r.min_winners, min: 1, max: 10, onChange: (v) => set({ min_winners: Math.round(v) }) },
        " conjuntos ganadores, sugerir una CBO de ",
        { kind: "number", label: "Presupuesto de la CBO", value: r.cbo_budget, min: 1, prefix: sym, onChange: (v) => set({ cbo_budget: v }) },
        "/día",
      ];
  }
}

/** Reglas que se pueden agregar a cada grupo, con sus valores por defecto. */
function newRule(type: RuleType, cpaCap: number): Rule {
  const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "min_spend":
      return { id, group: "wait", type, enabled: true, spend_x: 1, or_hours: 24 };
    case "after_change":
      return { id, group: "wait", type, enabled: true, hours: 72 };
    case "min_days":
      return { id, group: "wait", type, enabled: true, days: 3 };
    case "no_sales":
      return { id, group: "pause", type, enabled: true, spend_x: 1 };
    case "cpa_over":
      return { id, group: "pause", type, enabled: true, cpa_x: 1, days: 3 };
    case "low_ctr":
      return { id, group: "pause", type, enabled: true, ctr_pct: 1, min_impressions: 1000 };
    case "intent_expired":
      return { id, group: "pause", type, enabled: true, hours: 24 };
    case "cpa_under":
      return { id, group: "scale", type, enabled: true, cpa_x: 0.7, days: 3, min_sales: 2, step_pct: 20, every_hours: 72 };
    case "daily_cap":
      return { id, group: "scale", type, enabled: true, amount: cpaCap };
    case "winners_to_cbo":
      return { id, group: "scale", type, enabled: true, min_winners: 3, cbo_budget: cpaCap };
  }
}

const ADDABLE: Record<RuleGroupKind, { type: RuleType; label: string }[]> = {
  wait: [
    { type: "min_spend", label: "Gasto mínimo antes de decidir" },
    { type: "after_change", label: "Espera tras un cambio" },
    { type: "min_days", label: "Días completos antes de decidir" },
  ],
  pause: [
    { type: "no_sales", label: "Gasto sin ventas" },
    { type: "cpa_over", label: "CPA sobre el límite" },
    { type: "low_ctr", label: "CTR bajo sin ventas" },
    { type: "intent_expired", label: "Pagos iniciados sin compra" },
  ],
  scale: [
    { type: "cpa_under", label: "CPA bajo el límite" },
    { type: "daily_cap", label: "Tope diario" },
    { type: "winners_to_cbo", label: "Ganadores a una CBO" },
  ],
};

export interface EngineRulesProps {
  engine: EngineConfig;
  structure: Structure;
  currency: string;
  /** El total diario de la campaña (base del tope por defecto). */
  dailyTotal: number;
  onChange: (engine: EngineConfig) => void;
  disabled?: boolean;
  /** Solo algunos grupos (el detalle de la campaña muestra Esperar y Pausar al lado de las decisiones). */
  groups?: RuleGroupKind[];
}

/** Los 3 grupos de reglas de la campaña. */
export function EngineRules({ engine, structure, currency, dailyTotal, onChange, disabled, groups = ["wait", "pause", "scale"] }: EngineRulesProps) {
  const cbo = structure === "cbo";
  const level: Record<RuleGroupKind, string> = { wait: cbo ? "Por anuncio" : "Por conjunto", pause: cbo ? "Por anuncio" : "Por conjunto", scale: cbo ? "Campaña" : "Por conjunto" };
  const update = (id: string, patch: Partial<Rule>) => onChange({ ...engine, rules: engine.rules.map((r) => (r.id === id ? ({ ...r, ...patch } as Rule) : r)) });
  const remove = (id: string) => onChange({ ...engine, rules: engine.rules.filter((r) => r.id !== id) });
  const add = (type: RuleType) => onChange({ ...engine, rules: [...engine.rules, newRule(type, Math.max(dailyTotal * 6, engine.cpa_limit))] });
  const duplicate = (r: Rule) => onChange({ ...engine, rules: [...engine.rules, { ...r, id: `${r.type}-${Math.random().toString(36).slice(2, 7)}` }] });

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const rules = engine.rules.filter((r) => r.group === g && !(cbo && r.type === "winners_to_cbo"));
        const present = new Set(rules.map((r) => r.type));
        // Una sola de cada tipo, salvo las que tiene sentido repetir con otros valores.
        const addable = ADDABLE[g].filter((a) => !present.has(a.type) && !(cbo && a.type === "winners_to_cbo"));
        return (
          <RuleGroup key={g} kind={g} level={level[g]} disabled={disabled} add={addable.map((a) => ({ label: a.label, onSelect: () => add(a.type) }))}>
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                enabled={r.enabled}
                disabled={disabled}
                sentence={ruleSentence(r, currency)}
                onToggle={(enabled) => update(r.id, { enabled })}
                parts={ruleParts(r, (patch) => update(r.id, patch), engine.cpa_limit, currency)}
                actions={[
                  ...(r.type === "cpa_over" || r.type === "no_sales" ? [{ label: "Duplicar", onSelect: () => duplicate(r) }] : []),
                  { label: "Eliminar", onSelect: () => remove(r.id), destructive: true },
                ]}
              />
            ))}
          </RuleGroup>
        );
      })}
    </div>
  );
}

/** El resumen de una línea de la sección del motor. */
export function engineSummary(engine: EngineConfig): string {
  const n = (g: Rule["group"]) => engine.rules.filter((r) => r.group === g && r.enabled).length;
  const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return `${count(n("wait"), "regla de espera", "reglas de espera")} · ${count(n("pause"), "de pausa", "de pausa")} · ${count(n("scale"), "de escalado", "de escalado")} · ${engine.mode === "auto" ? "automático" : "solo recomendar"}`;
}
