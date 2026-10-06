// Datos conservados de Información base y edición manual. La identificación pagada se retiró.
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

/** Lo que edita el comerciante. */
export const productDataEditSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del producto").max(PRODUCT_NAME_MAX, `Hasta ${PRODUCT_NAME_MAX} caracteres`),
  description: z.string().trim().min(20, "Escribe al menos una línea con lo que es el producto").max(PRODUCT_DESCRIPTION_MAX, `Hasta ${PRODUCT_DESCRIPTION_MAX} caracteres`),
});

/** ¿Hay datos suficientes para la vista conservada de Información base? */
export const hasProductData = (d: ProductData | null | undefined): d is ProductData => Boolean(d?.name.trim() && d.description.trim());
