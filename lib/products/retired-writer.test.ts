import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductApiError } from "./http";

const state = vi.hoisted(() => ({ owned: true, signedIn: true, admin: false, qa: false }));
const providers = vi.hoisted(() => ({ anthropic: vi.fn(async () => null), admin: vi.fn(() => { throw new Error("No debe escribir ni gastar"); }) }));
vi.mock("@/lib/integrations/session", () => ({ requireUser: async () => {
  if (!state.signedIn) throw new ProductApiError("Inicia sesión.", 401);
  return { id: "owner", admin: state.admin };
} }));
vi.mock("@/lib/integrations/admin", () => ({ adminClient: providers.admin }));
vi.mock("@/lib/products/store", async (original) => ({ ...await original<typeof import("./store")>(),
  getProductRow: async () => state.owned ? { id: "product", user_id: "owner" } : null,
  imageQaEnabled: async () => state.qa,
}));
vi.mock("@/lib/data/products", () => ({ strategyState: vi.fn(), copyState: vi.fn(), creativesState: vi.fn(), pageImagesState: vi.fn(), videosState: vi.fn() }));
vi.mock("@/lib/integrations/anthropic/connection", () => ({ getAnthropicConnection: providers.anthropic, NO_ANTHROPIC_KEY: "Conecta Anthropic para revisar imágenes." }));
vi.mock("@/lib/integrations/image-provider", () => ({ imageProviderChoice: async () => ({ value: "gemini", options: [] }), noProviderReason: vi.fn() }));
vi.mock("@/lib/creatives/store", async (original) => ({ ...await original<typeof import("@/lib/creatives/store")>(), getConceptRow: async () => null }));
vi.mock("@/lib/page-images/store", async (original) => ({ ...await original<typeof import("@/lib/page-images/store")>(), getShotRow: async () => null }));

const routes = [
  ["strategy", () => import("@/app/api/products/[id]/strategy/route")],
  ["strategy/confirm", () => import("@/app/api/products/[id]/strategy/confirm/route")],
  ["copy", () => import("@/app/api/products/[id]/copy/route")],
  ["creatives", () => import("@/app/api/products/[id]/creatives/route")],
  ["creatives/chat", () => import("@/app/api/products/[id]/creatives/chat/route")],
  ["page-images", () => import("@/app/api/products/[id]/page-images/route")],
  ["product-data", () => import("@/app/api/products/[id]/product-data/route")],
  ["whatsapp/tip", () => import("@/app/api/products/[id]/whatsapp/tip/route")],
  ["pack-labels", () => import("@/app/api/products/[id]/pack-labels/route")],
  ["videos", () => import("@/app/api/products/[id]/videos/route")],
] as const;
const request = () => new Request("https://app.test/api/products/product/copy", { method: "POST", body: "invalid-json" });
const params = () => ({ params: Promise.resolve({ id: "product" }) });

beforeEach(() => { state.owned = true; state.signedIn = true; state.admin = false; state.qa = false; vi.clearAllMocks(); });

describe("writers retirados · contratos HTTP", () => {
  it.each(routes)("%s devuelve 410 sin leer body, crear trabajos ni llamar proveedores", async (_name, load) => {
    const response = await (await load()).POST(request(), params());
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(providers.admin).not.toHaveBeenCalled();
    expect(providers.anthropic).not.toHaveBeenCalled();
  });
  it.each(routes)("%s conserva 401 para clientes sin sesión", async (_name, load) => {
    state.signedIn = false;
    expect((await (await load()).POST(request(), params())).status).toBe(401);
    expect(providers.admin).not.toHaveBeenCalled();
  });
  it.each(routes)("%s oculta productos de otro tenant con 404", async (_name, load) => {
    state.owned = false;
    expect((await (await load()).POST(request(), params())).status).toBe(404);
    expect(providers.admin).not.toHaveBeenCalled();
  });
});

describe("lectura y revisión conservadas", () => {
  it("mantiene GET de estrategia, landing, creativos, galería y UGC", async () => {
    for (const index of [0, 2, 3, 5, 9]) expect(((await routes[index][1]()) as { GET?: unknown }).GET).toBeTypeOf("function");
  });
  it("mantiene edición manual de los datos del producto y decisión de etiquetas", async () => {
    expect((await import("@/app/api/products/[id]/product-data/route")).PUT).toBeTypeOf("function");
    const labels = await import("@/app/api/products/[id]/pack-labels/route");
    expect(labels.PUT).toBeTypeOf("function");
    expect(labels.PATCH).toBeTypeOf("function");
  });
});

describe("prompts antiguos · editor y activación retirados", () => {
  it("devuelve 410 al administrador sin escribir ni activar prompts", async () => {
    state.admin = true;
    const editor = await import("@/app/api/settings/prompts/[key]/route");
    const activation = await import("@/app/api/settings/prompts/[key]/activate/route");
    expect((await editor.PUT()).status).toBe(410);
    expect((await activation.POST()).status).toBe(410);
    expect(providers.admin).not.toHaveBeenCalled();
  });
  it("conserva 403 para comerciantes y 401 sin sesión", async () => {
    const editor = await import("@/app/api/settings/prompts/[key]/route");
    const activation = await import("@/app/api/settings/prompts/[key]/activate/route");
    expect((await editor.PUT()).status).toBe(403);
    expect((await activation.POST()).status).toBe(403);
    state.signedIn = false;
    expect((await editor.PUT()).status).toBe(401);
    expect((await activation.POST()).status).toBe(401);
    expect(providers.admin).not.toHaveBeenCalled();
  });
});

describe("render conservado · Anthropic solo si el QA está encendido", () => {
  it("estáticos y tomas llegan a su validación propia sin clave de Anthropic", async () => {
    const { startRender } = await import("@/lib/pipeline/creatives");
    const { startShotRender } = await import("@/lib/pipeline/page-images");
    await expect(startRender("owner", "product", "missing", "1:1")).rejects.toThrow("Ese concepto ya no está vigente");
    await expect(startShotRender("owner", "product", "missing")).rejects.toThrow("Esa toma ya no está vigente");
    expect(providers.anthropic).not.toHaveBeenCalled();
    expect(providers.admin).not.toHaveBeenCalled();
  });
  it("con QA activo, exige la clave antes de crear o cobrar imágenes", async () => {
    state.qa = true;
    const { startRender } = await import("@/lib/pipeline/creatives");
    const { startShotRender, startFillEmpty } = await import("@/lib/pipeline/page-images");
    for (const start of [() => startRender("owner", "product", "missing", "1:1"), () => startShotRender("owner", "product", "missing"), () => startFillEmpty("owner", "product")]) {
      await expect(start()).rejects.toThrow("Conecta Anthropic");
    }
    expect(providers.anthropic).toHaveBeenCalledTimes(3);
    expect(providers.admin).not.toHaveBeenCalled();
  });
});
