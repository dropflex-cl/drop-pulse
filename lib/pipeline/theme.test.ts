import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), installation: vi.fn(), check: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./publish", () => ({ connectionProblem: (conn: { status: string } | null) => conn?.status === "connected" ? null : "Conecta Shopify" }));
vi.mock("@/lib/integrations/shopify/connection", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("@/lib/shopify/publish/kit", () => ({ readKit: () => ({ version: "current" }) }));
vi.mock("@/lib/shopify/publish/theme", () => ({ getThemeInstallation: mocks.installation, getThemeUpdateStatus: mocks.check, previewUrl: () => "https://fixture.myshopify.com/?preview_theme_id=1", syncThemeState: vi.fn() }));
import { themeView } from "./theme";

let user = 0;
const inst = { shop_domain: "fixture.myshopify.com", theme_gid: "1", theme_name: "Original", kit_version: "old", status: "published", updated_at: "before" };
beforeEach(() => {
  vi.clearAllMocks();
  user++;
  inst.kit_version = "old";
  inst.updated_at = "before";
  mocks.connection.mockResolvedValue({ user_id: String(user), status: "connected", shop_domain: inst.shop_domain });
  mocks.installation.mockImplementation(async () => ({ ...inst }));
  mocks.check.mockReset().mockResolvedValue({ outdated: false });
});

describe("estado de actualización en Publicación", () => {
  it("usa la comprobación real, no la desigualdad de huellas guardadas", async () => {
    expect(await themeView(String(user))).toMatchObject({ status: "published", outdated: false });
    expect(mocks.check).toHaveBeenCalledOnce();
  });
  it("comparte lecturas durante el sondeo e invalida cuando se guarda una actualización", async () => {
    mocks.check.mockResolvedValue({ outdated: true });
    await Promise.all([themeView(String(user)), themeView(String(user))]);
    expect(mocks.check).toHaveBeenCalledOnce();
    inst.kit_version = "current";
    inst.updated_at = "after";
    mocks.check.mockResolvedValue({ outdated: false });
    expect((await themeView(String(user))).outdated).toBe(false);
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });
  it("una consulta fallida no se convierte en una supuesta actualización y se puede reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.check.mockRejectedValueOnce(new Error("Shopify unavailable"));
    expect(await themeView(String(user))).toMatchObject({ outdated: false, updateError: expect.stringContaining("No pudimos consultar") });
    expect((await themeView(String(user))).outdated).toBe(false);
    expect(mocks.check).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
  it("muestra el motivo de código desconocido sin ofrecer actualizar", async () => {
    mocks.check.mockResolvedValue({ outdated: false, updateError: "La tienda usa código desconocido" });
    expect(await themeView(String(user))).toMatchObject({ outdated: false, updateError: "La tienda usa código desconocido" });
  });
  it("no consulta archivos de una tienda distinta de la conexión vigente", async () => {
    mocks.connection.mockResolvedValue({ user_id: String(user), status: "connected", shop_domain: "other.myshopify.com" });
    expect(await themeView(String(user))).toEqual({ status: "none", outdated: false });
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
