import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/integrations/shopify/client", () => ({ shopifyQuery: mocks.query, shopifyMutation: mocks.mutation }));
vi.mock("@/lib/integrations/admin", () => ({ adminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }), upsert: mocks.save }) }) }));

import { assertLandingVariantTheme, getThemeUpdateStatus, updateTheme, type ThemeInstallation } from "./theme";
import { readKit, type RemoteFile } from "./kit";
import RELEASES from "./kit-releases.json";
import { UNKNOWN_THEME_CODE } from "./kit-compatibility";

const kit = readKit();
const conn = { user_id: "merchant", shop_domain: "fixture.myshopify.com" } as ShopifyConnection;
const inst: ThemeInstallation = { user_id: conn.user_id, shop_domain: conn.shop_domain, theme_gid: "gid://shopify/OnlineStoreTheme/1", theme_name: "DropFlex original", kit_version: kit.version, status: "published", error_message: null, published_at: "2026-10-12", updated_at: "2026-10-12" };
const snippet = kit.files.find(f => f.path === "snippets/df-rich-pdp-image.liquid")!;
const oldHash = RELEASES.codeChecksums[snippet.path as keyof typeof RELEASES.codeChecksums].find(hash => hash !== snippet.md5)!;
let merchantTemplate: string;
let remote: RemoteFile[];

beforeEach(() => {
  vi.clearAllMocks();
  inst.kit_version = kit.version;
  merchantTemplate = JSON.stringify({ sections: { main: { type: "custom-product", settings: { merchant: "keep" } } }, order: ["main"] });
  remote = kit.files.map(f => ({ path: f.path, md5: f.path === "templates/product.json" ? createHash("md5").update(merchantTemplate).digest("hex") : f.md5 }));
  mocks.read.mockImplementation(async () => ({ data: { ...inst }, error: null }));
  mocks.save.mockResolvedValue({ error: null });
  mocks.mutation.mockResolvedValue({ themeFilesUpsert: { userErrors: [] } });
  mocks.query.mockImplementation(async (_conn, query: string, variables: { names?: string[] }) => {
    if (query.includes("query Themes")) return { themes: { nodes: [{ id: inst.theme_gid, role: "MAIN" }] } };
    if (query.includes("query ThemeFiles")) return { theme: { files: { nodes: remote.map(f => ({ filename: f.path, checksumMd5: f.md5 })), pageInfo: { hasNextPage: false } } } };
    const path = variables.names![0];
    return { theme: { files: { nodes: [{ body: { content: path === "templates/product.json" ? merchantTemplate : kit.files.find(f => f.path === path)!.data.toString() } }] } } };
  });
});
const setHash = (hash: string | null) => { remote.find(f => f.path === snippet.path)!.md5 = hash; };

