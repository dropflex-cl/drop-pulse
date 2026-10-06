import { adminClient } from "@/lib/integrations/admin";
import { type ProductData } from "@/lib/products/product-data";
import "server-only";
import { OptimizeError } from "./errors";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Guarda la edición manual de datos conservados; no genera contenido. */
export async function saveProductData(userId: string, productId: string, data: ProductData): Promise<ProductData> {
  const { data: rows, error } = await adminClient()
    .from("products")
    .update({ product_data: data, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", productId)
    .select("id");
  fail("Guardar los datos del producto", error);
  if (!rows?.length) throw new OptimizeError("No encontramos ese producto.", 404);
  return data;
}
