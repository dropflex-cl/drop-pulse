// Dónde está un producto en su ruta, derivado de lo que hay en la base: la última optimización, la
// última propuesta de cliente ideal, las reseñas (opcional), la etapa Ángulos (evaluación y
// desarrollos) y la página del producto (Textos). Puro: lo usan lib/data (lista, ruta, Hoy) y los tests.
// Textos de design-system/reference/bundle.js (PP_STAGES, RV_STAGES y ANG_STAGES).

import type { MeterStage } from "@/components/df/stage-meter";
import { enabledLabel, type CopyProgress } from "@/lib/copy/progress";
import { money } from "@/lib/format";
import { GALLERY_MIN } from "@/lib/page-images/catalog";
import type { ContentStatus, ProductFilter, RunStatus, Stage, StageKey } from "@/lib/types";

export interface AngleFacts {
  /** La evaluación más reciente del orquestador. */
  /** `chosen`: cuántos ángulos se eligieron para testear (2 o 3; 0 sin confirmar). */
  ranking: { status: RunStatus; error?: string | null; confirmed: boolean; chosen?: number } | null;
  /** Los desarrollos vigentes de la elección confirmada, en orden de slot. */
  briefs: { slot: number; name: string; status: ContentStatus; generation: RunStatus; error?: string | null }[];
}

export interface CopyFacts {
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
  run?: { status: RunStatus; error?: string | null; createdAt: string } | null;
  avatar?: { status: ContentStatus; createdAt: string } | null;
  angles?: AngleFacts | null;
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
}

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

export type BasePhase = "new" | "optimizing" | "failed" | "review" | "done";
export type AnglesPhase = "locked" | "new" | "evaluating" | "failed" | "choose" | "developing" | "review" | "done";
export type CopyPhase = "locked" | "new" | "writing" | "failed" | "review" | "done";

/** Nombre de la etapa Textos para el comerciante: escribe la página del producto, no el anuncio. */
export const COPY_STAGE_TITLE = "Página del producto";

