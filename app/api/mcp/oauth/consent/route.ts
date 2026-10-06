import { assertConsentOrigin, consentDecisionSchema, decideConsent } from "@/lib/product-intelligence/consent";
import { readBoundedJson, mcpHttpError } from "@/lib/product-intelligence/http";
import { McpAuthError } from "@/lib/product-intelligence/oauth";

export async function POST(request: Request) {
  try {
    assertConsentOrigin(request);
    const input = consentDecisionSchema.safeParse(await readBoundedJson(request, 8192));
    if (!input.success) return Response.json({ error: "Revisa los permisos y conecta de nuevo el cliente MCP." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return Response.json({ redirect_url: await decideConsent(input.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return error instanceof McpAuthError ? mcpHttpError(error) : Response.json({ error: "No pudimos completar la autorización. Conecta de nuevo el cliente MCP." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
