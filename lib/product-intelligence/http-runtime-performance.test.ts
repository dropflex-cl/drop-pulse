import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PI_SCOPES } from "./policy";
import { serveMcpRequest } from "./http-runtime";

const runtime = vi.hoisted(() => ({ callbacks: [] as (() => Promise<void>)[], repo: {} as Record<string, unknown>, principal: {} as Record<string, unknown> }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => { runtime.callbacks.push(task); } }));
vi.mock("./repository", async original => ({ ...await original<typeof import("./repository")>(), createContextRepository: () => runtime.repo }));
vi.mock("./oauth", async original => ({ ...await original<typeof import("./oauth")>(),
  mcpConfiguration: () => ({ resourceUrl: "http://localhost:3000/api/mcp", issuer: "http://127.0.0.1:55321/auth/v1", jwksUrl: "http://127.0.0.1:55321/auth/v1/.well-known/jwks.json", allowedOrigins: [] }),
  createMcpAuthenticator: () => async () => ({ principal: runtime.principal, identity: { clientId: "00000000-0000-4000-8000-000000000001" }, expiresAt: Math.floor(Date.now() / 1000) + 300 }),
}));
afterEach(() => { vi.restoreAllMocks(); runtime.callbacks = []; });
describe("Runtime HTTP MCP y after", () => {
  it("el transporte entrega el cuerpo antes de persistir y mantiene el callback hasta su término", async () => {
    const id = randomUUID(), operation = randomUUID();
    runtime.principal = { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES };
    const persist = vi.fn(async () => {});
    runtime.repo = { loadVisual: vi.fn(), commitVisual: vi.fn(), visualOperation: vi.fn(), readVisualOperation: async () => ({ revision: 1, etag: "a".repeat(64), dependency_stamp: "b".repeat(64), operation: {
      id: operation, kind: "ingest", iteration_id: randomUUID(), status: "pending", source: {}, result: null, error_message: null, expires_at: new Date().toISOString(),
    } }), visualTransfer: persist };
    const response = await serveMcpRequest(new Request("http://localhost:3000/api/mcp", { method: "POST", headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer local-fixture",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_visual_ingestion_status", arguments: { product_id: id, operation_id: operation } } }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { structuredContent: { ok: true, data: { state: "pending" } } } });
    expect(persist).not.toHaveBeenCalled(); expect(runtime.callbacks).toHaveLength(1);
    await Promise.all(runtime.callbacks.map(task => task()));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ p_access: expect.objectContaining({ user_id: id }), p_event: expect.objectContaining({ reported_by: "server", stage: "tool_execution" }) }), expect.any(AbortSignal));
  });
});
