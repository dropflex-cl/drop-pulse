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

describe("Disponibilidad y decisiones del contenido guardado desde MCP", () => {
  it.each(["rejected", "archived"])("guardar una edición conserva el descarte %s", status => {
    const { state, asset } = fixture();
    const discarded = { ...asset, status, payload: { ...asset.payload, archived_at: "2026-10-11T00:00:00Z" } };
    const edited = approveMcpVisual({ ...asset, version: asset.version + 1 }, discarded);
    expect(edited).toMatchObject({ status, payload: { archived_at: discarded.payload.archived_at } });
    expect(recordValidity(edited, state).state).toBe("blocked");
  });
  it("conserva el contenido elegido cuando cambian las políticas", () => {
    const { state, asset } = fixture();
    expect(recordValidity(asset, state).state).toBe("current");
    state.live["policy:current"].blocked = true;
    expect(recordValidity(asset, state).state).toBe("current");
    delete state.live["policy:current"];
    expect(recordValidity(asset, state).state).toBe("current");
  });
  it("permite usar una imagen guardada sin importar su origen", () => {
    const { state, asset } = fixture();
    delete asset.payload.approval_source;
    expect(recordValidity(asset, state).state).toBe("current");
  });
  it("selecciona al guardar sin duplicar la versión y desplaza el uso anterior", () => {
    const { state, binding } = fixture();
    const old = selectMcpBindings(state, [binding()])[0]; state.records.push(old);
    const next = binding(), changes = selectMcpBindings(state, [next]);
    expect(changes.find(r => r.id === old.id)).toMatchObject({ status: "proposed", version: 2 });
    expect(changes.find(r => r.id === next.id)).toMatchObject({ status: "selected", version: 1, payload: { selected: true } });
  });
  it.each(["file", "ratio", "target", "rejected"])("la aprobación automática no salta el control %s", problem => {
    const { state, asset, binding } = fixture();
    const candidate = binding();
    if (problem === "file") state.files = [];
    if (problem === "ratio") state.files[0].height = 1200;
    if (problem === "target") state.targets = [];
    if (problem === "rejected") asset.status = "rejected";
    expect(() => selectMcpBindings(state, [candidate])).toThrow();
  });
});
