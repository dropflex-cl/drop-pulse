import { NextResponse } from "next/server";
import { montagePackage } from "@/lib/pipeline/video";
import { errorResponse, ownedProduct } from "@/lib/products/http";

/**
 * El paquete de montaje (docs/spec-video-ugc.md §5.1): un JSON con los clips firmados por 24 h que
 * lee scripts/ugc-montage.py. Se descarga como archivo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await params;
    const { userId } = await ownedProduct(id);
    const pkg = await montagePackage(userId, id, scriptId);
    return new NextResponse(JSON.stringify(pkg, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="video-angulo-${pkg.angle.slot}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
