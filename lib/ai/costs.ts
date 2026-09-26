// Costo de IA de un producto (design-system/arquitectura.md › 11): suma las filas de ai_generations,
// las reparte por etapa y arma el historial. Módulo puro: sin I/O, testeable.
import { money } from "@/lib/format";
import type { AiRun, AiStageCost, ProductAiCost, StageKey } from "@/lib/types";

/** Cada paso que llama a un modelo. Un paso nuevo se agrega aquí, con su etapa y su nombre. */
export const AI_STEPS = {
  product_brief: { stage: "importado", label: "Ficha del producto" },
  customer_avatar: { stage: "importado", label: "Cliente ideal" },
  pack_labels: { stage: "importado", label: "Nombres de los packs" },
  competitor_analysis: { stage: "importado", label: "Análisis de competencia" },
  angle_ranking: { stage: "angulos", label: "Ranking de ángulos" },
  angle_brief: { stage: "angulos", label: "Desarrollo" },
  page_copy: { stage: "textos", label: "Página del producto" },
  event_copy: { stage: "textos", label: "Textos del evento" },
  page_plan: { stage: "imagenes", label: "Ideas de imágenes" },
  page_render: { stage: "imagenes", label: "Imagen de la página" },
  page_qa: { stage: "imagenes", label: "Revisión de imagen" },
  creative_concepts: { stage: "creativos", label: "Ideas de anuncios" },
  creative_chat: { stage: "creativos", label: "Chat de WhatsApp" },
  creative_render: { stage: "creativos", label: "Imagen de anuncio" },
  creative_qa: { stage: "creativos", label: "Revisión de imagen" },
  ugc_script: { stage: "creativos", label: "Guion de video" },
  video_keyframe: { stage: "creativos", label: "Imagen clave de video" },
  video_qa: { stage: "creativos", label: "Revisión de imagen clave" },
  video_clip: { stage: "creativos", label: "Clip de video" },
} as const satisfies Record<string, { stage: StageKey; label: string }>;

export type AiStep = keyof typeof AI_STEPS;

/**
 * USD por llamada cuando el producto todavía no tiene historial del paso. Promedios observados con
 * Claude Opus 5 (evaluación ~US$0,15; desarrollo con effort high ~US$0,30).
 */
const DEFAULT_STEP_USD: Partial<Record<AiStep, number>> = {
  angle_ranking: 0.15,
  angle_brief: 0.3,
  page_copy: 0.2,
  event_copy: 0.03,
  creative_concepts: 0.2,
  creative_chat: 0.05,
  ugc_script: 0.25,
  page_plan: 0.25,
};

/** Etapas que gastan IA, en el orden de la ruta. */
export const AI_STAGES: StageKey[] = ["importado", "angulos", "textos", "imagenes", "creativos"];

export interface GenerationRow {
  step: string;
  detail: string | null;
  model: string;
  status: "succeeded" | "failed";
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | string | null;
  created_at: string;
}

/** Por qué falló, en palabras del comerciante. */
function failReason(code: string | null): string {
  if (!code) return "no respondió";
  if (code.startsWith("invalid_") && code !== "invalid_output") return "no cumplía las reglas";
  if (code === "invalid_output") return "formato inesperado";
  if (code === "max_tokens") return "respuesta incompleta";
  if (code === "refusal") return "la IA no quiso";
  if (code === "rate_limited" || code === "busy") return "mucha demanda";
  if (code === "blocked" || code === "nsfw") return "rechazada por reglas de contenido";
  return "no respondió";
}

const decimal1 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const upTo1 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

/** 850 tok · 18,2k tok */
export function tokens(n: number): string {
  return n < 1000 ? `${n} tok` : `${decimal1.format(n / 1000)}k tok`;
}

