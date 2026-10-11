// Transporte MCP HTTP real en loopback; la lectura (5 ms) y telemetría (40 ms) son controladas.
// No mide Next/Vercel, OAuth ni red de producción. node --conditions=react-server --import tsx scripts/pi-telemetry-performance.ts
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createProductIntelligenceServer } from "../lib/product-intelligence/mcp";
import { createVisualExecutor } from "../lib/product-intelligence/visual-service";
import { PI_SCOPES } from "../lib/product-intelligence/policy";

const id = randomUUID(), operation = randomUUID(), iteration = randomUUID();
const principal = { userId: id, actorId: id, actorKind: "merchant" as const, scopes: PI_SCOPES };
const stats = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return { median_ms: s[Math.floor(s.length / 2)], p95_ms: s[Math.ceil(s.length * .95) - 1] }; };

async function measure(deferred: boolean) {
  const operationTimes: number[] = [], persistenceTimes: number[] = [], clientTimes: number[] = [], drains = new Set<Promise<void>>();
  let events = 0;
  const originalInfo = console.info;
  console.info = (tag, raw) => {
    const data = JSON.parse(raw);
    if (tag === "[visual-transfer]") operationTimes.push(data.duration_ms);
    if (tag === "[visual-transfer/persistence]") persistenceTimes.push(data.telemetry_ms);
  };
  const server = createServer(async (req, res) => {
    const callbacks: (() => Promise<void>)[] = [];
    const repo = { loadVisual: async () => null, commitVisual: async () => null, visualOperation: async () => null,
      readVisualOperation: async () => { await delay(5); return { revision: 1, etag: "a".repeat(64), dependency_stamp: "b".repeat(64), operation: {
        id: operation, kind: "ingest", iteration_id: iteration, status: "pending", source: {}, result: null, error_message: null, expires_at: new Date().toISOString(),
      } }; },
      visualTransfer: async () => { await delay(40); events++; },
      ...(deferred ? { deferVisualTelemetry: (task: () => Promise<void>) => { callbacks.push(task); } } : {}),
    };
    const mcp = createProductIntelligenceServer(principal, createVisualExecutor(repo), { availableTools: ["get_visual_ingestion_status"] });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      await mcp.connect(transport);
      const response = await transport.handleRequest(new Request("http://127.0.0.1/api/mcp", { method: "POST", headers: {
        "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      }, body: Buffer.concat(chunks) }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      const drain = Promise.all(callbacks.map(task => task())).then(() => {});
      drains.add(drain); void drain.finally(() => drains.delete(drain));
    } finally { await mcp.close(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    for (let i = 0; i < 26; i++) {
      const start = performance.now();
      const res = await fetch(`http://127.0.0.1:${port}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "get_visual_ingestion_status", arguments: { product_id: id, operation_id: operation } } }) });
      const body = await res.json();
      if (!res.ok || body.result?.structuredContent?.ok !== true) throw new Error("Respuesta MCP inválida.");
      if (i) clientTimes.push(performance.now() - start);
      await Promise.all(drains);
    }
    if (events !== 26) throw new Error("Faltan eventos de telemetría.");
    return { client_total: stats(clientTimes), operation: stats(operationTimes.slice(1)), telemetry: stats(persistenceTimes.slice(1)), events_delivered: events };
  } finally {
    await Promise.all(drains);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    console.info = originalInfo;
  }
}
async function main() { console.log(JSON.stringify({ scope: "HTTP MCP loopback, lectura y persistencia controladas; 25 rondas + warmup", before: await measure(false), after: await measure(true) }, null, 2)); }
main().catch(e => { console.error(e); process.exitCode = 1; });
