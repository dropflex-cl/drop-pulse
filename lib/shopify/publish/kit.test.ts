import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EASYSELL_EMBED, isProtected, KIT_DIR, mergeAppEmbeds, parseThemeJson, planUpdate, readKit, withEasySellOn } from "./kit";

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
      restore: ["templates/index.json", "config/settings_data.json"],
      remove: ["blocks/df-viejo.liquid"],
      unchanged: 1,
      skippedProtected: 1,
    });
  });
});

describe("templates sin editar", () => {
  it("un template igual a una versión anterior del kit se actualiza; uno editado, no", () => {
    const local = [{ path: "templates/product.json", md5: "nuevo" }];
    const history = { "templates/product.json": ["v1", "v2"] };
    expect(planUpdate(local, [{ path: "templates/product.json", md5: "v1" }], history).upsert).toEqual(["templates/product.json"]);
    expect(planUpdate(local, [{ path: "templates/product.json", md5: "editado" }], history)).toMatchObject({ upsert: [], skippedProtected: 1 });
    expect(planUpdate(local, [{ path: "templates/product.json", md5: "nuevo" }], history)).toMatchObject({ upsert: [], unchanged: 1 });
  });

  it("el historial conoce las versiones publicadas del template de la ficha", async () => {
    const { kitHistory } = await import("./kit");
    expect(kitHistory["templates/product.json"]?.length).toBeGreaterThan(0);
  });
});

describe("app embeds", () => {
  it("copia los de apps del tema publicado sin pisar los del kit", () => {
    const kit = JSON.stringify({ current: { df_landing_mode: true, blocks: { mine: { type: "shopify://apps/x/blocks/y/1", disabled: false } } } });
    const live = `/* comentario del editor */ ${JSON.stringify({ current: { blocks: { cod: { type: "shopify://apps/easysell/blocks/form/abc", disabled: false }, mine: { type: "shopify://apps/x/blocks/y/1", disabled: true }, other: { type: "text" } } } })}`;
    const merged = parseThemeJson(mergeAppEmbeds(kit, live));
    expect(Object.keys(merged.current.blocks).sort()).toEqual([EASYSELL_EMBED.id, "cod", "mine"].sort());
    expect(merged.current.blocks.mine.disabled).toBe(false);
    expect(merged.current.df_landing_mode).toBe(true);
    expect(parseThemeJson(mergeAppEmbeds(kit, "no es json")).current.blocks[EASYSELL_EMBED.id]).toMatchObject({ type: EASYSELL_EMBED.type, disabled: false });
  });

  it("EasySell queda siempre encendido: reusa el del tema, lo enciende y no lo duplica", () => {
    const easysell = (disabled: boolean) => ({ type: "shopify://apps/easysell-cod-form/blocks/app-embed/otro", disabled, settings: { a: 1 } });
    const on = (s: string | null) => Object.values(parseThemeJson(s!).current.blocks as Record<string, { type: string; disabled?: boolean }>).filter((b) => b.type.startsWith("shopify://apps/easysell-cod-form/"));

    const off = JSON.stringify({ current: { blocks: { live: easysell(true), loox: { type: "shopify://apps/loox/blocks/x/1" } } } });
    const fixed = withEasySellOn(off);
    expect(on(fixed)).toEqual([{ ...easysell(false) }]);
    expect(Object.keys(parseThemeJson(fixed!).current.blocks)).toEqual(["live", "loox"]);

    expect(on(withEasySellOn(JSON.stringify({ current: {} })))).toEqual([{ type: EASYSELL_EMBED.type, disabled: false, settings: {} }]);
    expect(withEasySellOn(JSON.stringify({ current: { blocks: { live: easysell(false) } } }))).toBeNull();
    expect(withEasySellOn("no es json")).toBeNull();

    // El kit trae el suyo y el tema publicado otro: queda uno, el del tema publicado, encendido.
    const kit = readFileSync(join(KIT_DIR, "config/settings_data.json"), "utf8");
    expect(on(mergeAppEmbeds(kit, off))).toEqual([{ ...easysell(false) }]);
  });

  it("el settings_data del kit trae EasySell encendido", () => {
    const kit = parseThemeJson(readFileSync(join(KIT_DIR, "config/settings_data.json"), "utf8"));
    expect(kit.current.blocks[EASYSELL_EMBED.id]).toEqual({ type: EASYSELL_EMBED.type, disabled: false, settings: {} });
    expect(withEasySellOn(JSON.stringify(kit))).toBeNull();
  });
});