const rowTokens = (r: GenerationRow) => (r.input_tokens ?? 0) + (r.output_tokens ?? 0) + (r.cache_read_tokens ?? 0) + (r.cache_write_tokens ?? 0);
const rowUsd = (r: GenerationRow) => (r.cost_usd == null ? 0 : Number(r.cost_usd));

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** “hoy 10:42”, “ayer 18:02”, “12 sep 18:02”, en la zona horaria de la tienda. */
export function when(iso: string, now: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const time = new Intl.DateTimeFormat("es-CL", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const d = day.format(new Date(iso));
  if (d === day.format(now)) return `hoy ${time}`;
  if (d === day.format(new Date(now.getTime() - 86_400_000))) return `ayer ${time}`;
  // Meses fijos: el “short” de ICU cambia entre versiones (“sep” / “sept.”).
  const [, m, dd] = d.split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${time}`;
}

export interface SummarizeOptions {
  currency: string;
  /** Unidades de la moneda de la tienda por dólar. */
  usdRate: number;
  /** Nombre de cada etapa en la ruta y, si no se puede usar todavía, por qué. */
  stages: { key: StageKey; title: string; note?: string }[];
  cap?: number | null;
  /** Ganancia por venta (PricingPlan.profit), para dar contexto a la cifra. */
  profit?: number | null;
  running?: boolean;
  admin?: boolean;
  timeZone?: string;
  now?: Date;
}

export function summarizeAiCost(rows: GenerationRow[], o: SummarizeOptions): ProductAiCost {
  const now = o.now ?? new Date();
  const timeZone = o.timeZone || "America/Santiago";
  const local = (usd: number) => usd * o.usdRate;
  const title = (key: StageKey) => o.stages.find((s) => s.key === key)?.title ?? key;
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Generar, regenerar o reintentar: se decide por lo que pasó antes con lo mismo (paso + detalle).
  const last = new Map<string, GenerationRow["status"]>();
  const items: { run: AiRun; stageKey: StageKey; usd: number; tok: number }[] = sorted.map((r) => {
    const def = AI_STEPS[r.step as AiStep];
    const stageKey: StageKey = def?.stage ?? "importado";
    const key = `${r.step}|${r.detail ?? ""}`;
    const before = last.get(key);
    last.set(key, r.status);
    const kind: AiRun["kind"] = r.status === "failed" ? "fail" : before === "failed" ? "retry" : before ? "regen" : "gen";
    const base = [def?.label ?? r.step, r.detail].filter(Boolean).join(" · ");
    const usd = rowUsd(r);
    const tok = rowTokens(r);
    const run: AiRun = {
      kind,
      what: kind === "fail" ? `${base} (${failReason(r.error_code)})` : base,
      stage: title(stageKey),
      when: when(r.created_at, now, timeZone),
      cost: usd ? local(usd) : undefined,
      ...(o.admin ? { model: r.model.replace(/^claude-/, ""), tokens: tok ? tokens(tok) : "—" } : {}),
    };
    return { run, stageKey, usd, tok };
  });

  const stages: AiStageCost[] = AI_STAGES.map((key) => {
    const mine = items.filter((r) => r.stageKey === key);
    const usd = mine.reduce((s, r) => s + r.usd, 0);
    const tok = mine.reduce((s, r) => s + r.tok, 0);
    const retries = mine.filter((r) => r.run.kind === "retry").length;
    return {
      label: title(key),
      cost: local(usd),
      runs: mine.length,
      ...(retries ? { retries } : {}),
      ...(mine.length ? {} : { note: o.stages.find((s) => s.key === key)?.note ?? "Sin uso aún" }),
      ...(o.admin && tok ? { tokens: tokens(tok) } : {}),
    };
  });

  // Estimado por paso: el promedio de lo que ya costó en este producto o, si no hay, la referencia.
  const estimates: Record<string, number> = {};
  for (const step of Object.keys(AI_STEPS) as AiStep[]) {
    const paid = sorted.filter((r) => r.step === step && rowUsd(r) > 0).map(rowUsd);
    const usd = paid.length ? paid.reduce((a, b) => a + b, 0) / paid.length : DEFAULT_STEP_USD[step];
    if (usd) estimates[step] = local(usd);
  }

  const totalUsd = items.reduce((s, r) => s + r.usd, 0);
  const total = local(totalUsd);
  const context =
    !o.admin && o.profit && o.profit > 0 && total > 0
      ? `Equivale al ${upTo1.format((total / o.profit) * 100)}% de lo que ganas en una venta (${money(o.profit, o.currency)}).`
      : null;

  return {
    currency: o.currency,
    total,
    totalUsd,
    generations: items.length,
    ...(o.cap ? { cap: o.cap } : {}),
    stages,
    runs: items.map((i) => i.run).reverse(),
    context,
    running: Boolean(o.running),
    audience: o.admin ? "admin" : "merchant",
    estimates,
  };
}

/** Tono del tope: aviso desde el 80%, sobre el tope en rojo. */
export function capTone(total: number, cap?: number | null): "ok" | "warn" | "over" {
  if (!cap) return "ok";
  const pct = total / cap;
  return pct >= 1 ? "over" : pct >= 0.8 ? "warn" : "ok";
}
