// Solo fixtures locales. --optimized compara las nuevas proyecciones con las RPC conservadas.
// node --conditions=react-server --import tsx scripts/pi-read-performance.ts [--optimized]
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { CATALOG } from "../lib/shopify/components/catalog";
import { PI_SCOPES } from "../lib/product-intelligence/policy";
import { createContextRepository } from "../lib/product-intelligence/repository";
import { createProductIntelligenceExecutor } from "../lib/product-intelligence/knowledge-service";
import { parseToolInput } from "../lib/product-intelligence/validation";
import { requestFixture } from "../lib/product-intelligence/test-fixtures";

const local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
if (local.API_URL !== "http://127.0.0.1:55321") throw new Error("Solo Supabase local de DropFlex.");
const optimized = process.argv.includes("--optimized");
let queries = 0, storage = 0, transferred = 0;
const db = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: {
  fetch: async (input, init) => {
    const url = String(input);
    if (url.includes("/rest/")) queries++;
    if (url.includes("/storage/")) storage++;
    const res = await fetch(input, init);
    if (!res.body) return res;
    // Cuenta durante la única lectura del SDK; no clona ni vuelve a descargar el cuerpo.
    const body = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { transferred += chunk.byteLength; controller.enqueue(chunk); },
    }));
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  },
} });
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * .95) - 1] };
};
async function checked<T extends { error: unknown }>(op: PromiseLike<T>) {
  const r = await op; if (r.error) throw new Error(JSON.stringify(r.error)); return r;
}
function snapshotTotals(product: string): { count: number; json_bytes: number; stored_bytes: number } {
  if (!/^[a-f0-9-]{36}$/.test(product)) throw new Error("Fixture inválido.");
  return JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8", input: `select jsonb_build_object('count',count(*),'json_bytes',coalesce(sum(octet_length(snapshot::text)),0),
      'stored_bytes',coalesce(sum(pg_column_size(snapshot)),0)) from public.pi_visual_read_snapshots where product_id='${product}';`,
  }));
}
async function measure(run: () => Promise<unknown>, product: string) {
  const snapshotsBefore = snapshotTotals(product);
  queries = storage = transferred = 0;
  const latency: number[] = [], transform: number[] = [], materialized: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now(), value = await run();
    const conversion = performance.now();
    latency.push(conversion - start);
    materialized.push(bytes(value)); JSON.parse(JSON.stringify(value));
    transform.push(performance.now() - conversion);
  }
  const counts = { queries: queries / 25, storage_calls: storage / 25, transferred_bytes: transferred / 25 };
  // Agrega en SQL. Leer 50 snapshots de varios MB distorsionaría el benchmark y la red local.
  const snapshots = snapshotTotals(product);
  return { ...stats(latency), transform: stats(transform), ...counts, materialized_bytes: materialized[0],
    snapshots_written: (snapshots.count - snapshotsBefore.count) / 25,
    snapshot_bytes_written: (snapshots.json_bytes - snapshotsBefore.json_bytes) / 25,
    snapshot_stored_bytes_written: (snapshots.stored_bytes - snapshotsBefore.stored_bytes) / 25 };
}

async function main() {
  const user = (await checked(db.auth.admin.createUser({ email: `pi-perf-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }))).data.user!;
  const access = { user_id: user.id, actor_id: user.id, actor_kind: "merchant", scopes: PI_SCOPES };
  const principal = { userId: user.id, actorId: user.id, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const execute = createProductIntelligenceExecutor(createContextRepository(db));
  const paths: string[] = [], results: Record<string, unknown> = {};
  try {
    await checked(db.from("merchant_settings").insert({ user_id: user.id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString() }));
    const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).webp().toBuffer();
    for (const [fixture, images, versions] of [["empty", 0, 0], ["complete", 3, 3], ["many_images", 80, 3], ["wide_history", 3, 500], ["changed", 3, 30]] as const) {
      const product = randomUUID(), iteration = randomUUID(), operation = randomUUID();
      await checked(db.from("products").insert({ id: product, user_id: user.id, title: `Fixture ${fixture}`, shopify_product_id: product, currency: "CLP" }));
      await checked(db.from("pi_visual_records").insert({ id: iteration, product_id: product, user_id: user.id, kind: "iteration", version: 1, etag: hash(fixture), status: "prepared", payload: { fixture } }));
      await checked(db.from("pi_visual_operations").insert({ id: operation, iteration_id: iteration, product_id: product, user_id: user.id, kind: "ingest", access, source: {}, status: "pending" }));
      if (versions) {
        await execute(principal, { tool: "save_product_context", input: parseToolInput("save_product_context", {
          product_id: product, schema_version: "1.0", context: { display_name: "Organizador", description: "Organizador de compartimentos" }, pricing: { mode: "recommended", unit_cost_minor: 4000 },
        }) }, AbortSignal.timeout(10000));
        await execute(principal, { tool: "save_research", input: parseToolInput("save_research", {
          ...requestFixture("propose-research").payload as object, product_id: product, expected_revision: 1, idempotency_key: randomUUID(),
        }) }, AbortSignal.timeout(10000));
        await checked(db.from("pi_visual_versions").insert(Array.from({ length: versions }, (_, i) => ({ record_id: iteration, product_id: product, user_id: user.id,
          version: i + 1, actor_id: user.id, record: { id: iteration, kind: "iteration", version: i + 1, payload: { instruction: "Detalle de auditoría local. ".repeat(300) } } }))));
        const run = randomUUID();
        await checked(db.from("copy_runs").insert({ id: run, product_id: product, user_id: user.id, status: "succeeded" }));
        await checked(db.from("page_components").insert([
          { product_id: product, user_id: user.id, run_id: run, component: "listing", position: 0, content: null, images: [], enabled: true, status: "approved", proposal: {
            title: "Organizador para tu escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
            offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa.",
          } },
          ...CATALOG.map((c, i) => ({ product_id: product, user_id: user.id, run_id: run, component: c.id, position: i + 1,
            proposal: c.examples[0] ?? { state: "empty" }, content: null, images: [], enabled: true, status: "approved" })),
        ]));
      }
      if (images) {
        const rows = [];
        for (let i = 0; i < images; i++) {
          const path = `${user.id}/${product}/reference-${i}.webp`; paths.push(path);
          await checked(db.storage.from("product-references").upload(path, png, { contentType: "image/webp" }));
          rows.push({ product_id: product, user_id: user.id, source: "upload", storage_path: path, mime_type: "image/webp", position: i, is_base: i === 0 });
        }
        await checked(db.from("product_reference_images").insert(rows));
      }
      if (fixture === "changed") await checked(db.from("page_components").update({ content: { state: "empty" }, enabled: false }).eq("product_id", product).eq("component", "pain-block"));
      const args = { p_access: access, p_product_id: product };
      const legacy = (await checked(db.rpc("pi_load_visual", args))).data;
      const landing = (await checked(db.rpc("pi_load_landing", args))).data;
      if (optimized) {
        const projected = (await checked(db.rpc("pi_read_visual_operation", { ...args, p_operation_id: operation }))).data;
        if (["revision", "etag", "dependency_stamp"].some(k => projected[k] !== legacy[k])) throw new Error("Tokens visuales distintos.");
        const projectedLanding = (await checked(db.rpc("pi_read_landing_component", { ...args, p_component: "pain-block" }))).data;
        if (projectedLanding.landing_etag !== landing.landing_etag || hash(projectedLanding.image_catalog) !== hash(landing.image_catalog)) throw new Error("Landing distinta.");
      }
      results[fixture] = {
        visual_current: await measure(async () => (await checked(db.rpc(optimized ? "pi_read_visual" : "pi_load_visual", args))).data, product),
        ingestion_status: await measure(async () => optimized
          ? (await checked(db.rpc("pi_read_visual_operation", { ...args, p_operation_id: operation }))).data
          : { ...(await checked(db.rpc("pi_load_visual", args))).data, operation: (await checked(db.rpc("pi_visual_operation", { ...args, p_operation_id: operation }))).data }, product),
        landing_component: await measure(async () => optimized
          ? (await checked(db.rpc("pi_read_landing_component", { ...args, p_component: "pain-block" }))).data
          : (await checked(db.rpc("pi_load_landing", args))).data, product),
        landing_listing: await measure(async () => {
          if (optimized) return (await checked(db.rpc("pi_read_landing_component", { ...args, p_component: "listing" }))).data;
          const read = (await checked(db.rpc("pi_load_landing", args))).data;
          const accent = (await checked(db.from("products").select("page_accent_color").eq("user_id", user.id).eq("id", product).maybeSingle())).data;
          return { ...read, page_accent_color: accent?.page_accent_color };
        }, product),
        ...(images ? { signing: await measure(async () => {
          const selected = paths.filter(p => p.startsWith(`${user.id}/${product}/`));
          return optimized ? (await checked(db.storage.from("product-references").createSignedUrls(selected, 900))).data
            : await Promise.all(selected.map(async p => (await checked(db.storage.from("product-references").createSignedUrl(p, 900))).data));
        }, product) } : {}),
      };
    }
    console.log(JSON.stringify({ mode: optimized ? "optimized" : "legacy", runtime: process.version, rounds: 25, scope: "local RPC + HTTP + JSON, sin proveedores; signing Storage local; helpers SQL compartidos en ambos modos", results }, null, 2));
  } finally {
    if (paths.length) await checked(db.storage.from("product-references").remove(paths));
    await checked(db.auth.admin.deleteUser(user.id));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
