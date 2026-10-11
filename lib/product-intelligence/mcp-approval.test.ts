import { describe, expect, it } from "vitest";
import { approveMcpVisual, selectMcpBindings } from "./mcp-approval";
import { makeVisualRecord, prepareBindings, recordValidity, targetKey, vHash } from "./visual-domain";
import { visualFixture } from "./visual-fixtures";

function fixture() {
  const { state, hash } = visualFixture();
  const asset = approveMcpVisual(makeVisualRecord(state, "asset", { file_id: "file", dependencies: [{ kind: "policy", key: "current", content_hash: hash, usage: "overlay" }] }, "generated"));
  state.records.push(asset);
  state.files.push({ id: "file", bucket: "page-media", storage_path: "file.webp", width: 600, height: 600, mime_type: "image/webp", size_bytes: 100, sha256: hash });
  const target = { type: "gallery_shot" as const, shot_key: "hero", slot: "cover", position: null };
  const etag = vHash(target), key = targetKey(target);
  state.targets.push({ key, etag, value: target });
  state.live[`content_variant:${key}`] = { hash: etag, value: target, blocked: false };
  const binding = () => prepareBindings(state, asset.id, [{ target, target_etag: etag }])[0];
  return { state, asset, binding };
}

describe("Aprobación de contenido guardado desde MCP", () => {
  it("conserva la aprobación al cambiar las políticas y bloquea una revocación", () => {
    const { state, asset } = fixture();
    expect(recordValidity(asset, state).state).toBe("current");
    state.live["policy:current"].blocked = true;
    expect(recordValidity(asset, state).state).toBe("blocked");
    delete state.live["policy:current"];
    expect(recordValidity(asset, state).state).toBe("blocked");
  });
  it("mantiene la revisión de imágenes que no vienen del MCP", () => {
    const { state, asset } = fixture();
    delete asset.payload.approval_source;
    expect(recordValidity(asset, state).state).toBe("needs_review");
  });
  it("selecciona al guardar sin duplicar la versión y desplaza el uso anterior", () => {
    const { state, binding } = fixture();
    const old = selectMcpBindings(state, [binding()])[0]; state.records.push(old);
    const next = binding(), changes = selectMcpBindings(state, [next]);
    expect(changes.find(r => r.id === old.id)).toMatchObject({ status: "proposed", version: 2 });
    expect(changes.find(r => r.id === next.id)).toMatchObject({ status: "selected", version: 1, payload: { approval_source: "mcp" } });
  });
  it.each(["file", "ratio", "target", "rejected"])("la aprobación automática no salta el control %s", problem => {
    const { state, asset, binding } = fixture();
    const candidate = binding();
    if (problem === "file") state.files = [];
    if (problem === "ratio") state.files[0].height = 1200;
    if (problem === "target") state.targets[0].etag = vHash("changed");
    if (problem === "rejected") asset.status = "rejected";
    expect(() => selectMcpBindings(state, [candidate])).toThrow();
  });
});
