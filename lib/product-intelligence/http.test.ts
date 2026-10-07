import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHttpHandler, readBoundedJson } from "./http";
import { createMcpAuthenticator } from "./oauth";
import { oauthFixture, oauthTestConfig } from "./oauth-test-fixtures";
import { PI_LIMITS } from "./validation";
import { inputSchemas } from "./schemas";
import type { DomainExecutor } from "./mcp";
import { PI_SCOPES, type PiScope } from "./policy";
import { OPTIMIZATION_SKILL_URI } from "./mcp-skills";

describe("PI · HTTP oficial", () => {
  async function fixture(execute: DomainExecutor = async (principal) => ({ ok: false, request_id: "00000000-0000-4000-8000-000000000009", error: { code: "NOT_FOUND", message: principal.userId, retryable: false, details: {} } }), scopes: readonly PiScope[] = PI_SCOPES) {
    const oauth = await oauthFixture(); let active = true;
    const authenticate = createMcpAuthenticator(oauthTestConfig, async () => active ? oauth.grant : null, oauth);
    const handler = createMcpHttpHandler(oauthTestConfig, authenticate, execute);
    const transport = new StreamableHTTPClientTransport(new URL(oauthTestConfig.resourceUrl), { requestInit: { headers: { Authorization: `Bearer ${await oauth.token({ pi_scopes: [...scopes] })}` } }, fetch: async (input, init) => handler(new Request(input, init)) });
    const client = new Client({ name: "pi-http-test", version: "1" });
    return { handler, client, transport, revoke: () => { active = false; } };
  }
  it("inicializa, pagina discovery y llama tools por Streamable HTTP JSON", async () => {
    const session = await fixture();
    try {
      await session.client.connect(session.transport);
      const tools = []; let cursor: string | undefined;
      do { const page = await session.client.listTools(cursor ? { cursor } : undefined); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor);
      expect(tools).toHaveLength(Object.keys(inputSchemas).length);
      const result = await session.client.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-4000-8000-000000000009" } });
      expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    } finally { await session.client.close(); }
  });
  it("revocar bloquea la siguiente petición incluso durante una conexión SDK", async () => {
    const execute = vi.fn<DomainExecutor>(async () => null); const session = await fixture(execute);
    try {
      await session.client.connect(session.transport); session.revoke();
      await expect(session.client.listTools()).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    } finally { await session.client.close(); }
  });
  it("los recursos de skills mantienen autenticación y revocación sin ejecutar el dominio", async () => {
    const execute = vi.fn<DomainExecutor>(); const session = await fixture(execute);
    try {
      await session.client.connect(session.transport);
      const resource = await session.client.readResource({ uri: OPTIMIZATION_SKILL_URI });
      expect(resource.contents[0].uri).toBe(OPTIMIZATION_SKILL_URI);
      const anonymous = await session.handler(new Request(oauthTestConfig.resourceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: OPTIMIZATION_SKILL_URI } }) }));
      expect(anonymous.status).toBe(401);
      session.revoke();
      await expect(session.client.readResource({ uri: OPTIMIZATION_SKILL_URI })).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    } finally { await session.client.close(); }
  });
  it("un cliente de lectura no puede generar ni pedir métricas sin permiso", async () => {
    const execute = vi.fn<DomainExecutor>(async () => null), session = await fixture(execute, ["product_intelligence:read"]);
    try {
      await session.client.connect(session.transport);
      const generate = await session.client.callTool({ name: "generate_gallery_images", arguments: { product_id: "00000000-0000-4000-8000-000000000009", schema_version: "1.0", expected_revision: 0, expected_content_etag: "a".repeat(64), provider: "gemini", shot_ids: ["00000000-0000-4000-8000-000000000010"], max_estimated_usd: 1, idempotency_key: "read-only-render", dry_run: true } });
      expect(generate.structuredContent).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const metrics = await session.client.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-4000-8000-000000000009", include: ["performance"] } });
      expect(metrics.structuredContent).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(execute).not.toHaveBeenCalled();
    } finally { await session.client.close(); }
  });
  it("dos actores concurrentes en la misma ruta no comparten principal ni respuesta", async () => {
    const oauth = await oauthFixture();
    const otherUser = "00000000-0000-4000-8000-000000000005";
    const authenticate = createMcpAuthenticator(oauthTestConfig, async (identity) => [oauth.grant.user_id, otherUser].includes(identity.userId) ? { ...oauth.grant, user_id: identity.userId } : null, oauth);
    const handler = createMcpHttpHandler(oauthTestConfig, authenticate, async (principal) => ({ ok: false, request_id: "00000000-0000-4000-8000-000000000009", error: { code: "NOT_FOUND", message: principal.userId, retryable: false, details: {} } }));
    const clients = await Promise.all([oauth.grant.user_id, otherUser].map(async (sub) => {
      const client = new Client({ name: "concurrent-http-test", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(oauthTestConfig.resourceUrl), { requestInit: { headers: { Authorization: `Bearer ${await oauth.token({ sub })}` } }, fetch: async (input, init) => handler(new Request(input, init)) }));
      return client;
    }));
    try {
      const responses = await Promise.all(clients.map((client) => client.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-4000-8000-000000000009" } })));
      expect(responses[0].structuredContent).toMatchObject({ error: { message: oauth.grant.user_id } });
      expect(responses[1].structuredContent).toMatchObject({ error: { message: otherUser } });
    } finally { await Promise.all(clients.map((client) => client.close())); }
  });
  it("cookie sola devuelve challenge antes de parsear o ejecutar", async () => {
    const execute = vi.fn<DomainExecutor>(); const session = await fixture(execute);
    const response = await session.handler(new Request(oauthTestConfig.resourceUrl, { method: "POST", headers: { Cookie: "session=merchant", "Content-Type": "application/json" }, body: "invalid" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/api/mcp");
    expect(execute).not.toHaveBeenCalled();
  });
  it("GET/DELETE no abren SSE y preflight solo permite el origen configurado", async () => {
    const session = await fixture();
    for (const method of ["GET", "DELETE"]) expect((await session.handler(new Request(oauthTestConfig.resourceUrl, { method }))).status).toBe(405);
    const allowed = await session.handler(new Request(oauthTestConfig.resourceUrl, { method: "OPTIONS", headers: { Origin: "https://app.dropflex.test" } }));
    expect(allowed.status).toBe(204); expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.dropflex.test");
    const rejected = await session.handler(new Request(oauthTestConfig.resourceUrl, { method: "OPTIONS", headers: { Origin: "https://evil.test" } }));
    expect(rejected.status).toBe(403); expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("cuenta bytes sin Content-Length y rechaza encoding, JSON y content type inválidos", async () => {
    await expect(readBoundedJson(new Request(oauthTestConfig.resourceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(PI_LIMITS.inputBytes + 1) }), PI_LIMITS.inputBytes)).rejects.toMatchObject({ status: 413 });
    await expect(readBoundedJson(new Request(oauthTestConfig.resourceUrl, { method: "POST", body: "{}" }), 100)).rejects.toMatchObject({ status: 415 });
    await expect(readBoundedJson(new Request(oauthTestConfig.resourceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "invalid" }), 100)).rejects.toMatchObject({ status: 400 });
  });
});
