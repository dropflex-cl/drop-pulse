// Cliente tipado de /api/products/* (para componentes "use client").
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import type { PricingForm } from "@/lib/pricing/plan";
import type { AvatarProposal, OptimizationRun, PackLabelsProposal, ReferenceImage, SavedPricingDto } from "@/lib/types";

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
  const done = (async () => {
    const { path, uploadUrl } = await send<{ path: string; uploadUrl: string }>("POST", `/${productId}/images/upload-url`, { type: file.type, size: file.size });
    if (cancelled) throw new ProductApiClientError("Subida cancelada.", "abort");
    await put(uploadUrl);
    onProgress(1);
    return (await send<{ image: ReferenceImage }>("POST", `/${productId}/images`, { path, name: file.name })).image;
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      xhr.abort();
    },
  };
}

export const productsApi = {
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
  editAvatar: (id: string, avatar: CustomerAvatar, approve: boolean) => send<{ avatar: AvatarProposal }>("PUT", `/${id}/avatar`, { avatar, approve }),
};
