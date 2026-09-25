// Lógica del onboarding como funciones puras: reciben el estado (ya leído de Supabase) y la hora, y
// devuelven el estado nuevo o lo derivado. Las usan las rutas de app/api/onboarding y las páginas.
// Las conexiones con Shopify y Meta (I/O) viven en lib/integrations/.
import { fractionDigits } from "@/lib/format";
import { CLP_DEFAULTS } from "@/lib/pricing/plan";
import {
  OnboardingError,
  type CatalogProduct,
  type GenerationStatus,
  type Numbers,
  type OnboardingSnapshot,
  type OnboardingState,
  type StepKey,
} from "./types";

export const PLAN_LIMIT = 10;
/** Generación simulada: el primer producto tarda 8 s; los siguientes, 18 s cada uno, en cola. */
const FIRST_MS = 8_000;
const NEXT_MS = 18_000;

// ---------- Productos ----------

const SCORE = { Alta: 3, Media: 2, Baja: 1 } as const;

/** Recomendados: ventas × potencial de mejora; los 12 primeros. */
export function recommended(products: CatalogProduct[]): CatalogProduct[] {
  return [...products]
    .sort((a, b) => b.sales30 * SCORE[b.score] - a.sales30 * SCORE[a.score] || b.sales30 - a.sales30 || SCORE[b.score] - SCORE[a.score])
    .slice(0, 12);
}

export function productLists(all: CatalogProduct[], total: number) {
  const rec = recommended(all);
  return { recommended: rec, all, total: Math.max(total, all.length), defaultSelection: rec.slice(0, 3).map((p) => p.id) };
}

export function saveSelection(state: OnboardingState, ids: string[], known: Set<string>): OnboardingState {
  const unique = [...new Set(ids)].filter((id) => known.has(id));
  if (!unique.length) throw new OnboardingError("Elige al menos un producto para empezar.", 400, "ids");
  if (unique.length > PLAN_LIMIT) throw new OnboardingError(`Tu plan incluye ${PLAN_LIMIT} productos al mes. Quita ${unique.length - PLAN_LIMIT} para seguir.`, 400, "ids");
  return { ...state, selected: unique };
}

// ---------- Tus números ----------

const round = (value: number, currency: string) => {
  const f = 10 ** fractionDigits(currency);
  return Math.round(value * f) / f;
};

/**
 * Valores sugeridos. En CLP, el envío por defecto del costeo ($9.000, CLP_DEFAULTS) y $6.000 de CPA. En otras
 * monedas, la misma proporción sobre la mediana de precios de la tienda (14% y 24%, las de
 * $3.500 y $6.000 sobre $24.990 en el ejemplo del design system). La entrega aún no se calcula
 * con los pedidos (spec D7): 8 de 10.
 */
export function suggestedNumbers(currency: string, prices: number[]): Numbers {
  if (!currency || currency === "CLP" || !prices.length) return { deliveredOf10: 8, shipping: CLP_DEFAULTS.avgShippingCost, maxCpa: 6000 };
  const sorted = [...prices].filter((p) => p > 0).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  if (!median) return { deliveredOf10: 8, shipping: 0, maxCpa: 0 };
  return { deliveredOf10: 8, shipping: round(median * 0.14, currency), maxCpa: round(median * 0.24, currency) };
}

export function validateNumbers(n: Partial<Numbers>, currency: string): Numbers {
  const d = Number(n.deliveredOf10);
  if (!Number.isInteger(d) || d < 1 || d > 10) throw new OnboardingError("Escribe un número del 1 al 10.", 400, "deliveredOf10");
  const s = Number(n.shipping);
  if (!Number.isFinite(s) || s < 0) throw new OnboardingError("Escribe cuánto te cobra el envío por pedido.", 400, "shipping");
  const c = Number(n.maxCpa);
  if (!Number.isFinite(c) || c <= 0) throw new OnboardingError("Escribe cuánto puedes pagar como máximo por venta.", 400, "maxCpa");
  return { deliveredOf10: d, shipping: round(s, currency), maxCpa: round(c, currency) };
}

