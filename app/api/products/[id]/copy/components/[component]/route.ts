import { NextResponse } from "next/server";
import { copyState } from "@/lib/data/products";
import { restoreComponent, updateComponent, type ComponentPatch } from "@/lib/pipeline/copy";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import type { ImagePick } from "@/lib/types";

// La ficha o un componente de la página (la IA propone, tú decides):
// PATCH { content, images? } → guardar la hoja de edición (aprueba y lo usa en la página)
// PATCH { enabled }          → «Usar en la página» (activar aprueba; desactivar conserva el contenido)
// PATCH { approve: true }    → aprobar sin cambios («Aprobar ficha»)
// PATCH { restore: true }    → «Deshacer» después de «Volver a escribir con IA»: vuelve la versión anterior

type Params = { params: Promise<{ id: string; component: string }> };

const isPick = (v: unknown): v is ImagePick => {
  const p = v as ImagePick;
  return Boolean(p) && typeof p.slot === "string" && (p.source === "reference" || p.source === "page_image") && typeof p.id === "string";
};

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id, component } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<Record<string, unknown>>(req);
    if (body.restore === true) {
      await restoreComponent(userId, id, decodeURIComponent(component));
      return NextResponse.json(await copyState(userId, id));
    }
    const patch: ComponentPatch = {};
    if (body.content !== undefined) {
      if (!body.content || typeof body.content !== "object") throw new ProductApiError("El contenido no es válido.", 400, "content");
      patch.content = body.content;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw new ProductApiError("«Usar en la página» no es válido.", 400, "enabled");
      patch.enabled = body.enabled;
    }
    if (body.images !== undefined) {
      if (!Array.isArray(body.images) || !body.images.every(isPick)) throw new ProductApiError("Las imágenes no son válidas.", 400, "images");
      patch.images = body.images;
    }
    if (body.approve === true) patch.approve = true;
    if (!Object.keys(patch).length) throw new ProductApiError("No hay nada que guardar.", 400);
    await updateComponent(userId, id, decodeURIComponent(component), patch);
    return NextResponse.json(await copyState(userId, id));
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el componente. Intenta de nuevo.");
  }
}
