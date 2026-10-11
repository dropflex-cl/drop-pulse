// Situación del contenido efectivo y publicación. No depende de fases ni aprobaciones.
import { contentSituation, type ProductContentState } from "./content-state";
import type { ContentStatus, ProductFilter, Stage } from "@/lib/types";

export interface PublicationFacts {
  status: "publishing" | "published" | "error";
  error?: string | null;
}
export interface ProductPresentationInput {
  publish?: PublicationFacts | null;
  content?: { hasContent: boolean; missing: string[]; stale: boolean; changes?: string[] };
}
export const COPY_STAGE_TITLE = "Página del producto";
export const STRATEGY_STAGE_TITLE = "Estrategia guardada";
export const PRODUCT_SECTIONS: Stage[] = [
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
export interface ProductPresentation {
  contentState: ProductContentState;
  publicationReady: boolean;
  sections: Stage[];
  filter: ProductFilter;
  reason: string;
  tone: "warning" | "danger" | "success" | "primary" | "muted";
  summary: string;
  status?: ContentStatus;
}
export function productPresentation(f: ProductPresentationInput): ProductPresentation {
  const hasContent = f.content?.hasContent ?? false, missing = f.content?.missing ?? [];
  const situation = contentSituation({ hasContent, missing, publication: f.publish ? { ...f.publish, stale: f.content?.stale } : null });
  return {
    contentState: situation.state, publicationReady: hasContent && missing.length === 0,
    sections: PRODUCT_SECTIONS.map(section => ({ ...section })),
    filter: f.publish?.status === "published" ? "publicados" : situation.state === "error" ? "detenidos" : "avanzan",
    tone: situation.state === "error" ? "danger" : ["published", "ready"].includes(situation.state) ? "success" : situation.state === "updated" ? "warning" : "muted",
    reason: situation.label, summary: situation.label, status: situation.status,
  };
}
