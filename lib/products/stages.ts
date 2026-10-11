// Dónde está un producto en su ruta, derivado de lo que hay en la base: los datos del producto y el
// precio (Información base), las reseñas (opcional), la selección canónica y la página del producto. Puro: lo usan lib/data (lista, ruta, Hoy) y los tests.
// Textos de design-system/reference/bundle.js (PP_STAGES, RV_STAGES y ANG_STAGES).

import { contentSituation, type ProductContentState } from "./content-state";
import type { MeterStage } from "@/components/df/stage-meter";
import { type CopyProgress } from "@/lib/copy/progress";
import type { ContentStatus, ProductFilter, RunStatus, Stage, StageKey } from "@/lib/types";

export interface CopyFacts {
  fromChat?: boolean;
  /** La escritura más reciente de la página. */
  run: { status: RunStatus; error?: string | null } | null;
  progress: CopyProgress;
  /** Los ángulos cambiaron después de escribirla. */
  stale?: boolean;
}

export interface PublishFacts {
  status: "publishing" | "published" | "error";
  error?: string | null;
}

export interface ProductFacts {
  price: number;
  currency: string;
  /** Información base: los datos del producto identificados y el precio guardado. */
  base?: { described: boolean; priced: boolean } | null;
  intelligence?: { selected: boolean; ready: boolean };
  copy?: CopyFacts | null;
  /** Reseñas importadas (etapa opcional): nunca bloquean ni se bloquean. */
  reviews?: ReviewFacts | null;
  /** Anuncios (etapa opcional): Meta con cuenta, página y píxel, y las campañas del producto. */
  ads?: AdsFacts | null;
  /** Creativos (etapa opcional): el proveedor de imágenes y las piezas generadas. */
  creatives?: CreativeFacts | null;
  /** Imágenes de la página: lo elegido por espacio y lo que se está generando. */
  images?: ImageFacts | null;
  /** La última publicación en la tienda (etapa Publicar). */
  publish?: PublishFacts | null;
  /**
   * La clave de Anthropic del comerciante está conectada (Ajustes › Inteligencia artificial). Sin ella,
   * las etapas de IA que aún no empiezan quedan bloqueadas con el motivo, como Creativos sin Higgsfield.
   * Sin el dato (undefined), se asume conectada.
   */
  ai?: boolean;
  content?: { hasContent: boolean; missing: string[]; stale: boolean; changes?: string[] };
}

/** El motivo en la ruta de una etapa de IA sin la clave de Anthropic (como «Conecta Higgsfield en Ajustes»). */

export interface ImageFacts {
  /** El director de galería está proponiendo las tomas. */
  running: boolean;
  /** Imágenes en cola o generándose en Higgsfield. */
  rendering: number;
  /** Opciones listas para elegir (generadas, subidas o fotos). */
  options: number;
  /** Hay portada elegida. */
  cover: boolean;
  /** Imágenes elegidas para la galería. */
  gallery: number;
}

export interface CreativeFacts {
  /** Hay un proveedor de imágenes: Higgsfield conectado y válido, o Gemini activado. */
  connected: boolean;
  /** El generador está proponiendo conceptos. */
  running: boolean;
  concepts: number;
  /** Piezas en cola o generándose en Higgsfield. */
  rendering: number;
  /** Piezas listas que esperan la decisión del comerciante. */
  pending: number;
  approved: number;
}

export interface AdsFacts {
  metaReady: boolean;
  /** Campañas creadas en Meta (en pausa o activas). */
  campaigns: number;
  /** Hay un lanzamiento en curso. */
  launching?: boolean;
}

export interface ReviewFacts {
  pending: number;
  approved: number;
  total: number;
  importing?: boolean;
}

export type BasePhase = "new" | "done";
export type AnglesPhase = "locked" | "new" | "choose" | "done";
export type CopyPhase = "locked" | "new" | "writing" | "failed" | "review" | "done";

/** Nombre de la etapa Textos para el comerciante: escribe la página del producto, no el anuncio. */
export const COPY_STAGE_TITLE = "Página del producto";

export interface ProductPosition {
  contentState: ProductContentState;
  phase: BasePhase;
  anglesPhase: AnglesPhase;
  copyPhase: CopyPhase;
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


/** Compatibilidad de lectores históricos; ninguna sección depende de completar otra pantalla. */
export function basePhase(f: ProductFacts): BasePhase { return f.base?.described ? "done" : "new"; }
export function anglesPhase(f: ProductFacts): AnglesPhase { return f.intelligence?.selected ? "done" : "new"; }
export function copyPhase(f: ProductFacts): CopyPhase {
  const c = f.copy;
  if (!c || c.progress.listing === "missing") return "new";
  return c.progress.complete ? "done" : "review";
}
export const STRATEGY_STAGE_TITLE = "Estrategia guardada";

/** Situación operativa del contenido; las etapas quedan solo como nombres para enlaces históricos y costos. */
export function productPosition(f: ProductFacts): ProductPosition {
  const hasContent = f.content?.hasContent ?? Boolean(f.copy && f.copy.progress.listing !== "missing");
  const missing = f.content?.missing ?? [];
  const situation = contentSituation({ hasContent, missing, publication: f.publish ? { ...f.publish, stale: f.content?.stale } : null });
  const stages: Stage[] = [
    { key: "importado", title: "Información y oferta", state: "available" },
    { key: "textos", title: COPY_STAGE_TITLE, state: "available" },
    { key: "imagenes", title: "Imágenes", state: "available" },
    { key: "publicar", title: "Publicación", state: "available" },
    { key: "angulos", title: STRATEGY_STAGE_TITLE, state: "available", optional: true },
    { key: "creativos", title: "Creativos", state: "available", optional: true },
    { key: "anuncios", title: "Anuncios", state: "available", optional: true },
    { key: "resenas", title: "Reseñas", state: "available", optional: true },
    { key: "mensajes", title: "WhatsApp", state: "available", optional: true },
  ];
  return {
    phase: basePhase(f), anglesPhase: anglesPhase(f), copyPhase: copyPhase(f),
    contentState: situation.state, stages, meter: [],
    filter: f.publish?.status === "published" ? "publicados" : situation.state === "error" ? "detenidos" : "avanzan",
    tone: situation.state === "error" ? "danger" : ["published", "ready"].includes(situation.state) ? "success" : situation.state === "updated" ? "warning" : "muted",
    nextStage: "publicar", reason: situation.label, summary: situation.label, status: situation.status,
  };
}
export const showsBaseScreen = () => false;
