import * as z from "zod/v4";
import { SALES_ANGLES } from "@/lib/angles/catalog";

// Análisis de una tienda de la competencia (docs/spec-angulos-testeo.md › §3.2). Puro: lo usan el
// paso de IA (lib/pipeline/competitors.ts), el guardado y la pantalla. Claves en inglés.

/** Bump cuando cambie el prompt o el esquema del análisis. */
export const COMPETITOR_PROMPT_VERSION = 1;

/** Tiendas de la competencia por producto. */
export const MAX_COMPETITORS = 7;

const text = z.string().trim();

export const competitorAnalysisSchema = z.object({
  store_name: text.nullable().describe("Nombre de la tienda o marca como aparece en la página; null si no se ve."),
  price: z.number().nullable().describe("Precio de venta de 1 unidad, en la moneda del mercado, como número (sin símbolos ni separadores). null si no se ve."),
  compare_at: z.number().nullable().describe("Precio tachado («antes»), como número; null si no hay."),
  offer: text.nullable().describe("La oferta tal como la presenta: packs, 2x1, regalo, envío gratis, pago contra entrega… null si no hay."),
  main_angle: z.object({
    pain_or_desire: text.describe("El dolor o deseo principal que destaca la página, con sus palabras."),
    segment: text.describe("A quién le habla (para quién dice que es)."),
    promise: text.describe("La promesa principal."),
  }),
  frame: z.enum(SALES_ANGLES).describe("La forma de contar que más usa la página (una de las 6)."),
  proof_used: z.array(text).describe("Las pruebas que muestra: reseñas, cantidad de vendidos, experto, antes y después, certificaciones, garantía…"),
  tone: text.describe("El tono en pocas palabras (p. ej. «urgente y exagerado», «sobrio y técnico»)."),
});

export type CompetitorAnalysis = z.infer<typeof competitorAnalysisSchema>;

export type CompetitorStatus = "queued" | "running" | "succeeded" | "failed";

/** Por qué falló la lectura o el análisis (product_competitors.error_code). */
export type CompetitorErrorCode =
  | "invalid_url"
  | "blocked_address"
  | "dns_failed"
  | "timeout"
  | "http_error"
  | "too_many_redirects"
  | "not_html"
  | "empty_page"
  | "network"
  | "stale"
  | "ai_failed"
  | "not_found";

const REASONS: Record<CompetitorErrorCode, string> = {
  invalid_url: "el link no es una página web válida. Revisa que empiece con https://.",
  blocked_address: "ese link apunta a una dirección privada. Pega el link público de la tienda.",
  dns_failed: "no encontramos ese sitio. Revisa que el link esté bien escrito.",
  timeout: "tardó demasiado en responder. Toca Reintentar en un rato.",
  http_error: "la tienda no nos dejó entrar o la página ya no existe. Ábrela en tu navegador para revisarla.",
  too_many_redirects: "nos redirigió demasiadas veces. Pega el link final, el que ves en tu navegador.",
  not_html: "el link no es una página de producto. Pega el link de la página de la tienda.",
  empty_page: "la página no tiene texto que se pueda leer sin abrirla en un navegador.",
  network: "se cortó la conexión con la tienda. Toca Reintentar.",
  stale: "el análisis se interrumpió. Toca Reintentar.",
  ai_failed: "la IA no pudo analizarla. Toca Reintentar.",
  not_found: "el producto ya no existe.",
};

/** «No pudimos leer esa página: …», para la pantalla. */
export function competitorErrorMessage(code: string | null | undefined): string {
  const reason = REASONS[code as CompetitorErrorCode] ?? "algo falló. Toca Reintentar.";
  return `No pudimos leer esa página: ${reason}`;
}
