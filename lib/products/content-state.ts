import type { ContentStatus } from "@/lib/types";

export type ProductContentState = "empty" | "incomplete" | "ready" | "publishing" | "published" | "updated" | "error";
export interface ContentSituation {
  hasContent: boolean;
  missing: string[];
  publication?: { status: "publishing" | "published" | "error"; publishedAt?: string | null; stale?: boolean; error?: string | null } | null;
}
export function contentSituation({ hasContent, missing, publication }: ContentSituation): { state: ProductContentState; label: string; status?: ContentStatus } {
  if (publication?.status === "publishing") return { state: "publishing", label: "Publicando en tu tienda", status: "publicando" };
  if (publication?.status === "error") return { state: "error", label: publication.error ?? "No se pudo publicar. Intenta de nuevo.", status: "error" };
  if (publication?.status === "published") return publication.stale
    ? { state: "updated", label: "Hay cambios sin publicar", status: "publicado" }
    : { state: "published", label: "Publicado en tu tienda", status: "publicado" };
  if (!hasContent) return { state: "empty", label: "Sin página guardada" };
  if (missing.length) return { state: "incomplete", label: "Falta completar para publicar" };
  return { state: "ready", label: "Listo para publicar", status: "aprobado" };
}
