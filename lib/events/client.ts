// Cliente tipado de /api/events/* (para componentes "use client"). Mismo contrato de errores que
// /api/products (ProductApiClientError con el campo).
import { ProductApiClientError } from "@/lib/products/client";
import type { EventActivationView, EventProductView } from "@/lib/types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/events${path}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  } catch {
    throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProductApiClientError(data.error ?? "No pudimos guardar el cambio. Intenta de nuevo.", data.field, res.status);
  return data as T;
}

const send = <T>(method: string, path: string, data?: unknown) => call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export type ActivationPatch = Partial<Omit<EventActivationView, "startsOn" | "endsOn">> & { startsOn?: string | null; endsOn?: string | null };
type Copy = EventProductView["copy"];

export const eventsApi = {
  saveActivation: (slug: string, productId: string | null, patch: ActivationPatch) => send<{ ok: true }>("PUT", `/${slug}/activation`, { productId, ...patch }),
  removeActivation: (slug: string, productId: string | null) => send<{ ok: true }>("DELETE", `/${slug}/activation${productId ? `?product=${encodeURIComponent(productId)}` : ""}`),
  copy: (slug: string, productId: string) => call<{ copy: Copy }>(`/${slug}/copy?product=${encodeURIComponent(productId)}`),
  writeCopy: (slug: string, productId: string) => send<{ copy: Copy }>("POST", `/${slug}/copy`, { productId }),
  approveCopy: (slug: string, productId: string, copy?: { announcement: string; subtitle: string; badge_label: string }) => send<{ copy: Copy }>("PUT", `/${slug}/copy`, { productId, copy }),
  discardCopy: (slug: string, productId: string) => send<{ copy: null }>("DELETE", `/${slug}/copy?product=${encodeURIComponent(productId)}`),
  publish: () => send<{ products: number; withEvent: number; failed: string[] }>("POST", "/publish"),
};
