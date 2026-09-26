// Cliente tipado de /api/products/* (para componentes "use client").
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import type { PricingForm } from "@/lib/pricing/plan";
import type { AngleBriefEdit } from "@/lib/angles/schemas";
import type { TestAngle } from "@/lib/angles/catalog";
import type { ImageProvider, ImageProviderChoice, ImageStage } from "@/lib/image-provider";

/** Lo que manda la pantalla al confirmar: el slot lo pone el servidor por el orden. */
export type TestAngleInput = Omit<TestAngle, "slot">;
import type { AnglesState, AvatarProposal, PublishState, CopyState, ImagePick, CreativesState, VideosState, CustomerReview, OptimizationRun, PackLabelsProposal, PageImagesState, ReferenceImage, ReviewImport, SavedPricingDto } from "@/lib/types";

export class ProductApiClientError extends Error {
  constructor(message: string, public field?: string, public status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/products${path}`, {
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProductApiClientError(data.error ?? "No pudimos guardar el cambio. Intenta de nuevo.", data.field, res.status);
  return data as T;
}

const send = <T>(method: string, path: string, data?: unknown) =>
  call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

/**
 * Sube una imagen con avance: pide una URL firmada, sube directo a Storage (XHR, porque fetch no
 * informa el progreso de subida) y confirma. Devuelve la promesa y cómo cancelarla.
 */
export function uploadImage(productId: string, file: File, onProgress: (p: number) => void): { done: Promise<ReferenceImage>; cancel: () => void } {
  return signedUpload(file, onProgress, async (put) => {
    const { path, uploadUrl } = await send<{ path: string; uploadUrl: string }>("POST", `/${productId}/images/upload-url`, { type: file.type, size: file.size });
    await put(uploadUrl);
    return (await send<{ image: ReferenceImage }>("POST", `/${productId}/images`, { path, name: file.name })).image;
  });
}

/** Sube una imagen a un espacio de la página (etapa Imágenes) y devuelve el estado de la etapa. */
export function uploadPageImage(productId: string, slot: string, file: File, onProgress: (p: number) => void): { done: Promise<PageImagesState>; cancel: () => void } {
  return signedUpload(file, onProgress, async (put) => {
    const { path, uploadUrl } = await send<{ path: string; uploadUrl: string }>("POST", `/${productId}/page-images/upload-url`, { type: file.type, size: file.size, slot });
    await put(uploadUrl);
    return send<PageImagesState>("POST", `/${productId}/page-images/uploads`, { slot, path });
  });
}

/** Sube el video montado en local (MP4 9:16) y devuelve el estado de la pestaña Videos. */
export function uploadFinalVideo(
  productId: string,
  scriptId: string,
  file: File,
  facts: { width: number; height: number; durationS: number | null },
  onProgress: (p: number) => void,
): { done: Promise<VideosState>; cancel: () => void } {
  return signedUpload(file, onProgress, async (put) => {
    const { path, uploadUrl } = await send<{ path: string; uploadUrl: string }>("POST", `/${productId}/videos/${scriptId}/final`, { type: file.type, size: file.size });
    await put(uploadUrl);
    return send<VideosState>("PUT", `/${productId}/videos/${scriptId}/final`, { path, ...facts });
  });
}

function signedUpload<T>(file: File, onProgress: (p: number) => void, flow: (put: (url: string) => Promise<void>) => Promise<T>): { done: Promise<T>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  let cancelled = false;
  const put = (url: string) =>
    new Promise<void>((resolve, reject) => {
      xhr.open("PUT", url);
      xhr.setRequestHeader("x-upsert", "false");
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (key) xhr.setRequestHeader("apikey", key);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ProductApiClientError("No se pudo subir. Intenta de nuevo.", undefined, xhr.status)));
      xhr.onerror = () => reject(new ProductApiClientError("Se cortó la conexión. Intenta de nuevo."));
      xhr.onabort = () => reject(new ProductApiClientError("Subida cancelada.", "abort"));
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      xhr.send(form);
    });
  const done = flow(async (url) => {
    if (cancelled) throw new ProductApiClientError("Subida cancelada.", "abort");
    await put(url);
    onProgress(1);
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      xhr.abort();
    },
  };
}

export const productsApi = {
  publishState: (id: string) => call<PublishState>(`/${id}/publish`),
  publish: (id: string) => send<PublishState>("POST", `/${id}/publish`),
  creatives: (id: string) => call<CreativesState>(`/${id}/creatives`),
  proposeCreatives: (id: string) => send<CreativesState>("POST", `/${id}/creatives`),
  editConcept: (id: string, conceptId: string, texts: { role: string; text: string }[]) => send<CreativesState>("PATCH", `/${id}/creatives/concepts/${conceptId}`, { texts }),
  editChat: (id: string, conceptId: string, chat: { contact_name: string; messages: { text: string }[] }) => send<CreativesState>("PATCH", `/${id}/creatives/concepts/${conceptId}`, { chat }),
  createChat: (id: string, angle: number) => send<CreativesState>("POST", `/${id}/creatives/chat`, { angle, acknowledged: true }),
  renderConcept: (id: string, conceptId: string, ratio: "1:1" | "9:16", provider?: ImageProvider) =>
    send<CreativesState>("POST", `/${id}/creatives/concepts/${conceptId}/render`, provider ? { ratio, provider } : { ratio }),
  decideCreative: (id: string, assetId: string, action: "approve" | "reject" | "reopen" | "recover") => send<CreativesState>("PATCH", `/${id}/creatives/assets/${assetId}`, { action }),
  // Pestaña Videos (docs/spec-video-ugc.md): cada acción devuelve el estado completo de la pestaña.
  videos: (id: string) => call<VideosState>(`/${id}/videos`),
  writeScript: (id: string, slot: number) => send<VideosState>("POST", `/${id}/videos`, { slot }),
  scriptAction: (id: string, scriptId: string, action: "approve" | "unapprove" | "keyframes" | "approve_keyframes" | "clips") => send<VideosState>("PATCH", `/${id}/videos/${scriptId}`, { action }),
  editScript: (id: string, scriptId: string, edit: { a_roll: { key: string; line: string; delivery: string }[]; text_beats: { text: string }[]; end_card: { title: string; subtitle: string; cta: string } }) =>
    send<VideosState>("PATCH", `/${id}/videos/${scriptId}`, { action: "edit", edit }),
  shotAction: (id: string, shotId: string, action: "approve" | "reject" | "reopen" | "regenerate" | "recover") => send<VideosState>("PATCH", `/${id}/videos/shots/${shotId}`, { action }),
  decideFinalVideo: (id: string, scriptId: string, action: "approve" | "reject" | "reopen") => send<VideosState>("PATCH", `/${id}/videos/${scriptId}/final`, { action }),
  // Etapa Imágenes (la página del producto): cada acción devuelve el estado completo de la etapa.
  pageImages: (id: string) => call<PageImagesState>(`/${id}/page-images`),
  proposePageImages: (id: string) => send<PageImagesState>("POST", `/${id}/page-images`),
  fillPageImages: (id: string) => send<PageImagesState>("POST", `/${id}/page-images/fill`),
  renderShot: (id: string, shotId: string) => send<PageImagesState>("POST", `/${id}/page-images/shots/${shotId}`),
  decidePageImage: (id: string, optionId: string, action: "choose" | "unchoose" | "discard" | "reopen" | "recover" | "cover") => send<PageImagesState>("PATCH", `/${id}/page-images/options/${optionId}`, { action }),
  chooseReference: (id: string, slot: string, referenceId: string) => send<PageImagesState>("POST", `/${id}/page-images/references`, { slot, referenceId }),
  importPageImageUrl: (id: string, slot: string, url: string) => send<PageImagesState>("POST", `/${id}/page-images/url`, { slot, url }),
  orderGallery: (id: string, ids: string[], slot?: string) => send<PageImagesState>("PUT", `/${id}/page-images/order`, { ids, slot }),
  decidePackLabels: (id: string, action: "approve" | "reopen") => send<{ packLabels: PackLabelsProposal | null }>("PATCH", `/${id}/pack-labels`, { action }),
  editPackLabels: (id: string, labels: PackLabel[], approve: boolean) => send<{ packLabels: PackLabelsProposal | null }>("PUT", `/${id}/pack-labels`, { labels, approve }),
  regeneratePackLabels: (id: string) => send<{ packLabels: PackLabelsProposal | null }>("POST", `/${id}/pack-labels`),
  savePricing: (id: string, form: PricingForm) => send<{ pricing: SavedPricingDto }>("PUT", `/${id}/pricing`, form),
  sync: () => send<{ created: number; deleted: number; pending: number }>("POST", "/sync"),
  saveBaseInfo: (id: string, text: string) => send<{ savedAt: string; topics: string[] }>("PATCH", `/${id}/base-info`, { text }),
  imageFromUrl: (id: string, url: string) => send<{ image: ReferenceImage }>("POST", `/${id}/images/url`, { url }),
  setExcluded: (id: string, imageId: string, excluded: boolean) => send<{ ok: true }>("PATCH", `/${id}/images/${imageId}`, { excluded }),
  setBase: (id: string, imageId: string) => send<{ ok: true }>("PATCH", `/${id}/images/${imageId}`, { base: true }),
  optimize: (id: string) => send<{ run: OptimizationRun }>("POST", `/${id}/optimize`),
  status: (id: string) => call<{ run: OptimizationRun | null; avatar: AvatarProposal | null }>(`/${id}/optimize`),
  decideAvatar: (id: string, action: "approve" | "reopen") => send<{ avatar: AvatarProposal }>("PATCH", `/${id}/avatar`, { action }),
  importReviews: (id: string, input: { url: string; minRating: 1 | 4 | 5; photosOnly: boolean; translate: boolean }) =>
    send<{ job: ReviewImport }>("POST", `/${id}/reviews/import`, input),
  reviewImport: (id: string) => call<{ job: ReviewImport | null }>(`/${id}/reviews/import`),
  decideReviews: (id: string, ids: string[], action: "approve" | "reject" | "reopen") => send<{ count: number }>("PATCH", `/${id}/reviews`, { ids, action }),
  decideReview: (id: string, reviewId: string, action: "approve" | "reject" | "reopen") => send<{ ok: true }>("PATCH", `/${id}/reviews/${reviewId}`, { action }),
  editReview: (id: string, reviewId: string, text: string) => send<{ review: CustomerReview }>("PUT", `/${id}/reviews/${reviewId}`, { text }),
  editAvatar: (id: string, avatar: CustomerAvatar, approve: boolean) => send<{ avatar: AvatarProposal }>("PUT", `/${id}/avatar`, { avatar, approve }),
  // Etapa Ángulos: cada acción devuelve el estado completo de la etapa.
  angles: (id: string) => call<AnglesState>(`/${id}/angles`),
  evaluateAngles: (id: string) => send<AnglesState>("POST", `/${id}/angles`),
  confirmAngles: (id: string, angles: TestAngleInput[]) => send<AnglesState>("PUT", `/${id}/angles/selection`, { angles }),
  decideAngleBrief: (id: string, briefId: string, action: "approve" | "reopen") => send<AnglesState>("PATCH", `/${id}/angles/briefs/${briefId}`, { action }),
  editAngleBrief: (id: string, briefId: string, edit: AngleBriefEdit, approve: boolean) => send<AnglesState>("PUT", `/${id}/angles/briefs/${briefId}`, { edit, approve }),
  regenerateAngleBrief: (id: string, briefId: string) => send<AnglesState>("POST", `/${id}/angles/briefs/${briefId}`),
  // Etapa Textos (la página del producto): cada acción devuelve el estado completo de la etapa.
  copy: (id: string) => call<CopyState>(`/${id}/copy`),
  writeCopy: (id: string, redo = false, mode?: "all" | { component: string }) => send<CopyState>("POST", `/${id}/copy`, { redo, mode }),
  restoreComponent: (id: string, component: string) => send<CopyState>("PATCH", `/${id}/copy/components/${encodeURIComponent(component)}`, { restore: true }),
  updateComponent: (id: string, component: string, patch: { content?: unknown; enabled?: boolean; images?: ImagePick[]; approve?: boolean }) =>
    send<CopyState>("PATCH", `/${id}/copy/components/${encodeURIComponent(component)}`, patch),
  saveAccent: (id: string, color: string) => send<{ accent: string }>("PUT", `/${id}/copy/accent`, { color }),
  // Información base › Diferenciador y Tiendas de la competencia: cada acción devuelve la lista completa.
  saveDifferentiator: (id: string, d: { versus: string; claim: string; basis?: string }) =>
    send<import("@/lib/types").DifferentiatorView>("PUT", `/${id}/differentiator`, d),
  competitors: (id: string) => call<CompetitorsResponse>(`/${id}/competitors`),
  addCompetitor: (id: string, url: string) => send<CompetitorsResponse>("POST", `/${id}/competitors`, { url }),
  removeCompetitor: (id: string, competitorId: string) => send<CompetitorsResponse>("DELETE", `/${id}/competitors/${competitorId}`),
  retryCompetitor: (id: string, competitorId: string) => send<CompetitorsResponse>("POST", `/${id}/competitors/${competitorId}`),
};

/** Los proveedores de imágenes con clave propia del comerciante (Ajustes › Anuncios con IA). */
export type ApiKeyProvider = "higgsfield" | "gemini";

/** Ajustes › Anuncios con IA › Higgsfield o Gemini (/api/settings/<proveedor>). Mismo contrato de errores que /api/products. */
export const apiKeyApi = {
  connect: async (provider: ApiKeyProvider, key: string) => {
    const res = await fetch(`/api/settings/${provider}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), cache: "no-store" }).catch(() => null);
    if (!res) throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProductApiClientError(data.error ?? "No pudimos guardar la clave. Intenta de nuevo.", data.field, res.status);
    return data as { keyHint: string; status: "connected" | "invalid" };
  },
  disconnect: async (provider: ApiKeyProvider) => {
    const res = await fetch(`/api/settings/${provider}`, { method: "DELETE", cache: "no-store" }).catch(() => null);
    if (!res?.ok) throw new ProductApiClientError(`No pudimos desconectar ${provider === "gemini" ? "Gemini" : "Higgsfield"}. Intenta de nuevo.`);
  },
};

