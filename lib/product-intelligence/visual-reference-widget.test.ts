import { referenceWidgetScript } from "./visual-reference-widget-script";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { visualReferenceResource, VISUAL_REFERENCE_UI } from "./visual-reference-widget";

function mount(bytes: Buffer, options: { hash?: string; capable?: boolean; state?: unknown; expired?: boolean; callTool?: boolean; followup?: boolean } = {}) {
  const elements = Object.fromEntries(["#reference", "#attach", "#status", "#download"].map(id => [id, { disabled: true, hidden: true, textContent: "", onclick: undefined as undefined | (() => Promise<void>) }]));
  const listeners: Record<string, (event: unknown) => void> = {};
  const uploadFile = vi.fn(async (file: File) => { expect(file.size).toBeGreaterThan(0); return { fileId: "real-host-file-id" }; });
  const setWidgetState = vi.fn();
  const sendFollowUpMessage = vi.fn(async (_input: { prompt: string }) => { expect(_input.prompt).toBeTruthy(); });
  const canonical = { id: "00000000-0000-4000-8000-000000000001", url: "https://storage.example.test/old.webp", content_hash: options.hash ?? createHash("sha256").update(bytes).digest("hex"), mime_type: "image/webp",
    expires_at: new Date(Date.now() + (options.expired ? -1000 : 900000)).toISOString() };
  const output = { ok: true, product_id: "00000000-0000-4000-8000-000000000002", data: { canonical_reference: canonical } };
  const renewed = { ...output, data: { canonical_reference: { ...canonical, url: "https://storage.example.test/renewed.webp", expires_at: new Date(Date.now() + 900001).toISOString() } } };
  const callTool = vi.fn(async (name: string, args: unknown) => { expect(args).toBeTruthy(); return { structuredContent: name === "get_visual_reference_image" ? renewed : { ok: true, data: { recorded: true } } }; });
  const parent = { postMessage: vi.fn((message: { method: string; id?: number }) => {
    if (message.method === "ui/initialize") listeners.message({ source: parent, data: { jsonrpc: "2.0", id: message.id, result: {} } });
    else if (message.method === "tools/call") listeners.message({ source: parent, data: { jsonrpc: "2.0", id: message.id, result: { structuredContent: renewed } } });
  }) };
  const window = { parent, openai: { toolOutput: output, widgetState: options.state,
    ...(options.capable !== false ? { uploadFile, setWidgetState } : {}), ...(options.followup !== false ? { sendFollowUpMessage } : {}), ...(options.callTool !== false ? { callTool } : {}) },
    addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } };
  const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array(bytes)]) }));
  runInNewContext(referenceWidgetScript, { window, document: { querySelector: (id: string) => elements[id], documentElement: { dataset: {} } }, fetch: fetcher, crypto: webcrypto, File, AbortSignal, setTimeout, clearTimeout });
  return { elements, uploadFile, setWidgetState, sendFollowUpMessage, callTool, fetcher, listeners, parent, output, renewed, window };
}

