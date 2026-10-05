// Datos del producto (Información base): el nombre y la descripción que llenan DATOS DEL PRODUCTO en el
// prompt de la estrategia. Los identifica la IA (paso product_data) o los escribe el comerciante; se
// guardan en products.product_data. Puro: lo usan el servidor, la API y la pantalla.
import * as z from "zod/v4";

export const PRODUCT_NAME_MAX = 120;
export const PRODUCT_DESCRIPTION_MAX = 6000;

export interface ProductData {
  name: string;
  description: string;
  /** Quién escribió la última versión. */
  source: "ai" | "merchant";
  updated_at: string;
  /** La versión del prompt y el modelo de la última identificación con IA. */
  prompt_version?: number | null;
  model?: string | null;
}

/** Lo que devuelve la IA. */
export const productDataSchema = z.object({
  product_name: z.string().describe("El nombre claro y literal del producto (qué es), sin adjetivos de venta."),
  description: z.string().describe("Las características del producto, una por línea empezando con «- », y al final «Falta: …» si falta un dato importante."),
});
export type ProductDataOutput = z.infer<typeof productDataSchema>;

/** Lo que edita el comerciante. */
export const productDataEditSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del producto").max(PRODUCT_NAME_MAX, `Hasta ${PRODUCT_NAME_MAX} caracteres`),
  description: z.string().trim().min(20, "Escribe al menos una línea con lo que es el producto").max(PRODUCT_DESCRIPTION_MAX, `Hasta ${PRODUCT_DESCRIPTION_MAX} caracteres`),
});

/** ¿Alcanza para correr la estrategia? */
export const hasProductData = (d: ProductData | null | undefined): d is ProductData => Boolean(d?.name.trim() && d.description.trim());
