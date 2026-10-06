import { requireUser } from "@/lib/integrations/session";
import { errorResponse, ProductApiError } from "@/lib/products/http";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user.admin) throw new ProductApiError("Solo un administrador puede consultar los prompts.", 403);
    throw new ProductApiError("La activación de prompts antiguos se retiró. Prepara el contenido desde el chat.", 410);
  } catch (error) { return errorResponse(error); }
}
