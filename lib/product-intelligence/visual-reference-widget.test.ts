import { referenceWidgetScript } from "./visual-reference-widget-script";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { visualReferenceResource, VISUAL_REFERENCE_UI } from "./visual-reference-widget";

function mount(bytes: Buffer, options: { hash?: string; capable?: boolean; state?: unknown } = {}) {
  const elements = Object.fromEntries(["#reference", "#attach", "#review", "#status", "#download"].map(id => [id, { disabled: true, hidden: true, textContent: "", onclick: undefined as undefined | (() => Promise<void>) }]));
  const listeners: Record<string, (event: unknown) => void> = {};
  const uploadFile = vi.fn(async (file: File) => { expect(file.size).toBeGreaterThan(0); return { fileId: "real-host-file-id" }; });
  const setWidgetState = vi.fn();
  const sendFollowUpMessage = vi.fn(async (_input: { prompt: string }) => { expect(_input.prompt).toBeTruthy(); });
  const canonical = { id: "original", url: "https://storage.example.test/original.webp", content_hash: options.hash ?? createHash("sha256").update(bytes).digest("hex"), mime_type: "image/webp" };
  const output = { ok: true, product_id: "product", data: { canonical_reference: canonical } };
  const parent = { postMessage: vi.fn() };
  const window = { parent, openai: { toolOutput: output, widgetState: options.state, ...(options.capable !== false ? { uploadFile, setWidgetState, sendFollowUpMessage } : {}) }, addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } };
  const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array(bytes)]) }));
  runInNewContext(referenceWidgetScript, { window, document: { querySelector: (id: string) => elements[id], documentElement: { dataset: {} } }, fetch: fetcher, crypto: webcrypto, File, AbortSignal });
  return { elements, uploadFile, setWidgetState, sendFollowUpMessage, fetcher, listeners, parent, output, window };
}

describe("Referencia original · archivo nativo del host", () => {
  it("requiere un toque, verifica los bytes originales y publica solo el ID recibido del host", async () => {
    const bytes = Buffer.from("original image bytes");
    const app = mount(bytes);
    expect(app.uploadFile).not.toHaveBeenCalled();
    await app.elements["#attach"].onclick!();
    expect(app.uploadFile).toHaveBeenCalledTimes(1);
    expect(Buffer.from(await app.uploadFile.mock.calls[0][0].arrayBuffer())).toEqual(bytes);
    expect(app.setWidgetState).toHaveBeenCalledWith(expect.objectContaining({ imageIds: ["real-host-file-id"], modelContent: expect.objectContaining({ reference_attached: true, reference_content_hash: createHash("sha256").update(bytes).digest("hex") }) }));
    expect(app.parent.postMessage.mock.calls.some(([message]) => message.method === "ui/message")).toBe(false);
    expect(app.sendFollowUpMessage).not.toHaveBeenCalled();
  });
  it("conserva el adjunto después de globals y remontaje, y pide inspección solo al tocar Revisar", async () => {
    const app = mount(Buffer.from("original"));
    app.setWidgetState.mockImplementation(state => { app.window.openai.widgetState = state; app.listeners["openai:set_globals"]({}); });
    await app.elements["#attach"].onclick!();
    expect(app.elements["#review"].disabled).toBe(false);
    const state = app.setWidgetState.mock.calls[0][0];
    app.listeners["openai:set_globals"]({});
    expect(app.elements["#status"].textContent).toContain("Archivo adjunto");
    const restored = mount(Buffer.from("original"), { state });
    expect(restored.elements["#attach"].textContent).toBe("Volver a adjuntar referencia");
    expect(restored.uploadFile).not.toHaveBeenCalled();
    expect(restored.sendFollowUpMessage).not.toHaveBeenCalled();
    await restored.elements["#review"].onclick!();
    expect(restored.setWidgetState).toHaveBeenCalledWith(state);
    expect(restored.sendFollowUpMessage).toHaveBeenCalledWith({ prompt: expect.stringContaining("real-host-file-id") });
    expect(restored.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("No generes imágenes todavía");
  });
  it("no recupera un adjunto de otra referencia", async () => {
    const app = mount(Buffer.from("original"));
    await app.elements["#attach"].onclick!();
    const restored = mount(Buffer.from("other original"), { state: app.setWidgetState.mock.calls[0][0] });
    expect(restored.elements["#review"].hidden).toBe(true);
    await restored.elements["#review"].onclick!();
    expect(restored.sendFollowUpMessage).not.toHaveBeenCalled();
  });
  it("restaura el imageId legítimo guardado por la tarjeta anterior", async () => {
    const app = mount(Buffer.from("original"));
    await app.elements["#attach"].onclick!();
    const state = structuredClone(app.setWidgetState.mock.calls[0][0]) as { modelContent: { reference_file_id?: string } };
    delete state.modelContent.reference_file_id;
    const restored = mount(Buffer.from("original"), { state });
    expect(restored.elements["#review"].hidden).toBe(false);
    await restored.elements["#review"].onclick!();
    expect(restored.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("real-host-file-id");
  });
  it("impide adjuntar si el enlace devuelve otro archivo; no publica IDs ni genera", async () => {
    const app = mount(Buffer.from("changed"), { hash: "a".repeat(64) });
    await app.elements["#attach"].onclick!();
    expect(app.uploadFile).not.toHaveBeenCalled();
    expect(app.setWidgetState).not.toHaveBeenCalled();
    expect(app.elements["#status"].textContent).toContain("referencia cambió");
  });
  it("desactiva el adjunto sin APIs de archivo e ignora resultados de otro frame", () => {
    const app = mount(Buffer.from("original"), { capable: false });
    expect(app.elements["#attach"].disabled).toBe(true);
    expect(app.elements["#status"].textContent).toContain("adjúntala al chat");
    app.listeners.message({ source: {}, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ok: false } } } });
    expect(app.elements["#reference"]).toMatchObject({ src: app.output.data.canonical_reference.url });
  });
  it("un resultado fallido desactiva la referencia anterior", async () => {
    const app = mount(Buffer.from("original"));
    app.listeners.message({ source: app.parent, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ok: false } } } });
    await app.elements["#attach"].onclick!();
    expect(app.uploadFile).not.toHaveBeenCalled();
    expect(app.elements["#attach"].disabled).toBe(true);
  });
  it("sirve HTML estático sin datos privados y limita CSP a orígenes conocidos", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test");
    try {
      const resource = visualReferenceResource();
      expect(resource.uri).toBe(VISUAL_REFERENCE_UI);
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      expect(resource._meta.ui.csp.connectDomains).toEqual(["https://cdn.shopify.com", "https://storage.example.test"]);
      expect(resource.text).not.toContain("service_role");
      expect(resource.text).toContain('role="status"');
    } finally { vi.unstubAllEnvs(); }
  });
});
