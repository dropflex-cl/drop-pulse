// Textos de la etapa Reseñas (design-system/reference/ReviewImporter/README.md). Puro y testeable:
// cada código de error que puede dejar una importación tiene su mensaje, con qué pasó y qué hacer.

export type ImportErrorCode = "not_aliexpress" | "short_link_unresolved" | "fetch_failed" | "blocked" | "no_reviews" | "none_match" | "stale" | "failed";

export const IMPORT_ERRORS: Record<ImportErrorCode, string> = {
  not_aliexpress: "Ese enlace no es de AliExpress. Pega el enlace del producto en aliexpress.com.",
  short_link_unresolved: "No pudimos abrir ese enlace corto. Abre el producto en el navegador y pega la dirección completa.",
  fetch_failed: "AliExpress no respondió. Intenta de nuevo en unos minutos.",
  blocked: "AliExpress no respondió. Intenta de nuevo en unos minutos.",
  no_reviews: "Ese producto no tiene reseñas en AliExpress. Prueba con el enlace de otro vendedor del mismo producto.",
  none_match: "Ninguna reseña cumple los filtros. Prueba con “Todas” o sin “Solo con fotos”.",
  stale: "La importación se interrumpió. Intenta de nuevo.",
  failed: "No pudimos guardar las reseñas. Intenta de nuevo en un momento.",
};

export const importErrorMessage = (code: string | null | undefined) => IMPORT_ERRORS[code as ImportErrorCode] ?? IMPORT_ERRORS.failed;

const monthYear = new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone: "UTC" });

/** “2026-08-13” → “ago 2026”. */
export function reviewDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return monthYear.format(d).replace(/\./g, "").replace(/\s+de\s+/, " ").toLowerCase();
}

const regions = new Intl.DisplayNames(["es"], { type: "region" });

/** “CL” → “Chile” (para la vista de la tienda). */
export function countryLabel(code: string | undefined): string {
  if (!code) return "";
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

/** 4.6 → “4,6”. */
export const ratingLabel = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Resumen de una importación terminada: “48 importadas · promedio 4,6” o “12 nuevas · 36 ya estaban”. */
export function importSummary(imported: number, skipped: number, average?: number): string {
  const avg = average ? ` · promedio ${ratingLabel(average)}` : "";
  if (!skipped) return `${imported} ${imported === 1 ? "importada" : "importadas"}${avg}`;
  if (!imported) return `Ninguna nueva · ${skipped} ya estaban`;
  return `${imported} ${imported === 1 ? "nueva" : "nuevas"} · ${skipped} ya estaban`;
}