/** El proveedor de imágenes de una pantalla que genera; queda guardado por etapa. */
export const imageProviderApi = {
  save: async (stage: ImageStage, provider: ImageProvider) => {
    const res = await fetch("/api/settings/image-provider", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, provider }), cache: "no-store" }).catch(() => null);
    if (!res) throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProductApiClientError(data.error ?? "No pudimos guardar tu elección. Intenta de nuevo.", undefined, res.status);
    return data as ImageProviderChoice;
  },
};

async function post<T>(url: string, data: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" }).catch(() => null);
  if (!res) throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProductApiClientError(body.error ?? fallback, body.field, res.status);
  return body as T;
}

/** El tema de DropFlex en la tienda (etapa Publicar). */
export const themeApi = {
  act: (action: "install" | "update" | "publish") => post<PublishState["theme"]>("/api/shopify/theme", { action }, "No pudimos hacer el cambio en el tema. Intenta de nuevo."),
  /** Vuelve a pedir permisos en Shopify (temas y archivos): responde con la URL de autorización. */
  permissions: (shop: string) => post<{ authorizeUrl: string }>("/api/onboarding/shopify/connect", { shop }, "No pudimos abrir Shopify. Intenta de nuevo."),
};

/** Respuesta de /api/products/[id]/competitors*. */
export interface CompetitorsResponse {
  competitors: import("@/lib/types").CompetitorView[];
  max: number;
}