/** Guarda los números y arranca la generación (“Empezar a generar”). */
export function saveNumbers(
  state: OnboardingState,
  input: Partial<Numbers> | null,
  now: number,
  ctx: { currency: string; suggested: Numbers; products: Map<string, { name: string; image: string }> },
): OnboardingState {
  if (!state.selected.length) throw new OnboardingError("Primero elige con qué productos empezar.", 409);
  const numbers = input ? { ...validateNumbers(input, ctx.currency), suggested: false } : { ...ctx.suggested, suggested: true };
  const same = state.generation?.items.map((i) => i.id).join() === state.selected.join();
  const generation = same
    ? state.generation
    : {
        startedAt: now,
        items: state.selected.map((id) => ({ id, name: ctx.products.get(id)?.name ?? "Producto", image: ctx.products.get(id)?.image ?? "" })),
      };
  return { ...state, numbers, generation };
}

// ---------- Generación (simulada) ----------

export function generationStatus(state: OnboardingState, now: number): GenerationStatus | undefined {
  const g = state.generation;
  if (!g) return undefined;
  const elapsed = now - g.startedAt;
  let cursor = 0;
  const items = g.items.map((p, i) => {
    const start = cursor;
    const duration = i === 0 ? FIRST_MS : NEXT_MS;
    cursor += duration;
    if (elapsed >= cursor) return { id: p.id, name: p.name, image: p.image, status: "generado" as const, detail: "8 textos · 6 imágenes" };
    if (elapsed >= start) {
      const half = elapsed - start < duration / 2;
      return { id: p.id, name: p.name, image: p.image, status: "publicando" as const, detail: half ? "Escribiendo textos" : "Creando imágenes" };
    }
    const mins = Math.max(1, Math.ceil((start - elapsed) / 60_000));
    return { id: p.id, name: p.name, image: p.image, status: "cola" as const, detail: `Empieza en ~${mins} min` };
  });
  const done = items.filter((i) => i.status === "generado").length;
  const remaining = Math.max(0, cursor - elapsed);
  const first = items.find((i) => i.status === "generado");
  return {
    items,
    done,
    eta: remaining > 0 ? `unos ${Math.max(1, Math.ceil(remaining / 60_000))} min` : undefined,
    firstReady: first ? { id: first.id, name: first.name } : undefined,
  };
}

// ---------- Meta Ads ----------

/** “Conectar después”: no pierde nada; queda en SetupChecklist. */
export function skipMeta(state: OnboardingState, now: number): OnboardingState {
  if (!state.numbers) throw new OnboardingError("Primero define tus números.", 409);
  return { ...state, meta: state.meta?.status === "connected" ? state.meta : { status: "later" }, finishedAt: state.finishedAt ?? now };
}

export function finish(state: OnboardingState, now: number): OnboardingState {
  return { ...state, finishedAt: state.finishedAt ?? now };
}

// ---------- Paso pendiente y resumen ----------

export function pendingStep(state: OnboardingState): StepKey {
  if (!state.shop || (state.shop.status !== "connected" && state.shop.status !== "importing")) return "shopify";
  if (!state.selected.length) return "productos";
  if (!state.numbers) return "numeros";
  if (!state.meta || state.meta.status === "authorizing" || state.meta.status === "error") return "meta";
  if (state.meta.status === "action") return "meta-cuentas";
  return "listo";
}

export { STEP_PATH } from "./paths";

const ORDER: StepKey[] = ["shopify", "productos", "numeros", "meta", "meta-cuentas", "listo"];

/** ¿Se puede entrar a este paso? A los ya hechos se vuelve; a los siguientes, no. */
export function canVisit(state: OnboardingState, step: StepKey): boolean {
  const pending = pendingStep(state);
  if (step === "meta-cuentas") return state.meta?.status === "action" || state.meta?.status === "connected";
  if (step === "listo") return pending === "listo";
  return ORDER.indexOf(step) <= ORDER.indexOf(pending === "meta-cuentas" ? "meta" : pending);
}

export function snapshot(state: OnboardingState, now: number): OnboardingSnapshot {
  return {
    step: pendingStep(state),
    account: state.account,
    shop: state.shop,
    selected: state.selected,
    numbers: state.numbers,
    generation: generationStatus(state, now),
    meta: state.meta,
    finished: Boolean(state.finishedAt),
    checklistHidden: state.checklistHidden,
    planLimit: PLAN_LIMIT,
  };
}
