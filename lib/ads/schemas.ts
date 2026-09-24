// La configuración de una campaña (docs/spec-anuncios.md §4–§5, §7): lo que se crea en Meta (`launch`)
// y cómo decide el motor (`engine`). Se guarda EN CADA CAMPAÑA (ad_campaigns.launch / .engine) y en
// las plantillas propias; las del sistema la arman en lib/ads/presets.ts. Una sola definición para la
// validación del servidor, los tipos y la pantalla. Claves en inglés (snake_case, como todo JSON guardado).

import * as z from "zod/v4";

export const STRUCTURES = ["abo", "cbo"] as const;
export type Structure = (typeof STRUCTURES)[number];

/** Techo de cada paso de escalado (C15). */
export const MAX_SCALE_STEP_PCT = 30;
export const MAX_PRIMARY_TEXTS = 5;
export const MAX_HEADLINES = 5;
/** Largos recomendados por Meta: más largo se corta en el feed. */
export const PRIMARY_TEXT_LIMIT = 500;
export const HEADLINE_LIMIT = 40;
export const DESCRIPTION_LIMIT = 30;
/** Un anuncio DCO de CBO lleva hasta 6 medios (TFL). */
export const MAX_DCO_MEDIA = 6;
/** Conjuntos por campaña: más que esto es un error de configuración (Pancho llega a 9). */
export const MAX_ADSETS = 12;

const interest = z.object({ id: z.string().min(1), name: z.string().min(1) });
const region = z.object({ key: z.string().min(1), name: z.string().min(1) });

/** Un público: abierto (Advantage+) o por intereses. En ABO se cruza con cada creativo; en CBO es un conjunto. */
export const audienceSchema = z.object({
  kind: z.enum(["open", "interests"]),
  interests: z.array(interest).max(25),
});
export type Audience = z.infer<typeof audienceSchema>;

export const launchSchema = z
  .object({
    /** ad_media.id en el orden elegido. ABO: un conjunto por creativo (y por público); CBO: anuncios. */
    creatives: z.array(z.string().uuid()).max(MAX_ADSETS * 2),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(10),
    excluded_regions: z.array(region).max(50),
    /** `home_recent`: vive o estuvo hace poco (lo que Meta usa por defecto); `home`: solo vive. */
    location: z.enum(["home_recent", "home"]),
    min_age: z.number().int().min(18).max(65),
    audiences: z.array(audienceSchema).min(1).max(4),
    /** CBO: un anuncio por creativo, o uno dinámico con todos los medios (TFL). */
    cbo_ads: z.enum(["one_per_creative", "dco"]),
    /** Diario: por conjunto en ABO, de la campaña en CBO. En la moneda de la cuenta. */
    budget: z.number().positive(),
    /** `tomorrow`: mañana a `start_hour` (hora de la cuenta); `now`: al publicar. */
    start: z.enum(["tomorrow", "now"]),
    start_hour: z.number().int().min(0).max(23),
    primary_texts: z.array(z.string().trim().min(1).max(PRIMARY_TEXT_LIMIT)).min(1).max(MAX_PRIMARY_TEXTS),
    headlines: z.array(z.string().trim().min(1).max(HEADLINE_LIMIT)).min(1).max(MAX_HEADLINES),
    description: z.string().trim().max(DESCRIPTION_LIMIT),
    cta: z.enum(["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE"]),
  })
  .superRefine((v, ctx) => {
    v.audiences.forEach((a, i) => {
      if (a.kind === "interests" && a.interests.length === 0) ctx.addIssue({ code: "custom", path: ["audiences", i, "interests"], message: "Elige al menos un interés o usa público abierto." });
    });
  });
export type LaunchConfig = z.infer<typeof launchSchema>;

// ---------------------------------------------------------------- Reglas del motor (§5.1)
// Tipos fijos con parámetros: la pantalla los escribe como frases (RuleRow) y el código los evalúa sin
// ambigüedad. Los montos van como múltiplos del CPA límite de la campaña.

