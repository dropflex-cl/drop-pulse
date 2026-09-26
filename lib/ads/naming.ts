// Los nombres de lo que se crea en Meta: «Producto | ABO | Tipo de creativo | 26-09-2026», y los conjuntos y
// anuncios con lo que los distingue al final («… | Conjunto 1 · UGC Collagen»). Puro: lo usan el lanzador,
// la vista previa del configurador y los tests.

import type { Structure } from "./schemas";

/** De dónde sale un creativo, cuando se sabe: el video UGC o de mascota y el chat de WhatsApp de Creativos. */
export type MediaFormat = "ugc" | "mascot" | "chat" | null;

export interface NamingMedia {
  kind: "image" | "video";
  format?: MediaFormat;
}

export interface Naming {
  product: string;
  structure: Structure;
  /** La fecha de creación, ya formateada (creationDate). */
  date: string;
}

const PRODUCT_MAX = 50;
const SEP = " | ";

export function creativeType(m: NamingMedia): string {
  if (m.kind === "video") return m.format === "ugc" ? "Video UGC" : m.format === "mascot" ? "Video mascota" : "Video";
  return m.format === "chat" ? "Chat WhatsApp" : "Imagen";
}

/** Los tipos distintos, en el orden de los creativos: «Video UGC + Imagen». */
export function creativeTypes(media: NamingMedia[]): string {
  return [...new Set(media.map(creativeType))].join(" + ") || "Sin creativos";
}

/** dd-mm-aaaa en la zona horaria de la cuenta. */
export function creationDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

function head(n: Naming, types: string): string {
  const product = n.product.replace(/\s+/g, " ").replace(/\|/g, "/").trim().slice(0, PRODUCT_MAX).trim() || "Producto";
  return [product, n.structure.toUpperCase(), types, n.date].join(SEP);
}

export function campaignName(n: Naming, media: NamingMedia[]): string {
  return head(n, creativeTypes(media));
}

/** Un conjunto o anuncio: la cabecera con SUS creativos y, al final, lo que lo distingue de sus hermanos. */
export function unitName(n: Naming, media: NamingMedia[], detail: string): string {
  return `${head(n, creativeTypes(media))}${SEP}${detail}`;
}
