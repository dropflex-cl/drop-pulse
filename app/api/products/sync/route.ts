import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { markShopifyError } from "@/lib/integrations/shopify/connection";
import { ShopifyAuthError } from "@/lib/integrations/shopify/client";
import { errorResponse, ProductApiError } from "@/lib/products/http";
import { ShopifyNotConnectedError, syncShopifyProducts } from "@/lib/products/sync";

// Una tienda grande tarda: listar todos los ids, borrar los eliminados y traer hasta 50 nuevos.
export const maxDuration = 300;

/** Botón “Sincronizar” de Productos: deja products igual a la tienda de Shopify. */
export async function POST() {
  try {
    const user = await requireUser();
    try {
      return NextResponse.json(await syncShopifyProducts(user.id));
    } catch (e) {
      if (e instanceof ShopifyNotConnectedError) {
        throw new ProductApiError("Tu tienda no está conectada. Conéctala en Ajustes para sincronizar.", 409);
      }
      if (e instanceof ShopifyAuthError) {
        await markShopifyError(user.id, "expired").catch(() => {});
        throw new ProductApiError("Shopify no nos dio acceso a tus productos. Vuelve a conectar tu tienda en Ajustes.", 409);
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e, "No pudimos sincronizar con Shopify. Intenta de nuevo en un momento.");
  }
}
