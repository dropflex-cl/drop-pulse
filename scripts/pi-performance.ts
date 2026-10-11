// Medición local sin base de datos, autenticación, proveedores ni contenido comercial.
// node --conditions=react-server --import tsx scripts/pi-performance.ts
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { createProductIntelligenceServer, publishedSchemas } from "../lib/product-intelligence/mcp";
import { PI_SCOPES } from "../lib/product-intelligence/policy";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000001",
  actorKind: "merchant" as const,
  scopes: PI_SCOPES,
};
const percentile = (values: number[], quantile: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * quantile)];
const metrics = (values: number[]) => ({ median_ms: percentile(values, 0.5), p95_ms: percentile(values, 0.95) });
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const construction: number[] = [];
  for (let run = 0; run < 30; run++) {
    const start = performance.now();
    const server = createProductIntelligenceServer(principal, async () => null);
    construction.push(performance.now() - start);
    await server.close();
  }
  const server = createProductIntelligenceServer(principal, async () => null);
  const client = new Client({ name: "pi-performance-local", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const inMemory: number[] = [], pages: ListToolsResult[] = [];
  try {
    for (let run = 0; run < 10; run++) {
      const start = performance.now();
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        if (run === 0) pages.push(page);
        cursor = page.nextCursor;
      } while (cursor);
      inMemory.push(performance.now() - start);
    }
  } finally { await client.close(); await server.close(); }

  // Como HTTP operativo: un servidor nuevo para cada página, en un runtime caliente.
  // Excluye explícitamente red, validación del cliente y autenticación.
  const stateless: number[] = [];
  for (let run = 0; run < 10; run++) {
    const start = performance.now(), httpPages: ListToolsResult[] = [];
    let cursor: string | undefined;
    do {
      const pageServer = createProductIntelligenceServer(principal, async () => null);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await pageServer.connect(transport);
        const response = await transport.handleRequest(new Request("https://mcp.example.test/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: httpPages.length + 1, method: "tools/list", ...(cursor ? { params: { cursor } } : {}) }),
        }));
        const body = await response.json() as { result?: ListToolsResult };
        if (!response.ok || !body.result) throw new Error("El transporte no devolvió discovery.");
        httpPages.push(body.result);
        cursor = body.result.nextCursor;
      } finally { await pageServer.close(); }
    } while (cursor);
    stateless.push(performance.now() - start);
    if (!isDeepStrictEqual(httpPages, pages)) throw new Error("HTTP y memoria devolvieron contratos diferentes.");
  }
  console.log(JSON.stringify({
    rounds: { construction: construction.length, discovery: inMemory.length },
    cold_server_ms: construction[0], warm_server: metrics(construction.slice(1)),
    discovery_in_memory: metrics(inMemory), discovery_stateless_http: metrics(stateless),
    pages: pages.length, tools: pages.reduce((total, page) => total + page.tools.length, 0),
    contracts_sha256: hash(publishedSchemas()), discovery_sha256: hash(pages),
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
