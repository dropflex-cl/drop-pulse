// Cliente tipado de las rutas de Anuncios (para componentes "use client").
import type { AdMedia, AdTemplate, ProductAds } from "@/lib/types";
import { ACCEPTED_MEDIA, FORMAT_ERROR, RATIO_ERROR, ratioOf } from "./media";
import type { EngineConfig, LaunchConfig, Structure } from "./schemas";

export class AdsApiError extends Error {
  constructor(message: string, public field?: string, public status?: number) {
    super(message);
  }
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new AdsApiError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdsApiError(data.error ?? "No pudimos guardar el cambio. Intenta de nuevo.", data.field, res.status);
  return data as T;
}

export interface DraftBody {
  name: string;
  structure: Structure;
  template_key: string | null;
  template_id: string | null;
  launch: LaunchConfig;
  engine: EngineConfig;
}

export const adsApi = {
  state: (productId: string) => call<Omit<ProductAds, "product">>(`/api/products/${productId}/ads`),
  saveDraft: (productId: string, draft: DraftBody) => call<{ id: string; updatedAt: string }>(`/api/products/${productId}/ads/draft`, "PUT", draft),
  launch: (productId: string) => call<{ campaignId: string }>(`/api/products/${productId}/ads/launch`, "POST", {}),
  removeMedia: (productId: string, mediaId: string) => call<{ ok: true }>(`/api/products/${productId}/ads/media/${mediaId}`, "DELETE"),
  interests: (q: string) => call<{ options: { id: string; name: string; audienceSize: number | null }[] }>(`/api/ads/interests?q=${encodeURIComponent(q)}`),
  regions: (country: string) => call<{ options: { key: string; name: string }[] }>(`/api/ads/regions?country=${encodeURIComponent(country)}`),
  saveSpendCap: (amount: number) => call<{ amount: number }>("/api/ads/spend-cap", "PUT", { amount }),
  createTemplate: (t: { name: string; structure: Structure; launch: LaunchConfig; engine: EngineConfig; based_on: string | null }) => call<{ template: AdTemplate }>("/api/ad-templates", "POST", t),
  renameTemplate: (id: string, name: string) => call<{ template: AdTemplate }>(`/api/ad-templates/${id}`, "PATCH", { name }),
  duplicateTemplate: (id: string) => call<{ template: AdTemplate }>(`/api/ad-templates/${id}`, "PATCH", { duplicate: true }),
  deleteTemplate: (id: string) => call<{ ok: true }>(`/api/ad-templates/${id}`, "DELETE"),
};

/** Ancho, alto y duración que ve el navegador (el servidor valida la proporción con esto). */
export function mediaFacts(file: File): Promise<{ width: number; height: number; durationS: number | null }> {
  const url = URL.createObjectURL(file);
  const done = <T,>(v: T) => {
    URL.revokeObjectURL(url);
    return v;
  };
  return new Promise((resolve, reject) => {
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(done({ width: v.videoWidth, height: v.videoHeight, durationS: Number.isFinite(v.duration) ? v.duration : null }));
      v.onerror = () => reject(done(new AdsApiError("No pudimos leer el video. Revisa que sea MP4 o MOV.")));
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight, durationS: null }));
      img.onerror = () => reject(done(new AdsApiError("No pudimos leer la imagen. Revisa que sea JPG o PNG.")));
      img.src = url;
    }
  });
}

/** Sube un creativo con avance: URL firmada → Storage (XHR, por el progreso) → confirmación. */
export function uploadCreative(productId: string, file: File, onProgress: (p: number) => void): { done: Promise<AdMedia>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  let cancelled = false;
  const put = (url: string) =>
    new Promise<void>((resolve, reject) => {
      xhr.open("PUT", url);
      xhr.setRequestHeader("x-upsert", "false");
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (key) xhr.setRequestHeader("apikey", key);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new AdsApiError(xhr.status === 413 ? "El archivo pasa el tamaño que acepta tu proyecto. Usa uno más liviano." : "No se pudo subir. Intenta de nuevo.", undefined, xhr.status));
      xhr.onerror = () => reject(new AdsApiError("Se cortó la conexión. Intenta de nuevo."));
      xhr.onabort = () => reject(new AdsApiError("Subida cancelada.", "abort"));
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      xhr.send(form);
    });
  const done = (async () => {
    if (!ACCEPTED_MEDIA.split(",").includes(file.type)) throw new AdsApiError(FORMAT_ERROR, "file");
    const facts = await mediaFacts(file);
    if (!ratioOf(facts.width, facts.height)) throw new AdsApiError(RATIO_ERROR, "file");
    const { path, uploadUrl } = await call<{ path: string; uploadUrl: string }>(`/api/products/${productId}/ads/media/upload-url`, "POST", { type: file.type, size: file.size });
    if (cancelled) throw new AdsApiError("Subida cancelada.", "abort");
    await put(uploadUrl);
    onProgress(1);
    return (await call<{ media: AdMedia }>(`/api/products/${productId}/ads/media`, "POST", { path, name: file.name, ...facts })).media;
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      xhr.abort();
    },
  };
}
