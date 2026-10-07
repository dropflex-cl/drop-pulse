import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { jsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { createProductIntelligenceServer, type DomainExecutor } from "./mcp";
import { examplesFixture, principalFixture, requestFixture } from "./test-fixtures";
import { ProductIntelligenceError } from "./errors";
import { PI_LIMITS } from "./validation";

const validators = (): jsonSchemaValidator => {
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  return { getValidator<T>(schema: object) {
    const validate = ajv.compile(schema);
    return (input: unknown) => validate(input) ? { valid: true as const, data: input as T, errorMessage: undefined } : { valid: false as const, data: undefined, errorMessage: ajv.errorsText(validate.errors) };
  } };
};
async function connect(execute: DomainExecutor, userId = "merchant-a", requestTimeoutMs?: number) {
  const server = createProductIntelligenceServer({ ...principalFixture(), userId }, execute, { requestTimeoutMs });
  const client = new Client({ name: "pi-local-test", version: "1" }, { jsonSchemaValidator: validators() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { server, client, close: async () => { await client.close(); await server.close(); } };
}

describe("PI · protocolo MCP oficial", () => {
  it("inicializa y descubre treinta y siete tools con outputSchema, incluidas unions raíz", async () => {
    const session = await connect(async () => null);
    try {
      const tools = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await session.client.listTools(cursor ? { cursor } : undefined);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(PI_LIMITS.outputBytes);
        tools.push(...page.tools); cursor = page.nextCursor; pages++;
      } while (cursor);
      expect(tools).toHaveLength(37);
      expect(tools.find(tool => tool.name === "list_products")).toMatchObject({ annotations: { readOnlyHint: true, destructiveHint: false } });
      expect(tools.map(tool => tool.name)).not.toContain("generate_landing");
      await expect(session.client.callTool({ name: "generate_landing", arguments: {} })).rejects.toThrow("no existe");
      expect(pages).toBeGreaterThan(1);
      for (const tool of tools) { expect(tool.inputSchema.type).toBe("object"); expect(tool.outputSchema?.type).toBe("object"); }
      expect(tools.find((tool) => tool.name === "generate_ugc")?.inputSchema.properties?.stage).toMatchObject({ enum: ["keyframes", "clips"] });
      expect(session.client.getServerVersion()?.name).toBe("dropflex-product-intelligence");
    } finally { await session.close(); }
  });
  it("rechaza cursores de discovery inválidos", async () => {
    const session = await connect(async () => null);
    try {
      await expect(session.client.listTools({ cursor: "foreign" })).rejects.toThrow("cursor");
      await expect(session.client.listTools({ cursor: "pi-tools-v1:37" })).rejects.toThrow("cursor");
    } finally { await session.close(); }
  });
  it("lista productos sin conocer un ID y rechaza identidad inyectada", async () => {
    const response = { ok: true, request_id: "00000000-0000-4000-8000-000000000001", data: {
      products: [{ product_id: "00000000-0000-4000-8000-000000000002", name: "Organizador", description: "Ordena tus útiles." }], next_cursor: null,
    } };
    const execute = vi.fn<DomainExecutor>(async () => response);
    const session = await connect(execute);
    try {
      const result = await session.client.callTool({ name: "list_products", arguments: {} });
      expect(result.structuredContent).toEqual(response);
      expect(result.isError).toBe(false);
      expect(execute.mock.calls[0][1]).toEqual({ tool: "list_products", input: { page_size: 20, include_upsell: false } });
      const injected = await session.client.callTool({ name: "list_products", arguments: { user_id: "another-merchant" } });
      expect(injected).toMatchObject({ isError: true, structuredContent: { error: { code: "VALIDATION_ERROR" } } });
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { await session.close(); }
  });
  it("respuesta estructurada y texto JSON son idénticos; status es solo lectura", async () => {
    const response = examplesFixture.responses.find((entry) => entry.name === "script-complete-awaits-review")!.payload;
    const execute = vi.fn<DomainExecutor>(async () => response);
    const session = await connect(execute);
    try {
      const request = requestFixture("status-pure");
      const result = await session.client.callTool({ name: request.tool, arguments: request.payload as Record<string, unknown> });
      expect(result.structuredContent).toEqual(response);
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: "text", text: JSON.stringify(response) }]);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0].userId).toBe("merchant-a");
    } finally { await session.close(); }
  });
  it("errores de dominio/contrato usan isError y no ejecutan input inválido", async () => {
    const execute = vi.fn(async () => { throw new ProductIntelligenceError("REVISION_CONFLICT", "Relee.", { expected_revision: 5, current_revision: 6 }); });
    const session = await connect(execute);
    try {
      const request = requestFixture("patch-hook");
      const conflict = await session.client.callTool({ name: request.tool, arguments: request.payload as Record<string, unknown> });
      expect(conflict.isError).toBe(true);
      expect(conflict.structuredContent).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
      const invalid = await session.client.callTool({ name: request.tool, arguments: { tenant_id: "injected" } });
      expect(invalid.isError).toBe(true); expect(execute).toHaveBeenCalledTimes(1);
      expect(invalid.structuredContent).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    } finally { await session.close(); }
  });
  it("dos conexiones mantienen principals y resultados aislados", async () => {
    const users: string[] = [];
    const execute: DomainExecutor = async (principal) => {
      users.push(principal.userId);
      return { ok: false, request_id: "00000000-0000-0000-0000-000000000001", error: { code: "NOT_FOUND", message: principal.userId, retryable: false, details: {} } };
    };
    const first = await connect(execute, "merchant-a"); const second = await connect(execute, "merchant-b");
    try {
      const request = { name: "get_product_context", arguments: { product_id: "00000000-0000-0000-0000-000000000001" } };
      const results = await Promise.all([first.client.callTool(request), second.client.callTool(request)]);
      expect(results[0].structuredContent).toMatchObject({ error: { message: "merchant-a" } });
      expect(results[1].structuredContent).toMatchObject({ error: { message: "merchant-b" } });
      expect(users).toEqual(["merchant-a", "merchant-b"]);
    } finally { await first.close(); await second.close(); }
  });
  it("no expone excepciones internas ni acepta output con campos secretos", async () => {
    const session = await connect(async () => ({ ok: true, secret_token: "sensitive" }));
    try {
      const result = await session.client.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-0000-0000-000000000001" } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("sensitive");
    } finally { await session.close(); }
  });
  it("limita la espera y comunica cancelación al ejecutor", async () => {
    let executionSignal: AbortSignal | undefined;
    const session = await connect(async (_, __, signal) => {
      executionSignal = signal;
      return new Promise(() => { /* Simula un ejecutor que no responde. */ });
    }, "merchant-a", 5);
    try {
      const result = await session.client.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-0000-0000-000000000001" } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error: { retryable: true } });
      expect(executionSignal?.aborted).toBe(true);
    } finally { await session.close(); }
  });
  it("incluye la duplicación textual en el presupuesto de la respuesta MCP", async () => {
    const response = structuredClone(examplesFixture.responses.find((entry) => entry.name === "script-complete-awaits-review")!.payload);
    response.warnings = Array.from({ length: 12 }, (_, index) => ({ code: `fixture_${index}`, message: "x".repeat(6000), field: null }));
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(PI_LIMITS.outputBytes);
    const session = await connect(async () => response);
    try {
      const request = requestFixture("status-pure");
      const result = await session.client.callTool({ name: request.tool, arguments: request.payload as Record<string, unknown> });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error: { code: "RESPONSE_TOO_LARGE" } });
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(PI_LIMITS.outputBytes);
    } finally { await session.close(); }
  });
});
