// Plantillas del sistema (docs/spec-anuncios.md §4.1 y §5.3). Una plantilla PRECARGA: aplicarla copia
// sus valores en la campaña y desde ahí la campaña es dueña de su configuración. Los montos están en
// CLP (como el material) y se convierten a la moneda de la cuenta al aplicar. Puro.

import { fromClp } from "./currency";
import { adsetCount, type EngineConfig, type LaunchConfig, type Rule, type Structure, type TemplateConfig } from "./schemas";

export const SYSTEM_PRESETS = [
  { key: "impulso", label: "Testeo ABO · 1 creativo por conjunto", structure: "abo" },
  { key: "impulso-temporada", label: "Testeo ABO · 3 ángulos (temporada)", structure: "abo" },
  { key: "gem", label: "Testeo ABO · con intereses", structure: "abo" },
  { key: "pancho", label: "Testeo ABO · muchos videos", structure: "abo" },
  { key: "tfl", label: "Testeo CBO · TFL", structure: "cbo" },
  { key: "cbo-winners", label: "Escalado CBO · ganadores", structure: "cbo" },
] as const satisfies readonly { key: string; label: string; structure: Structure }[];
export type PresetKey = (typeof SYSTEM_PRESETS)[number]["key"];

export const DEFAULT_PRESET: PresetKey = "impulso";
/** La plantilla por defecto de cada estructura. */
export const DEFAULT_PRESET_FOR: Record<Structure, PresetKey> = { abo: "impulso", cbo: "tfl" };

export const isPresetKey = (k: string): k is PresetKey => SYSTEM_PRESETS.some((p) => p.key === k);
export const presetLabel = (k: string) => SYSTEM_PRESETS.find((p) => p.key === k)?.label ?? k;

/** Regiones que Pancho excluye por despacho lento (se resuelven contra el catálogo de Meta en la pantalla). */
export const PANCHO_EXCLUDED_REGIONS = ["Arica", "Aysén", "Magallanes"];

/** Lo que la plantilla no sabe y pone el producto: país, moneda, CPA límite, creativos y textos. */
export interface PresetContext {
  country: string;
  currency: string;
  cpaLimit: number;
  creatives: string[];
  texts: Pick<LaunchConfig, "primary_texts" | "headlines" | "description">;
}

interface Numbers {
  structure: Structure;
  audiences: LaunchConfig["audiences"];
  cbo_ads: LaunchConfig["cbo_ads"];
  budgetClp: number;
  minAge: number;
  startHour: number;
}

const PRESET_NUMBERS: Record<PresetKey, Numbers> = {
  // Impulso Pro: 2 conjuntos abiertos, 1 creativo y 1 anuncio por conjunto, $5.000 cada uno, 06:00.
  impulso: { structure: "abo", audiences: [{ kind: "open", interests: [] }], cbo_ads: "one_per_creative", budgetClp: 5000, minAge: 18, startHour: 6 },
  // Impulso en temporada alta (docs/spec-angulos-testeo.md §6): 3 conjuntos de $5.000, uno por ángulo
  // de testeo (elige un creativo de cada ángulo); cada anuncio lleva el texto de su ángulo.
  "impulso-temporada": { structure: "abo", audiences: [{ kind: "open", interests: [] }], cbo_ads: "one_per_creative", budgetClp: 5000, minAge: 18, startHour: 6 },
  // GEM: cada creativo en un conjunto abierto y en uno con intereses, 35+.
  gem: {
    structure: "abo",
    audiences: [
      { kind: "open", interests: [] },
      { kind: "interests", interests: [] },
    ],
    cbo_ads: "one_per_creative",
    budgetClp: 5000,
    minAge: 35,
    startHour: 6,
  },
  // PanchoDrops: un conjunto por video, $2.000 cada uno, 05:00.
  pancho: { structure: "abo", audiences: [{ kind: "open", interests: [] }], cbo_ads: "one_per_creative", budgetClp: 2000, minAge: 18, startHour: 5 },
  // TFL: 1 abierto + 2 con intereses, un anuncio dinámico con hasta 6 medios, US$5/día en la campaña.
  tfl: {
    structure: "cbo",
    audiences: [
      { kind: "open", interests: [] },
      { kind: "interests", interests: [] },
      { kind: "interests", interests: [] },
    ],
    cbo_ads: "dco",
    budgetClp: 4750,
    minAge: 23,
    startHour: 6,
  },
  // Ganadores: los creativos que ganaron en la ABO, en un conjunto abierto, $40.000/día.
  "cbo-winners": { structure: "cbo", audiences: [{ kind: "open", interests: [] }], cbo_ads: "one_per_creative", budgetClp: 40000, minAge: 18, startHour: 6 },
};

