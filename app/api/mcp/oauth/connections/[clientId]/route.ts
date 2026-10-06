import { assertConsentOrigin, revokeMcpConnection } from "@/lib/product-intelligence/consent";
import { mcpHttpError } from "@/lib/product-intelligence/http";
import { McpAuthError } from "@/lib/product-intelligence/oauth";

export async function DELETE(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    assertConsentOrigin(request);
    await revokeMcpConnection((await params).clientId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return error instanceof McpAuthError ? mcpHttpError(error) : Response.json({ error: "El acceso MCP quedó revocado si el cliente estaba conectado. Reintenta para cerrar también las sesiones del proveedor." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