const x = z.number().min(0.1).max(10);
const hours = z.number().int().min(1).max(336);
const days = z.number().int().min(1).max(14);
const base = { id: z.string().min(1).max(40), enabled: z.boolean() };

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ ...base, group: z.literal("wait"), type: z.literal("min_spend"), spend_x: x, or_hours: hours }),
  z.object({ ...base, group: z.literal("wait"), type: z.literal("after_change"), hours }),
  z.object({ ...base, group: z.literal("wait"), type: z.literal("min_days"), days }),
  z.object({ ...base, group: z.literal("pause"), type: z.literal("no_sales"), spend_x: x }),
  z.object({ ...base, group: z.literal("pause"), type: z.literal("cpa_over"), cpa_x: x, days }),
  z.object({ ...base, group: z.literal("pause"), type: z.literal("low_ctr"), ctr_pct: z.number().min(0.1).max(10), min_impressions: z.number().int().min(100).max(1_000_000) }),
  z.object({ ...base, group: z.literal("pause"), type: z.literal("intent_expired"), hours }),
  z.object({
    ...base,
    group: z.literal("scale"),
    type: z.literal("cpa_under"),
    cpa_x: x,
    days,
    min_sales: z.number().int().min(1).max(100),
    step_pct: z.number().min(1).max(MAX_SCALE_STEP_PCT),
    every_hours: hours,
  }),
  z.object({ ...base, group: z.literal("scale"), type: z.literal("daily_cap"), amount: z.number().positive() }),
  z.object({ ...base, group: z.literal("scale"), type: z.literal("winners_to_cbo"), min_winners: z.number().int().min(1).max(10), cbo_budget: z.number().positive() }),
]);
export type Rule = z.infer<typeof ruleSchema>;
export type RuleType = Rule["type"];
export type RuleGroup = Rule["group"];
export type RuleOf<T extends RuleType> = Extract<Rule, { type: T }>;

export const ENGINE_MODES = ["suggest", "auto"] as const;
export type EngineMode = (typeof ENGINE_MODES)[number];

export const engineSchema = z
  .object({
    mode: z.enum(ENGINE_MODES),
    /** CPA límite de ESTA campaña (por defecto, el CPA máximo del producto). */
    cpa_limit: z.number().positive(),
    rules: z.array(ruleSchema).max(20),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.rules.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", path: ["rules", i, "id"], message: "Regla repetida." });
      ids.add(r.id);
    });
  });
export type EngineConfig = z.infer<typeof engineSchema>;

/** Lo que sale de validar con el presupuesto a la vista: el tope diario no puede quedar bajo lo que ya se gasta. */
export function engineProblems(engine: EngineConfig, dailyTotal: number): string[] {
  const problems: string[] = [];
  for (const r of engine.rules) {
    if (r.type === "daily_cap" && r.enabled && r.amount < dailyTotal) problems.push("El tope diario del motor es menor que el presupuesto diario de la campaña.");
    if (r.type === "cpa_under" && r.step_pct > MAX_SCALE_STEP_PCT) problems.push(`Cada paso de escalado sube como máximo ${MAX_SCALE_STEP_PCT} %.`);
  }
  return problems;
}

/** Una plantilla: la estructura y los valores de lanzamiento y del motor que precarga. */
export interface TemplateConfig {
  structure: Structure;
  launch: LaunchConfig;
  engine: EngineConfig;
}

/** Cuántos conjuntos crea una configuración (ABO: creativos × públicos; CBO: un conjunto por público). */
export function adsetCount(structure: Structure, launch: Pick<LaunchConfig, "creatives" | "audiences">): number {
  return structure === "abo" ? launch.creatives.length * launch.audiences.length : launch.audiences.length;
}

/** El total diario comprometido: ABO, conjuntos × presupuesto; CBO, el de la campaña. */
export function dailyTotal(structure: Structure, launch: Pick<LaunchConfig, "creatives" | "audiences" | "budget">): number {
  return structure === "abo" ? adsetCount(structure, launch) * launch.budget : launch.budget;
}
