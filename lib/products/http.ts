import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { OnboardingError } from "@/lib/onboarding/types";
import { OptimizeError } from "@/lib/pipeline/errors";
import { getProductRow, type ProductRow } from "./store";

// Rutas /api/products/*: errores { error, field? } en español con el código HTTP que corresponde
// (el mismo contrato de /api/onboarding), y el producto verificado contra el usuario de la sesión.

export class ProductApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown, fallback = "No pudimos guardar el cambio. Intenta de nuevo en un momento.") {
  if (e instanceof ProductApiError || e instanceof OnboardingError) {
    return NextResponse.json({ error: e.message, field: e.field }, { status: e.status });
  }
  if (e instanceof OptimizeError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Usuario de la sesión y su producto; 401 sin sesión, 404 si el producto no es suyo. */
export async function ownedProduct(id: string): Promise<{ userId: string; product: ProductRow }> {
  const user = await requireUser();
  const product = await getProductRow(user.id, id);
  if (!product) throw new ProductApiError("No encontramos ese producto.", 404);
  return { userId: user.id, product };
}

export async function json<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}
