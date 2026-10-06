// Dónde está un producto en su ruta, derivado de lo que hay en la base: los datos del producto y el
// precio (Información base), las reseñas (opcional), la estrategia (la corrida del mega prompt y los
// ángulos elegidos) y la página del producto (Textos). Puro: lo usan lib/data (lista, ruta, Hoy) y los tests.
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

/** La corrida más reciente de la estrategia (strategy_runs). */
export interface StrategyFacts {
  status: RunStatus;
  error?: string | null;
  confirmed: boolean;
}

export interface ProductFacts {
  price: number;
  currency: string;
  /** Información base: los datos del producto identificados y el precio guardado. */
  base?: { described: boolean; priced: boolean } | null;
  strategy?: StrategyFacts | null;
  /** Los ángulos elegidos y sus desarrollos (los escribe la estrategia al confirmar, o el flujo de antes). */
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
  /**
   * La clave de Anthropic del comerciante está conectada (Ajustes › Inteligencia artificial). Sin ella,
   * las etapas de IA que aún no empiezan quedan bloqueadas con el motivo, como Creativos sin Higgsfield.
   * Sin el dato (undefined), se asume conectada.
   */
  ai?: boolean;
}

/** El motivo en la ruta de una etapa de IA sin la clave de Anthropic (como «Conecta Higgsfield en Ajustes»). */
export const CONNECT_AI = "Conecta Anthropic en Ajustes";

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
export type AnglesPhase = "locked" | "new" | "evaluating" | "failed" | "choose" | "done";
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

const active = (s?: RunStatus) => s === "queued" || s === "running";

/** Los ángulos elegidos (2 o 3) con sus desarrollos aprobados: lo que habilita Imágenes, Página y Creativos. */
export function anglesReady(a: AngleFacts | null | undefined): boolean {
  const r = a?.ranking;
  if (!r?.confirmed || r.status !== "succeeded") return false;
  const briefs = a?.briefs ?? [];
  return briefs.length >= Math.max(2, r.chosen ?? 2) && briefs.every((b) => b.generation === "succeeded" && b.status === "aprobado");
}

/**
 * Información base está lista con los datos del producto y el precio. Un producto trabajado con el flujo
 * de antes (sin datos del producto) que ya tiene sus ángulos listos también cuenta como listo.
 */
export function basePhase(f: ProductFacts): BasePhase {
  if (f.base?.priced && (f.base.described || anglesReady(f.angles))) return "done";
  return "new";
}

/** La etapa Estrategia se habilita con la información base lista y termina con los ángulos elegidos. */
export function anglesPhase(f: ProductFacts, base: BasePhase = basePhase(f)): AnglesPhase {
  if (base !== "done") return "locked";
  // Con ángulos listos, la etapa está hecha aunque se esté generando otra estrategia: lo de después sigue.
  if (anglesReady(f.angles)) return "done";
  const s = f.strategy;
  if (!s) return "new";
  if (active(s.status)) return "evaluating";
  if (s.status === "failed") return "failed";
  // Lista: el comerciante elige. Confirmada pero sin ángulos (falló al guardar): se vuelve a elegir.
  return "choose";
}

/**
 * La página se habilita con los desarrollos de los ángulos aprobados. Una reescritura que falla con la página ya
 * escritos no tapa la revisión: la pantalla muestra el error sobre la lista.
 */
