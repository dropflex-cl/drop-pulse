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
  ["copy", () => import("@/app/api/products/[id]/copy/route")],
  ["creatives", () => import("@/app/api/products/[id]/creatives/route")],
  ["page-images", () => import("@/app/api/products/[id]/page-images/route")],
  ["product-data", () => import("@/app/api/products/[id]/product-data/route")],
  ["whatsapp/tip", () => import("@/app/api/products/[id]/whatsapp/tip/route")],
  ["pack-labels", () => import("@/app/api/products/[id]/pack-labels/route")],
  ["videos", () => import("@/app/api/products/[id]/videos/route")],
] as const;
beforeEach(() => { state.owned = true; state.signedIn = true; state.admin = false; state.qa = false; vi.clearAllMocks(); });
describe("rutas de contenido vigentes", () => {
  it.each(routes)("%s ya no exporta el writer POST retirado", async (_name, load) => {
    expect(await load()).not.toHaveProperty("POST");
  });
  it("conserva lectura, edición y decisiones humanas", async () => {
    for (const i of [0, 1, 2, 6]) expect((await routes[i][1]() as { GET?: unknown }).GET).toBeTypeOf("function");
    expect((await import("@/app/api/products/[id]/product-data/route")).PUT).toBeTypeOf("function");
    expect((await import("@/app/api/products/[id]/pack-labels/route")).PATCH).toBeTypeOf("function");
    expect((await import("@/app/api/products/[id]/whatsapp/tip/route")).PUT).toBeTypeOf("function");
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