describe("Referencia original · transferencia y continuación", () => {
  it("requiere un toque; renueva el enlace, verifica bytes y continúa con un ID real", async () => {
    const bytes = Buffer.from("original image bytes"), app = mount(bytes, { expired: true });
    expect(app.uploadFile).not.toHaveBeenCalled(); expect(app.sendFollowUpMessage).not.toHaveBeenCalled();
    await app.elements["#attach"].onclick!();
    expect(app.callTool).toHaveBeenCalledWith("get_visual_reference_image", expect.objectContaining({ reference_image_id: app.output.data.canonical_reference.id }));
    expect(app.fetcher).toHaveBeenCalledWith(app.renewed.data.canonical_reference.url, expect.anything());
    expect(app.uploadFile).toHaveBeenCalledTimes(1);
    expect(Buffer.from(await app.uploadFile.mock.calls[0][0].arrayBuffer())).toEqual(bytes);
    expect(app.setWidgetState).toHaveBeenCalledWith(expect.objectContaining({ imageIds: ["real-host-file-id"], modelContent: expect.objectContaining({ reference_stage: "host_uploaded", reference_attached: true }) }));
    expect(app.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("real-host-file-id");
    expect(app.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("Si pidió no generar");
    expect(app.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("entrada real del generador");
    expect(app.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("ingest_chatgpt_visual_asset");
    const events = app.callTool.mock.calls.filter(([name]) => name === "record_visual_transfer_event").map(([, input]) => (input as { event: unknown }).event);
    expect(JSON.stringify(events)).not.toContain("https:"); expect(JSON.stringify(events)).not.toContain("real-host-file-id");
    expect(events).toContainEqual(expect.objectContaining({ stage: "host_upload", state: "succeeded" }));
  });
  it("reintenta el mensaje sin duplicar la subida y conserva el estado al remontar", async () => {
    const app = mount(Buffer.from("original"));
    app.setWidgetState.mockImplementation(state => { app.window.openai.widgetState = state; app.listeners["openai:set_globals"]({}); });
    app.sendFollowUpMessage.mockRejectedValueOnce(new Error("host unavailable"));
    await app.elements["#attach"].onclick!();
    expect(app.elements["#status"].textContent).toContain("El archivo está subido");
    await app.elements["#attach"].onclick!();
    expect(app.uploadFile).toHaveBeenCalledTimes(1); expect(app.sendFollowUpMessage).toHaveBeenCalledTimes(2);
    expect(app.callTool.mock.calls.filter(([name]) => name === "get_visual_reference_image")).toHaveLength(1);
    const restored = mount(Buffer.from("original"), { state: app.setWidgetState.mock.calls[0][0] });
    await restored.elements["#attach"].onclick!();
    expect(restored.uploadFile).not.toHaveBeenCalled(); expect(restored.sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(restored.callTool.mock.calls.filter(([name]) => name === "get_visual_reference_image")).toHaveLength(0);
  });
  it("no repite el mensaje, consulta ni subida tras continuar, recibir globals o remontar", async () => {
    const bytes = Buffer.from("original"), app = mount(bytes);
    app.setWidgetState.mockImplementation(state => { app.window.openai.widgetState = state; app.listeners["openai:set_globals"]({}); });
    await app.elements["#attach"].onclick!();
    app.listeners["openai:set_globals"]({});
    expect(app.elements["#attach"].disabled).toBe(true);
    expect(app.elements["#status"].textContent).toContain("ya se compartió");
    await app.elements["#attach"].onclick!();
    expect(app.sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(app.callTool.mock.calls.filter(([name]) => name === "get_visual_reference_image")).toHaveLength(1);
    const state = app.window.openai.widgetState;
    const restored = mount(bytes, { state, expired: true });
    expect(restored.elements["#attach"].disabled).toBe(true);
    await restored.elements["#attach"].onclick!();
    expect(restored.sendFollowUpMessage).not.toHaveBeenCalled(); expect(restored.uploadFile).not.toHaveBeenCalled();
    const changed = mount(Buffer.from("new reference"), { state });
    expect(changed.elements["#attach"].disabled).toBe(false);
    await changed.elements["#attach"].onclick!();
    expect(changed.sendFollowUpMessage).toHaveBeenCalledTimes(1); expect(changed.uploadFile).toHaveBeenCalledTimes(1);
  });
  it("continúa con el archivo ya subido aunque venza la URL y fallen las consultas de referencia", async () => {
    const bytes = Buffer.from("original"), app = mount(bytes);
    app.sendFollowUpMessage.mockRejectedValueOnce(new Error("rejected"));
    await app.elements["#attach"].onclick!();
    const restored = mount(bytes, { state: app.setWidgetState.mock.calls[0][0], expired: true });
    restored.callTool.mockRejectedValue(new Error("reference unavailable"));
    await restored.elements["#attach"].onclick!();
    expect(restored.fetcher).not.toHaveBeenCalled(); expect(restored.uploadFile).not.toHaveBeenCalled();
    expect(restored.callTool.mock.calls.filter(([name]) => name === "get_visual_reference_image")).toHaveLength(0);
    expect(restored.sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(restored.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("no vuelvas a llamar get_visual_reference_image");
    expect(restored.sendFollowUpMessage.mock.calls[0][0].prompt).toContain("una sola vez; no repitas la tarjeta");
  });
  it("persiste el envío pendiente e impide duplicarlo si el host no confirma a tiempo", async () => {
    vi.useFakeTimers();
    try {
      const bytes = Buffer.from("original"), app = mount(bytes);
      app.sendFollowUpMessage.mockImplementation(() => new Promise(() => {}));
      const click = app.elements["#attach"].onclick!();
      await vi.waitFor(() => expect(app.sendFollowUpMessage).toHaveBeenCalledTimes(1));
      const state = app.setWidgetState.mock.calls.at(-1)![0];
      const restored = mount(bytes, { state });
      await restored.elements["#attach"].onclick!(); expect(restored.sendFollowUpMessage).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(30000); await click;
      expect(app.setWidgetState.mock.calls.at(-1)![0].modelContent.reference_stage).toBe("followup_unknown");
      expect(app.elements["#attach"].disabled).toBe(true);
      await app.elements["#attach"].onclick!(); expect(app.sendFollowUpMessage).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("no reutiliza un adjunto de otra referencia y conserva el formato anterior del estado", async () => {
    const app = mount(Buffer.from("original")); await app.elements["#attach"].onclick!();
    const state = structuredClone(app.setWidgetState.mock.calls[0][0]) as { modelContent: { reference_file_id?: string } }; delete state.modelContent.reference_file_id;
    const restored = mount(Buffer.from("original"), { state }); await restored.elements["#attach"].onclick!();
    expect(restored.uploadFile).not.toHaveBeenCalled();
    const other = mount(Buffer.from("other original"), { state }); await other.elements["#attach"].onclick!();
    expect(other.uploadFile).toHaveBeenCalledTimes(1);
  });
  it("bloquea hash distinto, referencia reemplazada y renovación rechazada", async () => {
    const app = mount(Buffer.from("changed"), { hash: "a".repeat(64) });
    await app.elements["#attach"].onclick!(); expect(app.uploadFile).not.toHaveBeenCalled(); expect(app.sendFollowUpMessage).not.toHaveBeenCalled();
    expect(app.elements["#status"].textContent).toContain("referencia cambió");
    const changed = mount(Buffer.from("original")); changed.renewed.data.canonical_reference.id = "00000000-0000-4000-8000-000000000003";
    await changed.elements["#attach"].onclick!(); expect(changed.uploadFile).not.toHaveBeenCalled();
    const rejected = mount(Buffer.from("original")); rejected.callTool.mockImplementation(async name => ({ structuredContent: name === "get_visual_reference_image" ? { ok: false, error: { code: "FORBIDDEN" } } : { ok: true } }) as never);
    await rejected.elements["#attach"].onclick!(); expect(rejected.uploadFile).not.toHaveBeenCalled();
    expect(rejected.elements["#status"].textContent).toContain("renovar");
  });
  it("ignora los globals de telemetría sin borrar el contexto ni el adjunto", async () => {
    const app = mount(Buffer.from("original"));
    const original = app.callTool.getMockImplementation()!;
    app.callTool.mockImplementation(async (name, args) => {
      const result = await original(name, args);
      app.window.openai.toolOutput = result.structuredContent as typeof app.output;
      app.listeners["openai:set_globals"]({});
      return result;
    });
    await app.elements["#attach"].onclick!();
    expect(app.uploadFile).toHaveBeenCalledTimes(1); expect(app.sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(app.elements["#reference"].hidden).toBe(false);
  });
  it("detiene la continuación si otra referencia llega mientras sube el archivo", async () => {
    const app = mount(Buffer.from("original"));
    app.uploadFile.mockImplementation(async () => {
      app.window.openai.toolOutput = { ...app.output, product_id: "00000000-0000-4000-8000-000000000009" };
      app.listeners["openai:set_globals"]({});
      return { fileId: "real-host-file-id" };
    });
    await app.elements["#attach"].onclick!();
    expect(app.setWidgetState).not.toHaveBeenCalled(); expect(app.sendFollowUpMessage).not.toHaveBeenCalled();
    expect(app.elements["#status"].textContent).toContain("referencia cambió");
  });
  it("tolera fallos de diagnóstico y permite mensaje manual sin API de followup", async () => {
    const app = mount(Buffer.from("original"), { followup: false });
    const original = app.callTool.getMockImplementation()!;
    app.callTool.mockImplementation((name, args) => name === "record_visual_transfer_event" ? Promise.reject(new Error("diagnostics down")) : original(name, args));
    await app.elements["#attach"].onclick!(); expect(app.uploadFile).toHaveBeenCalledTimes(1);
    expect(app.elements["#status"].textContent).toContain("Envía en el chat");
  });
  it("renueva a través del puente MCP Apps si no existe callTool de OpenAI", async () => {
    const app = mount(Buffer.from("original"), { callTool: false, expired: true }); await Promise.resolve();
    await app.elements["#attach"].onclick!(); expect(app.uploadFile).toHaveBeenCalledTimes(1);
    expect(app.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: "tools/call" }), "*");
  });
  it("desactiva el adjunto sin APIs e ignora resultados de otro frame", () => {
    const app = mount(Buffer.from("original"), { capable: false }); expect(app.elements["#attach"].disabled).toBe(true);
    app.listeners.message({ source: {}, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ok: false } } } });
    expect(app.elements["#status"].textContent).toContain("adjúntala al chat");
  });
  it("sirve HTML con una acción principal y CSP restringida", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test");
    try {
      const resource = visualReferenceResource(); expect(resource.uri).toBe(VISUAL_REFERENCE_UI);
      expect(resource._meta.ui.csp.connectDomains).toEqual(["https://cdn.shopify.com", "https://storage.example.test"]);
      expect(resource.text).not.toContain("service_role"); expect(resource.text).toContain('role="status"');
    } finally { vi.unstubAllEnvs(); }
  });
});
