import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { runThemePublish, runThemeUpdate, startThemeInstall, themeView } from "@/lib/pipeline/theme";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

// El tema de DropFlex en la tienda: instalar (en segundo plano), actualizar y publicar.
export const maxDuration = 300;

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await themeView(user.id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** { action: "install" | "update" | "publish" }. Publicar lo hace visible a los compradores. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { action } = await json<{ action: string }>(req);
    if (action === "install") await startThemeInstall(user.id);
    else if (action === "update") await runThemeUpdate(user.id);
    else if (action === "publish") await runThemePublish(user.id);
    else throw new ProductApiError("Acción desconocida.", 400);
    return NextResponse.json(await themeView(user.id), { status: action === "install" ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos hacer el cambio en el tema. Intenta de nuevo.");
  }
}
