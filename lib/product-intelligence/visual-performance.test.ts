import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createVisualUrlSigner, stateVisualSigner } from "./visual-url-signer";
import { createVisualExecutor, visualRecordView } from "./visual-service";
import { recordServerVisualEvent } from "./visual-transfer";
import { visualFixture } from "./visual-fixtures";
import { makeVisualRecord } from "./visual-domain";
import { PI_SCOPES } from "./policy";
import { parseToolInput } from "./validation";
import { ProductIntelligenceError } from "./errors";
import { VISUAL_LIMITS } from "./visual-schemas";

afterEach(() => vi.restoreAllMocks());
function storage() {
  const batch = vi.fn(async (bucket: string, paths: string[]) => ({ error: null, data: [...paths].reverse().map(path => ({ path, error: null, signedUrl: `https://files.test/${bucket}/${path}` })) }));
  const from = vi.fn((bucket: string) => ({ createSignedUrls: (paths: string[], ttl: number) => { expect(ttl).toBe(VISUAL_LIMITS.snapshotSeconds); return batch(bucket, paths); } }));
  return { db: { storage: { from } } as unknown as SupabaseClient, batch };
}
describe("Firma visual por lectura", () => {
  it("agrupa buckets, deduplica, mantiene asociaciones y renueva para otra petición", async () => {
    const { db, batch } = storage(), sign = createVisualUrlSigner(db);
    expect(await Promise.all([sign("page-media", "b"), sign("page-media", "a"), sign("page-media", "b"), sign("creative-media", "a")])).toEqual([
      "https://files.test/page-media/b", "https://files.test/page-media/a", "https://files.test/page-media/b", "https://files.test/creative-media/a",
    ]);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenNthCalledWith(1, "page-media", ["b", "a"]);
    await sign("page-media", "a"); expect(batch).toHaveBeenCalledTimes(2);
    await createVisualUrlSigner(db)("page-media", "a"); expect(batch).toHaveBeenCalledTimes(3);
  });
  it("un archivo ausente o respuesta parcial falla concretamente; los archivos válidos conservan su URL", async () => {
    const { db, batch } = storage();
    batch.mockResolvedValueOnce({ error: null, data: [{ path: "good", error: null, signedUrl: "https://files.test/good" }] });
    const sign = createVisualUrlSigner(db);
    const results = await Promise.allSettled([sign("page-media", "good"), sign("page-media", "missing"), sign("page-media", "missing")]);
    expect(results[0]).toEqual({ status: "fulfilled", value: "https://files.test/good" });
    for (const result of results.slice(1)) expect(result).toMatchObject({ status: "rejected", reason: new Error("No pudimos abrir la imagen. Intenta de nuevo.") });
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it("maneja error por objeto, error del bucket y excepciones sin URLs vacías", async () => {
    const batch = vi.fn()
      .mockResolvedValueOnce({ data: [{ path: "a", signedUrl: "", error: "Object not found" }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("down") })
      .mockRejectedValueOnce(new Error("network"));
    const db = { storage: { from: () => ({ createSignedUrls: batch }) } } as unknown as SupabaseClient;
    // Cada lectura debe manejar el mismo fallo por archivo.
    for (let i = 0; i < 3; i++) await expect(createVisualUrlSigner(db)("page-media", "a")).rejects.toThrow("No pudimos abrir la imagen.");
    expect(batch).toHaveBeenCalledTimes(3);
  });
  it("views reutilizan archivos y conservan su orden, reseñas y metadatos", async () => {
    const { db, batch } = storage(), { state } = visualFixture();
    const file = { id: randomUUID(), bucket: "page-media", storage_path: "owner/product/a", mime_type: "image/webp", width: 600, height: 600, size_bytes: 100, sha256: "a".repeat(64) };
    state.files = [file];
    state.records = [makeVisualRecord(state, "asset", { file_id: file.id }, "approved"), makeVisualRecord(state, "asset", { file_id: file.id }, "approved")];
    const review = makeVisualRecord(state, "review", { subject_id: state.records[0].id }, "approved"); state.records.push(review);
    stateVisualSigner(state, createVisualUrlSigner(db));
    const views = await Promise.all(state.records.slice(0, 2).map(r => visualRecordView(r, state)));
    expect(views.map(r => r.id)).toEqual(state.records.slice(0, 2).map(r => r.id));
    expect(views[0]).toMatchObject({ file: { ...file, url: "https://files.test/page-media/owner/product/a" }, reviews: [review] });
    expect(views[1].reviews).toEqual([]); expect(batch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state)).not.toContain("https://files.test/");
  });
});

describe("Diagnóstico con lifetime del runtime", () => {
  const id = randomUUID(), operation = randomUUID(), iteration = randomUUID();
  const owner = { userId: id, actorId: id, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const event = { attempt_id: randomUUID(), stage: "tool_execution" as const, state: "succeeded" as const, duration_ms: 7 };
  it("responde antes de persistir, drena el callback y conserva la autorización y el evento", async () => {
    const tasks: (() => Promise<void>)[] = [];
    let release!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    const repo = { loadVisual: vi.fn(), commitVisual: vi.fn(), visualOperation: vi.fn(),
      readVisualOperation: vi.fn(async () => ({ revision: 2, etag: "a".repeat(64), dependency_stamp: "b".repeat(64), operation: {
        id: operation, kind: "ingest", iteration_id: iteration, status: "pending", source: {}, expires_at: new Date().toISOString(), result: null, error_message: null,
      } })), visualTransfer: vi.fn(async () => { await blocked; }), deferVisualTelemetry: (task: () => Promise<void>) => { tasks.push(task); } };
    const result = await createVisualExecutor(repo)(owner, { tool: "get_visual_ingestion_status", input: parseToolInput("get_visual_ingestion_status", { product_id: id, operation_id: operation }) }, AbortSignal.timeout(1000));
    expect(result).toMatchObject({ ok: true, revision: 2, data: { state: "pending" } });
    expect(repo.readVisualOperation).toHaveBeenCalledTimes(1); expect(repo.loadVisual).not.toHaveBeenCalled(); expect(repo.visualOperation).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1); expect(repo.visualTransfer).not.toHaveBeenCalled();
    const draining = tasks[0]();
    expect(repo.visualTransfer).toHaveBeenCalledWith(expect.objectContaining({ p_access: expect.objectContaining({ user_id: id }), p_event: expect.objectContaining({ reported_by: "server", stage: "tool_execution", tool: "get_visual_ingestion_status" }) }), expect.any(AbortSignal));
    release(); await draining;
  });
  it("fallos de entrega quedan observables y no rechazan el callback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}), tasks: (() => Promise<void>)[] = [];
    const repo = { loadVisual: vi.fn(), commitVisual: vi.fn(), visualOperation: vi.fn(), visualTransfer: vi.fn(async () => { throw new ProductIntelligenceError("FORBIDDEN", "Revocado"); }), deferVisualTelemetry: (task: () => Promise<void>) => { tasks.push(task); } };
    await recordServerVisualEvent(repo, { user_id: id }, id, event);
    await expect(tasks[0]()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[visual-transfer/persistence]", expect.stringContaining('"persisted":false'));
  });
  it("fuera de after o si programarlo falla, espera a persistir sin promesas huérfanas", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    const repo = { loadVisual: vi.fn(), commitVisual: vi.fn(), visualOperation: vi.fn(), visualTransfer: vi.fn(() => blocked), deferVisualTelemetry: () => { throw new Error("No request"); } };
    let done = false;
    const pending = recordServerVisualEvent(repo, {}, id, event).then(() => { done = true; });
    await Promise.resolve(); expect(done).toBe(false); expect(repo.visualTransfer).toHaveBeenCalledTimes(1);
    release(); await pending; expect(done).toBe(true);
  });
});
