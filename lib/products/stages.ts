// Dónde está un producto en su ruta, derivado de lo que hay en la base: la última optimización y la
// última propuesta de cliente ideal. Puro: lo usan lib/data (lista, ruta, Hoy) y los tests.
// Textos de design-system/reference/bundle.js (PP_STAGES y RV_STAGES: producto sin optimizar, reseñas).

import type { MeterStage } from "@/components/df/stage-meter";
import { money } from "@/lib/format";
import type { ContentStatus, ProductFilter, RunStatus, Stage, StageKey } from "@/lib/types";

export interface ProductFacts {
  price: number;
  currency: string;
  run?: { status: RunStatus; error?: string | null; createdAt: string } | null;
  avatar?: { status: ContentStatus; createdAt: string } | null;
  /** Reseñas importadas (etapa opcional): nunca bloquean ni se bloquean. */
  reviews?: ReviewFacts | null;
}

export interface ReviewFacts {
  pending: number;
  approved: number;
  total: number;
  importing?: boolean;
}

export type BasePhase = "new" | "optimizing" | "failed" | "review" | "done";

export interface ProductPosition {
  phase: BasePhase;
  stages: Stage[];
  meter: MeterStage[];
  filter: ProductFilter;
  reason: string;
  tone: "warning" | "danger" | "success" | "primary" | "muted";
  nextStage: StageKey;
  summary: string;
  /** Estado del contenido que se ve en el encabezado; sin optimizar no hay nada que mostrar. */
  status?: ContentStatus;
}

const pending = (s?: ContentStatus) => s === "generado" || s === "revision";

export function basePhase(f: ProductFacts): BasePhase {
  const run = f.run;
  if (run && (run.status === "queued" || run.status === "running")) return "optimizing";
  const avatarIsNewer = f.avatar && (!run || f.avatar.createdAt >= run.createdAt);
  if (run?.status === "failed" && !avatarIsNewer) return "failed";
  if (f.avatar?.status === "aprobado") return "done";
  if (pending(f.avatar?.status)) return "review";
  if (run?.status === "failed") return "failed";
  return "new";
}

const BASE_DESC: Record<BasePhase, string> = {
  new: "Lo que sabes del producto, imágenes y precio",
  optimizing: "La IA está definiendo a tu cliente ideal",
  failed: "No se pudo optimizar",
  review: "Tu cliente ideal espera tu revisión",
  done: "Cliente ideal aprobado · precio y packs listos",
};

const BASE_STATE: Record<BasePhase, Stage["state"]> = {
  new: "current",
  optimizing: "current",
  failed: "error",
  review: "review",
  done: "done",
};

const BASE_METER: Record<BasePhase, MeterStage> = {
  new: "current",
  optimizing: "current",
  failed: "error",
  review: "review",
  done: "done",
};

/** Reseñas: opcional, entre Información base y Textos (arquitectura.md › 9). */
function reviewsStage(r: ReviewFacts | null | undefined): { stage: Stage; meter: MeterStage } {
  const base = { key: "resenas", title: "Reseñas", optional: true } as const;
  if (r?.importing) return { stage: { ...base, state: "available", desc: "Importando de AliExpress" }, meter: "optional" };
  if (!r?.total) return { stage: { ...base, state: "available", desc: "Importa de AliExpress; la IA las usa para escribir" }, meter: "optional" };
  if (r.pending) return { stage: { ...base, state: "review", desc: `${r.pending} por revisar` }, meter: "review" };
  return { stage: { ...base, state: "done", desc: r.approved === 1 ? "1 aprobada" : `${r.approved} aprobadas` }, meter: "done" };
}

export function productPosition(f: ProductFacts): ProductPosition {
  const phase = basePhase(f);
  const done = phase === "done";
  const reviews = reviewsStage(f.reviews);
  const stages: Stage[] = [
    {
      key: "importado",
      title: "Información base",
      state: BASE_STATE[phase],
      desc: phase === "failed" && f.run?.error ? f.run.error : BASE_DESC[phase],
    },
    reviews.stage,
    // El precio y los packs viven en Información base (requisito para optimizar): no hay etapa de precio.
    { key: "textos", title: "Textos", state: done ? "current" : "locked", desc: done ? "Se generan con tu cliente ideal y tu oferta" : "Se generan con la información base" },
    { key: "imagenes", title: "Imágenes", state: "locked", desc: "Se generan desde tus imágenes de referencia" },
    { key: "publicar", title: "Publicar en tu tienda", state: "locked", desc: "Necesita textos e imágenes aprobados" },
    { key: "anuncios", title: "Anuncios", state: "locked", optional: true, desc: "Se habilita al publicar" },
  ];
  const meter: MeterStage[] = [BASE_METER[phase], reviews.meter, done ? "current" : "locked", "locked", "locked", "optional"];
  const price = f.price > 0 ? ` · ${money(f.price, f.currency)}` : "";

  switch (phase) {
    case "new":
      return { phase, stages, meter, filter: "avanzan", tone: "primary", reason: "Sin optimizar · agrega lo que sabes", nextStage: "importado", summary: `Importado de Shopify · sin optimizar${price}` };
    case "optimizing":
      return { phase, stages, meter, filter: "avanzan", tone: "primary", reason: "Optimizando con IA", nextStage: "importado", summary: `Optimizando con IA${price}` };
    case "failed":
      return { phase, stages, meter, filter: "detenidos", tone: "danger", reason: "No se pudo optimizar · reintenta", nextStage: "importado", summary: `No se pudo optimizar${price}`, status: "error" };
    case "review":
      return { phase, stages, meter, filter: "detenidos", tone: "warning", reason: "Espera tu revisión · cliente ideal", nextStage: "importado", summary: `Cliente ideal por revisar${price}`, status: "revision" };
    case "done":
      return { phase, stages, meter, filter: "avanzan", tone: "primary", reason: "Siguiente: textos", nextStage: "textos", summary: `Información base lista${price}`, status: "aprobado" };
  }
}

/** En qué fase la ficha del producto muestra la pantalla de información base (y no la ruta). */
export const showsBaseScreen = (phase: BasePhase) => phase !== "done";