/** Las reglas de Impulso (§5.3): la base de todas las plantillas. */
function impulsoRules(currency: string, dailyTotalClp: number): Rule[] {
  return [
    { id: "wait-spend", group: "wait", type: "min_spend", enabled: true, spend_x: 1, or_hours: 24 },
    { id: "wait-change", group: "wait", type: "after_change", enabled: true, hours: 72 },
    { id: "pause-no-sales", group: "pause", type: "no_sales", enabled: true, spend_x: 1 },
    { id: "pause-cpa", group: "pause", type: "cpa_over", enabled: true, cpa_x: 1, days: 3 },
    { id: "pause-ctr", group: "pause", type: "low_ctr", enabled: false, ctr_pct: 1, min_impressions: 1000 },
    { id: "scale-cpa", group: "scale", type: "cpa_under", enabled: true, cpa_x: 0.7, days: 3, min_sales: 2, step_pct: 20, every_hours: 72 },
    { id: "scale-cap", group: "scale", type: "daily_cap", enabled: true, amount: fromClp(dailyTotalClp * 6, currency) },
    { id: "scale-winners", group: "scale", type: "winners_to_cbo", enabled: true, min_winners: 3, cbo_budget: fromClp(40000, currency) },
  ];
}

function withRule(rules: Rule[], id: string, patch: Partial<Rule>): Rule[] {
  return rules.map((r) => (r.id === id ? ({ ...r, ...patch } as Rule) : r));
}

function presetRules(key: PresetKey, currency: string, dailyTotalClp: number): Rule[] {
  const base = impulsoRules(currency, dailyTotalClp);
  switch (key) {
    case "impulso":
    case "impulso-temporada":
      return base;
    case "gem":
      return [{ id: "wait-days", group: "wait", type: "min_days", enabled: true, days: 3 }, ...base];
    case "pancho":
      return [
        ...withRule(base, "wait-spend", { or_hours: 6 }),
        { id: "pause-intent", group: "pause", type: "intent_expired", enabled: true, hours: 24 },
      ];
    case "tfl":
      // «ROAS < BEROAS» es «CPA > 1× el CPA de equilibrio»; escala +25 % cada 72 h.
      return withRule(withRule(base, "wait-spend", { or_hours: 48 }), "scale-cpa", { cpa_x: 0.8, step_pct: 25 }).filter((r) => r.type !== "winners_to_cbo");
    case "cbo-winners":
      // «No tocar 2–3 días» y después las reglas de Impulso a nivel de campaña.
      return [{ id: "wait-days", group: "wait", type: "min_days", enabled: true, days: 3 }, ...base.filter((r) => r.type !== "winners_to_cbo")];
  }
}

/** La configuración completa de una plantilla del sistema para este producto. */
export function buildPreset(key: PresetKey, ctx: PresetContext): TemplateConfig {
  const n = PRESET_NUMBERS[key];
  const launch: LaunchConfig = {
    creatives: [...ctx.creatives],
    countries: [ctx.country],
    excluded_regions: [],
    location: "home_recent",
    min_age: n.minAge,
    audiences: n.audiences.map((a) => ({ kind: a.kind, interests: [...a.interests] })),
    cbo_ads: n.cbo_ads,
    budget: fromClp(n.budgetClp, ctx.currency),
    start: "tomorrow",
    start_hour: n.startHour,
    primary_texts: [...ctx.texts.primary_texts],
    headlines: [...ctx.texts.headlines],
    description: ctx.texts.description,
    cta: "SHOP_NOW",
  };
  // El tope diario parte de 6× el total inicial; sin creativos todavía, como si fueran 2 conjuntos.
  const sets = Math.max(adsetCount(n.structure, launch), n.structure === "abo" ? 2 * n.audiences.length : 1);
  const totalClp = n.structure === "abo" ? sets * n.budgetClp : n.budgetClp;
  const engine: EngineConfig = { mode: "suggest", cpa_limit: ctx.cpaLimit, rules: presetRules(key, ctx.currency, totalClp) };
  return { structure: n.structure, launch, engine };
}

/**
 * Cuántos valores cambió el comerciante sobre la plantilla (el contador de PresetSelect). Los
 * creativos no cuentan: la plantilla no los trae.
 */
export function countChanges(base: TemplateConfig, current: TemplateConfig): number {
  let n = 0;
  const keys = (Object.keys(base.launch) as (keyof LaunchConfig)[]).filter((k) => k !== "creatives");
  for (const k of keys) if (JSON.stringify(base.launch[k]) !== JSON.stringify(current.launch[k])) n++;
  if (base.engine.mode !== current.engine.mode) n++;
  if (base.engine.cpa_limit !== current.engine.cpa_limit) n++;
  const byId = new Map(base.engine.rules.map((r) => [r.id, JSON.stringify(r)]));
  for (const r of current.engine.rules) if (byId.get(r.id) !== JSON.stringify(r)) n++;
  for (const id of byId.keys()) if (!current.engine.rules.some((r) => r.id === id)) n++;
  return n;
}
