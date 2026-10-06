import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createProductIntelligenceServer, type DomainExecutor } from "./mcp";
import { assertMcpRequestOrigin, McpAuthError, type McpAuthentication, type McpConfiguration } from "./oauth";
import { requireScopes, toolScopes } from "./policy";
import { PI_LIMITS } from "./validation";
import type { ToolName } from "./schemas";

export function mcpHttpError(error: unknown, config?: McpConfiguration): Response {
  const auth = error instanceof McpAuthError ? error : new McpAuthError(503, "No pudimos completar la conexión MCP. Reintenta en unos momentos.");
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (auth.status === 401 && config) headers.set("WWW-Authenticate", `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", config.resourceUrl)}"`);
  return Response.json({ error: auth.message }, { status: auth.status, headers });
}

/** Leer con límite antes de JSON.parse; Content-Length no sustituye contar los bytes. */
export async function readBoundedJson(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new McpBodyError(415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new McpBodyError(413);
  if (!request.body) throw new McpBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new McpBodyError(413); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { throw new McpBodyError(400); }
  } finally { reader.releaseLock(); }
}
class McpBodyError extends Error { constructor(readonly status: 400 | 413 | 415) { super("Envía JSON válido dentro del tamaño permitido."); } }

/** Transporte oficial stateless. El ejecutor debe volver a comprobar el grant dentro de cada transacción. */
export function createMcpHttpHandler(config: McpConfiguration, authenticate: (request: Request) => Promise<McpAuthentication>, execute: DomainExecutor,
  options: { availableTools?: readonly ToolName[]; executorForAuthentication?: (auth: McpAuthentication) => DomainExecutor } = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      assertMcpRequestOrigin(request, config);
      const origin = request.headers.get("origin");
      const cors: Record<string, string> = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version" } : {};
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version", "Cache-Control": "no-store" } });
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store", ...cors } });
      const auth = await authenticate(request);
      const body = await readBoundedJson(request, PI_LIMITS.inputBytes);
      const authenticatedExecutor = options.executorForAuthentication?.(auth) ?? execute;
      const guarded: DomainExecutor = async (principal, command, signal) => {
        requireScopes(principal, toolScopes[command.tool]);
        if (command.tool === "get_product_context" && command.input.include?.includes("performance")) requireScopes(principal, ["performance:read"]);
        return authenticatedExecutor(principal, command, signal);
      };
      const server = createProductIntelligenceServer(auth.principal, guarded, { availableTools: options.availableTools });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: PI_LIMITS.inputBytes });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request, { parsedBody: body, authInfo: { token: request.headers.get("authorization")!.slice(7), clientId: auth.identity.clientId, scopes: [...auth.principal.scopes], expiresAt: auth.expiresAt, resource: new URL(config.resourceUrl) } });
        // Cada respuesta JSON tiene su propio transporte, sin sesión o stream compartidos entre actores.
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        for (const [name, value] of Object.entries(cors)) headers.set(name, value);
        return new Response(response.body, { status: response.status, headers });
      } finally { await server.close(); }
    } catch (error) {
      const response = error instanceof McpBodyError ? Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } }) : mcpHttpError(error, config);
      const origin = request.headers.get("origin");
      if (origin && config.allowedOrigins.includes(origin)) { response.headers.set("Access-Control-Allow-Origin", origin); response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate"); response.headers.set("Vary", "Origin"); }
      return response;
    }
  };
}