/** La Página del producto va después de Imágenes: sus componentes usan las imágenes elegidas. */
export function copyPhase(f: ProductFacts, angles: AnglesPhase, imagesDone = true): CopyPhase {
  if (!f.copy?.fromChat && (angles !== "done" || !imagesDone)) return "locked";
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
      return anglesDone ? "Se habilita con las imágenes listas" : "Se habilita al elegir los ángulos de la estrategia";
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

/** Nombre de la etapa Ángulos (StageKey `angulos`): la estrategia completa del mega prompt. */
export const STRATEGY_STAGE_TITLE = "Estrategia";

function baseDesc(f: ProductFacts, phase: BasePhase): string {
  if (phase === "done") return "Datos del producto · precio y packs listos";
  if (!f.base?.described && !f.base?.priced) return "Identifica el producto y guarda el precio";
  if (!f.base?.described) return "Falta identificar el producto";
  return "Falta guardar el precio y los packs";
}

const ANGLES_STATE: Record<AnglesPhase, Stage["state"]> = {
  locked: "locked",
  new: "current",
  evaluating: "current",
  failed: "error",
  choose: "review",
  done: "done",
};

function anglesDesc(phase: AnglesPhase, f: ProductFacts): string {
  switch (phase) {
    case "locked":
      return "Se habilita con los datos del producto y el precio";
    case "new":
      return "Genera la estrategia de venta con IA";
    case "evaluating":
      return "La IA está escribiendo la estrategia";
    case "failed":
      return f.strategy?.error ?? "No se pudo generar la estrategia";
    case "choose":
      return "Estrategia lista · elige 2 o 3 ángulos";
    case "done":
      return (f.angles?.briefs ?? []).map((b) => b.name).join(" · ");
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
 * WhatsApp: opcional, al final. Los mensajes para confirmar y seguir los pedidos con el nombre y el
 * precio del producto: se habilita con la información base lista. Nunca bloquea ni queda pendiente.
 */
function messagesStage(baseDone: boolean): Stage {
  const base = { key: "mensajes", title: "WhatsApp", optional: true } as const;
  if (!baseDone) return { ...base, state: "locked", desc: "Después de la información base" };
  return { ...base, state: "available", desc: "Mensajes para confirmar y seguir pedidos" };
}

/**
 * Creativos: opcional, entre Publicar y Anuncios (docs/spec-creativos.md §6.5). Se habilita con los 2
 * desarrollos de Ángulos aprobados y un proveedor de imágenes (Higgsfield o Gemini); nunca bloquea Publicar.
 */
function creativesStage(anglesDone: boolean, c: CreativeFacts | null | undefined, ai = true): { stage: Stage; meter: MeterStage } {
  const base = { key: "creativos", title: "Creativos", optional: true } as const;
  const optional = (state: Stage["state"], desc: string) => ({ stage: { ...base, state, desc }, meter: "optional" as MeterStage });
  // Como Anuncios: bloqueada, su rayita sigue siendo «opcional» (no cuenta como pendiente).
  if (!anglesDone) return optional("locked", "Después de elegir los ángulos");
  // Sin Anthropic no hay conceptos que generar; lo ya propuesto se sigue viendo.
  if (!ai && !c?.concepts) return optional("locked", CONNECT_AI);
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
function imagesStage(anglesDone: boolean, i: ImageFacts | null | undefined, ai = true): { stage: Stage; meter: MeterStage; done: boolean } {
  const base = { key: "imagenes", title: "Imágenes" } as const;
  if (!anglesDone) return { stage: { ...base, state: "locked", desc: "Se habilita al elegir los ángulos de la estrategia" }, meter: "locked", done: false };
  const done = Boolean(i?.cover) && (i?.gallery ?? 0) >= GALLERY_MIN;
  if (done) return { stage: { ...base, state: "done", desc: `Portada y ${i!.gallery} de galería` }, meter: "done", done };
  if (i?.running) return { stage: { ...base, state: "current", desc: "La IA está pensando tu galería" }, meter: "current", done };
  if (i?.rendering) return { stage: { ...base, state: "current", desc: i.rendering === 1 ? "Generando 1 imagen" : `Generando ${i.rendering} imágenes` }, meter: "current", done };
  if (i?.options) {
    const missing = [i.cover ? null : "la portada", (i.gallery ?? 0) < GALLERY_MIN ? `${GALLERY_MIN - (i.gallery ?? 0)} de galería` : null].filter(Boolean).join(" y ");
    return { stage: { ...base, state: "review", desc: `Elige ${missing}` }, meter: "review", done };
  }
  if (!ai) return { stage: { ...base, state: "locked", desc: CONNECT_AI }, meter: "locked", done };
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
  const ai = f.ai !== false;
  const images = imagesStage(angles === "done", f.images, ai);
  const copy = copyPhase(f, angles, images.done);
  const pageDone = copy === "done";
  const reviews = reviewsStage(f.reviews);
  const creatives = creativesStage(angles === "done", f.creatives, ai);
  // Sin la clave de Anthropic, la etapa de IA que no ha empezado queda bloqueada con el motivo.
  const aiLocked = (state: Stage["state"], desc: string): Pick<Stage, "state" | "desc"> => (ai ? { state, desc } : { state: "locked", desc: CONNECT_AI });
  const publish = publishStage(pageDone, f.publish);
  const stages: Stage[] = [
    {
      key: "importado",
      title: "Información base",
      state: phase === "done" ? "done" : "current",
      // Información base nunca se bloquea (ahí se escribe lo del producto): solo dice qué falta.
      desc: phase === "new" && !ai && !f.base?.described ? `${CONNECT_AI} para identificar el producto` : baseDesc(f, phase),
    },
    // Reseñas es opcional: nunca bloquea ni se bloquea (arquitectura.md › 9).
    reviews.stage,
    { key: "angulos", title: STRATEGY_STAGE_TITLE, ...(angles === "new" ? aiLocked(ANGLES_STATE[angles], anglesDesc(angles, f)) : { state: ANGLES_STATE[angles], desc: anglesDesc(angles, f) }) },
    // Imágenes va antes de la Página del producto: sus componentes usan las imágenes elegidas. El
    // precio y los packs viven en Información base (requisito para optimizar): no hay etapa de precio.
    images.stage,
    { key: "textos", title: COPY_STAGE_TITLE, ...(copy === "new" ? aiLocked(COPY_STATE[copy], copyDesc(copy, f.copy, angles === "done")) : { state: COPY_STATE[copy], desc: copyDesc(copy, f.copy, angles === "done") }) },
    publish.stage,
    // Creativos es opcional y alimenta Anuncios: nunca bloquea Publicar (spec-creativos §6.5).
    creatives.stage,
    adsStage(pageDone, f.ads),
    // WhatsApp es opcional: los mensajes de los pedidos, cuando empiecen a llegar.
    messagesStage(phase === "done"),
  ];
  const meter: MeterStage[] = [phase === "done" ? "done" : "current", reviews.meter, ANGLES_STATE[angles] as MeterStage, images.meter, COPY_METER[copy], publish.meter, creatives.meter, "optional", "optional"];
  const price = f.price > 0 ? ` · ${money(f.price, f.currency)}` : "";
  const common = { phase, anglesPhase: angles, copyPhase: copy, stages, meter };

  if (phase === "new") {
    const reason = !f.base?.described ? (ai ? "Identifica el producto · agrega lo que sabes" : "Sin identificar · conecta Anthropic en Ajustes") : "Falta el precio y los packs";
    return { ...common, filter: "avanzan", tone: "primary", reason, nextStage: "importado", summary: `Importado de Shopify · sin estrategia${price}` };
  }

  switch (angles) {
    case "evaluating":
      return { ...common, filter: "avanzan", tone: "primary", reason: "Escribiendo la estrategia con IA", nextStage: "angulos", summary: `Escribiendo la estrategia${price}` };
    case "failed":
      return { ...common, filter: "detenidos", tone: "danger", reason: "Estrategia: no se pudo · reintenta", nextStage: "angulos", summary: `Estrategia con error${price}`, status: "error" };
    case "choose":
      return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu elección · estrategia", nextStage: "angulos", summary: `Ángulos por elegir${price}`, status: "revision" };
    case "done":
      break;
    default:
      return { ...common, filter: "avanzan", tone: "primary", reason: ai ? "Siguiente: estrategia de venta" : CONNECT_AI, nextStage: "angulos", summary: `Información base lista${price}`, status: "aprobado" };
  }

  if (!images.done) {
    if (images.stage.state === "review") return { ...common, filter: "detenidos", tone: "warning", reason: "Espera tu elección · imágenes", nextStage: "imagenes", summary: `Imágenes por elegir${price}`, status: "revision" };
    return { ...common, filter: "avanzan", tone: "primary", reason: images.stage.state === "locked" ? CONNECT_AI : "Siguiente: imágenes", nextStage: "imagenes", summary: `Ángulos listos${price}`, status: "aprobado" };
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
      return { ...common, filter: "avanzan", tone: "primary", reason: ai ? "Siguiente: página del producto" : CONNECT_AI, nextStage: "textos", summary: `Imágenes listas${price}`, status: "aprobado" };
  }
}

/** En qué fase la ficha del producto muestra la pantalla de información base (y no la ruta). */
export const showsBaseScreen = (phase: BasePhase) => phase !== "done";
