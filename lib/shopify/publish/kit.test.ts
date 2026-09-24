import { describe, expect, it } from "vitest";
import { isProtected, planUpdate, readKit } from "./kit";

describe("kit del tema", () => {
  it("lee el tema del repo con los archivos que Shopify exige", () => {
    const kit = readKit();
    const paths = kit.files.map((f) => f.path);
    for (const p of ["layout/theme.liquid", "templates/index.json", "templates/product.json", "config/settings_schema.json", "assets/df-components.css"]) {
      expect(paths).toContain(p);
    }
    expect(paths.every((p) => !p.includes("\\\\") && !p.startsWith("/"))).toBe(true);
    // assets/ sin subcarpetas: Shopify rechaza el tema entero.
    expect(paths.filter((p) => p.startsWith("assets/") && p.split("/").length > 2)).toEqual([]);
    expect(kit.version).toMatch(/^[0-9a-f]{10}$/);
  });

  it("sabe qué es del comerciante", () => {
    expect(isProtected("templates/product.json")).toBe(true);
    expect(isProtected("sections/header-group.json")).toBe(true);
    expect(isProtected("config/settings_data.json")).toBe(true);
    expect(isProtected("config/settings_schema.json")).toBe(false);
    expect(isProtected("sections/header.liquid")).toBe(false);
  });

  it("actualiza solo el código que cambió y nunca pisa lo del comerciante", () => {
    const local = [
      { path: "sections/header.liquid", md5: "a" },
      { path: "snippets/df-icon.liquid", md5: "b" },
      { path: "templates/product.json", md5: "c" },
      { path: "templates/index.json", md5: "d" },
      { path: "config/settings_data.json", md5: "e" },
    ];
    const remote = [
      { path: "sections/header.liquid", md5: "a" },
      { path: "snippets/df-icon.liquid", md5: "viejo" },
      { path: "templates/product.json", md5: "editado" },
      { path: "blocks/df-viejo.liquid", md5: "x" },
      { path: "blocks/de-otra-app.liquid", md5: "y" },
    ];
    expect(planUpdate(local, remote)).toEqual({
      upsert: ["snippets/df-icon.liquid"],
      restore: ["templates/index.json"],
      remove: ["blocks/df-viejo.liquid"],
      unchanged: 1,
      skippedProtected: 2,
    });
  });
});

describe("app embeds", () => {
  it("copia los de apps del tema publicado sin pisar los del kit", async () => {
    const { mergeAppEmbeds, parseThemeJson } = await import("./kit");
    const kit = JSON.stringify({ current: { df_landing_mode: true, blocks: { mine: { type: "shopify://apps/x/blocks/y/1", disabled: false } } } });
    const live = `/* comentario del editor */ ${JSON.stringify({ current: { blocks: { cod: { type: "shopify://apps/easysell/blocks/form/abc", disabled: false }, mine: { type: "shopify://apps/x/blocks/y/1", disabled: true }, other: { type: "text" } } } })}`;
    const merged = parseThemeJson(mergeAppEmbeds(kit, live));
    expect(Object.keys(merged.current.blocks).sort()).toEqual(["cod", "mine"]);
    expect(merged.current.blocks.mine.disabled).toBe(false);
    expect(merged.current.df_landing_mode).toBe(true);
    expect(mergeAppEmbeds(kit, "no es json")).toBe(kit);
    expect(mergeAppEmbeds(kit, null)).toBe(kit);
  });
});