export interface ProductPosition {
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

const pending = (s?: ContentStatus) => s === "generado" || s === "revision";
const active = (s?: RunStatus) => s === "queued" || s === "running";

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

/** La etapa Ángulos se habilita al aprobar el cliente ideal y termina con los desarrollos de los ángulos elegidos (2 o 3) aprobados. */
export function anglesPhase(f: ProductFacts, base: BasePhase = basePhase(f)): AnglesPhase {
  if (base !== "done") return "locked";
  const r = f.angles?.ranking;
  if (!r) return "new";
  if (active(r.status)) return "evaluating";
  if (r.status === "failed") return "failed";
  if (!r.confirmed) return "choose";
  const briefs = f.angles?.briefs ?? [];
  if (briefs.some((b) => active(b.generation))) return "developing";
  // Confirmado sin uno de los desarrollos (una confirmación que falló a la mitad): nada lo está
  // generando, así que no es «desarrollando»; se recupera con Regenerar.
  const expected = Math.max(2, r.chosen ?? 2);
  if (briefs.length < expected || briefs.some((b) => b.generation === "failed")) return "failed";
  if (briefs.every((b) => b.status === "aprobado")) return "done";
  return "review";
}

/**
 * La página se habilita con los desarrollos de los ángulos aprobados. Una reescritura que falla con la página ya
 * escritos no tapa la revisión: la pantalla muestra el error sobre la lista.
 */
/** La Página del producto va después de Imágenes: sus componentes usan las imágenes elegidas. */
export function copyPhase(f: ProductFacts, angles: AnglesPhase, imagesDone = true): CopyPhase {
  if (angles !== "done" || !imagesDone) return "locked";
  const c = f.copy;
  if (!c) return "new";
  if (active(c.run?.status)) return "writing";
  if (c.progress.listing === "missing") return c.run?.status === "failed" ? "failed" : "new";
  return c.progress.complete ? "done" : "review";
}

const COPY_STATE: Record<CopyPhase, Stage["state"]> = {
  locked: "locked",
  new: "current",
  writing: "current",
  failed: "error",
  review: "review",
  done: "done",
};

const COPY_METER: Record<CopyPhase, MeterStage> = {
  locked: "locked",
  new: "current",
  writing: "current",
  failed: "error",
  review: "review",
  done: "done",
};

function copyDesc(phase: CopyPhase, c: CopyFacts | null | undefined, anglesDone: boolean): string {
  const p = c?.progress;
  switch (phase) {
    case "locked":
      return anglesDone ? "Se habilita con las imágenes listas" : "Se habilita al aprobar los desarrollos de los ángulos";
    case "new":
      return "La ficha y los componentes de la página con tus ángulos";
    case "writing":
      return "La IA está escribiendo la página";
    case "failed":
      return c?.run?.error ?? "No se pudo escribir la página";
    case "review":
      return "Falta aprobar la ficha del producto";
    case "done":
      return enabledLabel(p?.enabled ?? 0);
  }
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

const ANGLES_STATE: Record<AnglesPhase, Stage["state"]> = {
  locked: "locked",
  new: "current",
  evaluating: "current",
  failed: "error",
  choose: "review",
  developing: "current",
  review: "review",
  done: "done",
};

const ANGLES_METER: Record<AnglesPhase, MeterStage> = {
  locked: "locked",
  new: "current",
  evaluating: "current",
  failed: "error",
  choose: "review",
  developing: "current",
  review: "review",
  done: "done",
};

function anglesDesc(phase: AnglesPhase, a: AngleFacts | null | undefined): string {
  switch (phase) {
    case "locked":
      return "Se habilita al aprobar tu cliente ideal";
    case "new":
      return "Elige cómo vas a vender este producto";
    case "evaluating":
      return "La IA está evaluando los ángulos";
    case "failed":
      return a?.ranking?.status === "failed"
        ? (a.ranking.error ?? "No se pudo evaluar")
        : (a?.briefs.find((b) => b.generation === "failed")?.error ?? (a && a.briefs.length < (a.ranking?.chosen ?? 2) ? "Falta un desarrollo · toca Regenerar" : "No se pudo desarrollar un ángulo"));
    case "choose":
      return "Sugerencia lista · elige los ángulos para testear";
    case "developing":
      return `La IA está desarrollando ${a?.ranking?.chosen ?? 3} ángulos`;
    case "review":
      return `${a?.briefs.filter((b) => b.status === "aprobado").length ?? 0} de ${a?.ranking?.chosen ?? a?.briefs.length ?? 3} desarrollos aprobados`;
    case "done":
      return (a?.briefs ?? []).map((b) => b.name).join(" · ");
  }
}

/** Anuncios: opcional, se habilita con la página del producto lista y Meta conectado (spec-anuncios §2). */
function adsStage(pageDone: boolean, a: AdsFacts | null | undefined): Stage {
  const base = { key: "anuncios", title: "Anuncios", optional: true } as const;
  if (!pageDone) return { ...base, state: "locked", desc: "Después de la página del producto" };
  if (!a?.metaReady) return { ...base, state: "locked", desc: "Conecta Meta Ads en Ajustes" };
  if (a.launching) return { ...base, state: "current", desc: "Creando la campaña en Meta" };
  if (a.campaigns) return { ...base, state: "done", desc: a.campaigns === 1 ? "1 campaña" : `${a.campaigns} campañas` };
  return { ...base, state: "available", desc: "Lanza una campaña de testeo" };
}

/**
 * Creativos: opcional, entre Publicar y Anuncios (docs/spec-creativos.md §6.5). Se habilita con los 2
 * desarrollos de Ángulos aprobados y un proveedor de imágenes (Higgsfield o Gemini); nunca bloquea Publicar.
 */
function creativesStage(anglesDone: boolean, c: CreativeFacts | null | undefined): { stage: Stage; meter: MeterStage } {
  const base = { key: "creativos", title: "Creativos", optional: true } as const;
  const optional = (state: Stage["state"], desc: string) => ({ stage: { ...base, state, desc }, meter: "optional" as MeterStage });
  // Como Anuncios: bloqueada, su rayita sigue siendo «opcional» (no cuenta como pendiente).
  if (!anglesDone) return optional("locked", "Después de aprobar los ángulos");
  if (!c?.connected) return optional("locked", "Conecta Higgsfield en Ajustes");
  if (c.running) return optional("current", "La IA está pensando tus anuncios");
  if (c.rendering) return optional("current", c.rendering === 1 ? "Generando 1 imagen" : `Generando ${c.rendering} imágenes`);
  if (c.pending) return { stage: { ...base, state: "review", desc: `${c.pending} por revisar` }, meter: "review" };
  if (c.approved) return { stage: { ...base, state: "done", desc: c.approved === 1 ? "1 anuncio aprobado" : `${c.approved} anuncios aprobados` }, meter: "done" };
  if (c.concepts) return optional("available", "Genera las imágenes de tus conceptos");
  return optional("available", "Anuncios de imagen terminados con IA");
}

/**
 * Imágenes (docs/spec-imagenes.md): se habilita con la página del producto aprobada y queda lista con
 * la portada y al menos GALLERY_MIN imágenes de galería elegidas.
 */
function imagesStage(anglesDone: boolean, i: ImageFacts | null | undefined): { stage: Stage; meter: MeterStage; done: boolean } {
  const base = { key: "imagenes", title: "Imágenes" } as const;
  if (!anglesDone) return { stage: { ...base, state: "locked", desc: "Se habilita al aprobar los desarrollos de los ángulos" }, meter: "locked", done: false };
  const done = Boolean(i?.cover) && (i?.gallery ?? 0) >= GALLERY_MIN;
  if (done) return { stage: { ...base, state: "done", desc: `Portada y ${i!.gallery} de galería` }, meter: "done", done };
  if (i?.running) return { stage: { ...base, state: "current", desc: "La IA está pensando tu galería" }, meter: "current", done };
  if (i?.rendering) return { stage: { ...base, state: "current", desc: i.rendering === 1 ? "Generando 1 imagen" : `Generando ${i.rendering} imágenes` }, meter: "current", done };
  if (i?.options) {
    const missing = [i.cover ? null : "la portada", (i.gallery ?? 0) < GALLERY_MIN ? `${GALLERY_MIN - (i.gallery ?? 0)} de galería` : null].filter(Boolean).join(" y ");
    return { stage: { ...base, state: "review", desc: `Elige ${missing}` }, meter: "review", done };
  }
  return { stage: { ...base, state: "current", desc: "Genera las imágenes de tu página" }, meter: "current", done };
}

/** Publicar: con las imágenes y la página listas (docs/spec-publicar.md). */
function publishStage(ready: boolean, p: PublishFacts | null | undefined): { stage: Stage; meter: MeterStage } {
  const base = { key: "publicar", title: "Publicar en tu tienda" } as const;
  if (!ready) return { stage: { ...base, state: "locked", desc: "Necesita la página y las imágenes aprobadas" }, meter: "locked" };
  if (p?.status === "publishing") return { stage: { ...base, state: "current", desc: "Publicando en tu tienda" }, meter: "current" };
  if (p?.status === "error") return { stage: { ...base, state: "error", desc: p.error ?? "No se pudo publicar · reintenta" }, meter: "error" };
  if (p?.status === "published") return { stage: { ...base, state: "done", desc: "Publicado en tu tienda" }, meter: "done" };
  return { stage: { ...base, state: "current", desc: "Instala el tema y publica el producto" }, meter: "current" };
}

/** Reseñas: opcional, entre Información base y Ángulos (arquitectura.md › 9). */
function reviewsStage(r: ReviewFacts | null | undefined): { stage: Stage; meter: MeterStage } {
  const base = { key: "resenas", title: "Reseñas", optional: true } as const;
  if (r?.importing) return { stage: { ...base, state: "available", desc: "Importando de AliExpress" }, meter: "optional" };
  if (!r?.total) return { stage: { ...base, state: "available", desc: "Importa de AliExpress; la IA las usa para escribir" }, meter: "optional" };
  if (r.pending) return { stage: { ...base, state: "review", desc: `${r.pending} por revisar` }, meter: "review" };
  return { stage: { ...base, state: "done", desc: r.approved === 1 ? "1 aprobada" : `${r.approved} aprobadas` }, meter: "done" };
}

export function productPosition(f: ProductFacts): ProductPosition {
  const phase = basePhase(f);
  const angles = anglesPhase(f, phase);
  const images = imagesStage(angles === "done", f.images);
  const copy = copyPhase(f, angles, images.done);
  const pageDone = copy === "done";
  const reviews = reviewsStage(f.reviews);
  const creatives = creativesStage(angles === "done", f.creatives);
  const publish = publishStage(pageDone, f.publish);
  const stages: Stage[] = [
    {
      key: "importado",
      title: "Información base",
      state: BASE_STATE[phase],
      desc: phase === "failed" && f.run?.error ? f.run.error : BASE_DESC[phase],
    },
    // Reseñas es opcional: nunca bloquea ni se bloquea (arquitectura.md › 9).
    reviews.stage,
    { key: "angulos", title: "Ángulos", state: ANGLES_STATE[angles], desc: anglesDesc(angles, f.angles) },
    // Imágenes va antes de la Página del producto: sus componentes usan las imágenes elegidas. El
    // precio y los packs viven en Información base (requisito para optimizar): no hay etapa de precio.
    images.stage,
    { key: "textos", title: COPY_STAGE_TITLE, state: COPY_STATE[copy], desc: copyDesc(copy, f.copy, angles === "done") },
    publish.stage,
    // Creativos es opcional y alimenta Anuncios: nunca bloquea Publicar (spec-creativos §6.5).
    creatives.stage,
    adsStage(pageDone, f.ads),
  ];
  const meter: MeterStage[] = [BASE_METER[phase], reviews.meter, ANGLES_METER[angles], images.meter, COPY_METER[copy], publish.meter, creatives.meter, "optional"];
  const price = f.price > 0 ? ` · ${money(f.price, f.currency)}` : "";
  const common = { phase, anglesPhase: angles, copyPhase: copy, stages, meter };

  switch (phase) {
    case "new":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Sin optimizar · agrega lo que sabes", nextStage: "importado", summary: `Importado de Shopify · sin optimizar${price}` };
    case "optimizing":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Optimizando con IA", nextStage: "importado", summary: `Optimizando con IA${price}` };
    case "failed":
      return { ...common, filter: "detenidos", tone: "danger", reason: "No se pudo optimizar · reintenta", nextStage: "importado", summary: `No se pudo optimizar${price}`, status: "error" };
    case "review":
      return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu revisión · cliente ideal", nextStage: "importado", summary: `Cliente ideal por revisar${price}`, status: "revision" };
  }

  switch (angles) {
    case "evaluating":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Evaluando ángulos con IA", nextStage: "angulos", summary: `Evaluando ángulos${price}` };
    case "failed":
      return { ...common, filter: "detenidos", tone: "danger", reason: "Ángulos: no se pudo · reintenta", nextStage: "angulos", summary: `Ángulos con error${price}`, status: "error" };
    case "choose":
      return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu elección · ángulos", nextStage: "angulos", summary: `Ángulos por elegir${price}`, status: "revision" };
    case "developing":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Desarrollando ángulos con IA", nextStage: "angulos", summary: `Desarrollando ángulos${price}` };
    case "review":
      return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu revisión · ángulos", nextStage: "angulos", summary: `Ángulos por revisar${price}`, status: "revision" };
    case "done":
      break;
    default:
      return { ...common, filter: "avanzan", tone: "primary", reason: "Siguiente: ángulos de venta", nextStage: "angulos", summary: `Información base lista${price}`, status: "aprobado" };
  }

  if (!images.done) {
    if (images.stage.state === "review") return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu elección · imágenes", nextStage: "imagenes", summary: `Imágenes por elegir${price}`, status: "revision" };
    return { ...common, filter: "avanzan", tone: "primary", reason: "Siguiente: imágenes", nextStage: "imagenes", summary: `Ángulos listos${price}`, status: "aprobado" };
  }

  switch (copy) {
    case "writing":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Escribiendo la página con IA", nextStage: "textos", summary: `Escribiendo la página${price}` };
    case "failed":
      return { ...common, filter: "detenidos", tone: "danger", reason: "Página: no se pudo · reintenta", nextStage: "textos", summary: `Página con error${price}`, status: "error" };
    case "review":
      return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu revisión · página del producto", nextStage: "textos", summary: `Página por revisar${price}`, status: "revision" };
    case "done":
      if (f.publish?.status === "published") return { ...common, filter: "publicados", tone: "success", reason: "Publicado en tu tienda", nextStage: "anuncios", summary: `Publicado${price}`, status: "publicado" };
      if (f.publish?.status === "publishing") return { ...common, filter: "avanzan", tone: "primary", reason: "Publicando en tu tienda", nextStage: "publicar", summary: `Publicando${price}`, status: "publicando" };
      if (f.publish?.status === "error") return { ...common, filter: "detenidos", tone: "danger", reason: "No se pudo publicar · reintenta", nextStage: "publicar", summary: `Error al publicar${price}`, status: "error" };
      return { ...common, filter: "avanzan", tone: "primary", reason: "Siguiente: publicar", nextStage: "publicar", summary: `Página lista${price}`, status: "aprobado" };
    default:
      return { ...common, filter: "avanzan", tone: "primary", reason: "Siguiente: página del producto", nextStage: "textos", summary: `Imágenes listas${price}`, status: "aprobado" };
  }
}

/** En qué fase la ficha del producto muestra la pantalla de información base (y no la ruta). */
export const showsBaseScreen = (phase: BasePhase) => phase !== "done";