describe("comprobación y escritura del tema comparten el plan", () => {
  it("no anuncia actualización por una fila antigua si Shopify ya tiene los archivos actuales", async () => {
    inst.kit_version = "9bc9a38332";
    expect(await getThemeUpdateStatus(conn, inst, kit)).toEqual({ outdated: false, updateError: undefined });
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("una fila antigua tampoco bloquea publicar variantes si el tema real cumple el contrato", async () => {
    inst.kit_version = "9bc9a38332";
    await expect(assertLandingVariantTheme(conn)).resolves.toBeUndefined();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("detecta un archivo antiguo incluso si la fila declara el kit actual", async () => {
    setHash(oldHash);
    expect(await getThemeUpdateStatus(conn, inst, kit)).toEqual({ outdated: true, updateError: undefined });
  });
  it("detecta una transición de plantilla aunque el código y la versión ya coincidan", async () => {
    merchantTemplate = JSON.stringify({ sections: { main: { type: "product-information", blocks: {}, settings: { merchant: "keep" } } }, order: ["main"] });
    remote.find(f => f.path === "templates/product.json")!.md5 = createHash("md5").update(merchantTemplate).digest("hex");
    expect((await getThemeUpdateStatus(conn, inst, kit)).outdated).toBe(true);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("actualiza el orden anterior de reseñas de una plantilla personalizada sin reemplazar sus ajustes", async () => {
    const data = JSON.parse(kit.files.find(f => f.path === "templates/product.json")!.data.toString());
    const details = data.sections.main.blocks["product-details"];
    details.blocks.merchant_note = { type: "text", settings: { text: "Texto del comerciante" } };
    details.blocks.review_slider.settings.anchor_id = "mis-resenas";
    details.block_order = ["merchant_note", "review_slider", "ugc_slider", "social_proof", "details_accordion"];
    merchantTemplate = JSON.stringify(data);
    remote.find(f => f.path === "templates/product.json")!.md5 = createHash("md5").update(merchantTemplate).digest("hex");
    expect((await getThemeUpdateStatus(conn, inst, kit)).outdated).toBe(true);
    expect(await updateTheme(conn, kit)).toMatchObject({ upserted: 1 });
    const file = mocks.mutation.mock.calls.flatMap(call => call[2].files ?? []).find(file => file.filename === "templates/product.json");
    const applied = JSON.parse(file.body.value).sections.main.blocks["product-details"];
    expect(applied.block_order).toEqual(["merchant_note", "social_proof", "review_slider", "ugc_slider", "details_accordion"]);
    expect(applied.blocks).toEqual(details.blocks);
  });
  it("no aplica transiciones de plantilla ni cambia la versión de un kit futuro con el mismo código", async () => {
    inst.kit_version = "future-version";
    await expect(updateTheme(conn, kit)).resolves.toEqual({ upserted: 0, restored: 0, removed: 0 });
    expect(mocks.save).not.toHaveBeenCalled();
    merchantTemplate = JSON.stringify({ sections: { main: { type: "product-information", blocks: {} } }, order: ["main"] });
    expect(await getThemeUpdateStatus(conn, inst, kit)).toEqual({ outdated: false, updateError: UNKNOWN_THEME_CODE });
    await expect(updateTheme(conn, kit)).rejects.toThrow(UNKNOWN_THEME_CODE);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("aplica solo la diferencia comprobada y conserva el template del comerciante", async () => {
    inst.kit_version = "9bc9a38332";
    setHash(oldHash);
    expect(await updateTheme(conn, kit)).toMatchObject({ upserted: 1, restored: 0, removed: 0 });
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0][2].files).toEqual([{ filename: snippet.path, body: { type: "TEXT", value: snippet.data.toString() } }]);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ kit_version: kit.version }), expect.anything());
  });
  it.each(["future-version", kit.version])("rechaza código futuro antes de cualquier escritura con versión %s", async version => {
    inst.kit_version = version;
    setHash("future-code");
    expect(await getThemeUpdateStatus(conn, inst, kit)).toEqual({ outdated: false, updateError: UNKNOWN_THEME_CODE });
    await expect(updateTheme(conn, kit)).rejects.toThrow(UNKNOWN_THEME_CODE);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("vuelve a comprobar Shopify cuando se pulsa un botón calculado con una lectura anterior", async () => {
    setHash(oldHash);
    expect((await getThemeUpdateStatus(conn, inst, kit)).outdated).toBe(true);
    setHash("future-code");
    await expect(updateTheme(conn, kit)).rejects.toThrow(UNKNOWN_THEME_CODE);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("no elimina un componente más nuevo que este servidor", async () => {
    remote.push({ path: "snippets/df-future.liquid", md5: "future-code" });
    await expect(updateTheme(conn, kit)).rejects.toThrow(UNKNOWN_THEME_CODE);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("una consulta fallida no permite actualizar ni guarda una versión no aplicada", async () => {
    mocks.query.mockRejectedValue(new Error("Shopify unavailable"));
    await expect(updateTheme(conn, kit)).rejects.toThrow("Shopify unavailable");
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
