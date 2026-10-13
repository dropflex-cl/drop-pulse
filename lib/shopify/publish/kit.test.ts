import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EASYSELL_EMBED,
  isProtected,
  KIT_DIR,
  mergeAppEmbeds,
  parseThemeJson,
  planUpdate,
  readKit,
  withEasySellOn,
  withPdpIntro,
  withPdpPurchaseHierarchy,
  withPdpReviewOrder,
} from "./kit";

describe("kit del tema", () => {
  it("migra la jerarquía anterior conservando ajustes, bloques ajenos y apagados, una sola vez", () => {
    const kit = readFileSync(join(KIT_DIR, "templates/product.json"), "utf8");
    const remote = JSON.parse(kit);
    const details = remote.sections.main.blocks["product-details"];
    details.block_order = ["google_rating", "review_stars", "stars_row", "title", "subtitle", "gallery_benefits", "pack_offers", "divider", "price", "inventory", "benefit_usps", "buy_buttons", "payment_icons", "shipping_timeline", "social_proof", "review_slider"];
    details.blocks.stars_row.blocks.social_badge.settings.views = "200k+";
    details.blocks.gallery_benefits.disabled = true;
    details.blocks.custom = { type: "text", settings: { text: "Nota propia" } };
    details.block_order.push("custom");
    const before = structuredClone(details.blocks);
    const result = JSON.parse(withPdpPurchaseHierarchy(JSON.stringify(remote))!);
    const next = result.sections.main.blocks["product-details"];
    expect(next.blocks).toEqual(before);
    expect(next.block_order.slice(0, 13)).toEqual(["google_rating", "review_stars", "title", "price", "subtitle", "pack_offers", "benefit_usps", "buy_buttons", "inventory", "payment_icons", "divider", "gallery_benefits", "stars_row"]);
    expect(next.block_order.at(-1)).toBe("custom");
    expect(withPdpPurchaseHierarchy(JSON.stringify(result))).toBeNull();
    details.block_order.reverse();
    expect(withPdpPurchaseHierarchy(JSON.stringify(remote))).toBeNull();
    details.block_order.reverse();
    details.block_order = details.block_order.filter((id: string) => id !== "gallery_benefits");
    delete details.blocks.gallery_benefits;
    expect(withPdpPurchaseHierarchy(JSON.stringify(remote))).toBeNull();
  });
  it("lee el tema del repo con los archivos que Shopify exige", () => {
    const kit = readKit();
    const paths = kit.files.map((f) => f.path);
    for (const p of [
      "layout/theme.liquid",
      "templates/index.json",
      "templates/product.json",
      "config/settings_schema.json",
      "assets/df-components.css",
    ]) {
      expect(paths).toContain(p);
    }
    expect(paths.every((p) => !p.includes("\\\\") && !p.startsWith("/"))).toBe(
      true,
    );
    // assets/ sin subcarpetas: Shopify rechaza el tema entero.
    expect(
      paths.filter((p) => p.startsWith("assets/") && p.split("/").length > 2),
    ).toEqual([]);
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
    expect(
      planUpdate(
        local,
        [{ path: "templates/product.json", md5: "v1" }],
        history,
      ).upsert,
    ).toEqual(["templates/product.json"]);
    expect(
      planUpdate(
        local,
        [{ path: "templates/product.json", md5: "editado" }],
        history,
      ),
    ).toMatchObject({ upsert: [], skippedProtected: 1 });
    expect(
      planUpdate(
        local,
        [{ path: "templates/product.json", md5: "nuevo" }],
        history,
      ),
    ).toMatchObject({ upsert: [], unchanged: 1 });
  });

  it("el historial conoce las versiones publicadas del template de la ficha", async () => {
    const { kitHistory } = await import("./kit");
    expect(kitHistory["templates/product.json"]?.length).toBeGreaterThan(0);
  });
});

describe("app embeds", () => {
  it("copia los de apps del tema publicado sin pisar los del kit", () => {
    const kit = JSON.stringify({
      current: {
        df_landing_mode: true,
        blocks: {
          mine: { type: "shopify://apps/x/blocks/y/1", disabled: false },
        },
      },
    });
    const live = `/* comentario del editor */ ${JSON.stringify({ current: { blocks: { cod: { type: "shopify://apps/easysell/blocks/form/abc", disabled: false }, mine: { type: "shopify://apps/x/blocks/y/1", disabled: true }, other: { type: "text" } } } })}`;
    const merged = parseThemeJson(mergeAppEmbeds(kit, live));
    expect(Object.keys(merged.current.blocks).sort()).toEqual(
      [EASYSELL_EMBED.id, "cod", "mine"].sort(),
    );
    expect(merged.current.blocks.mine.disabled).toBe(false);
    expect(merged.current.df_landing_mode).toBe(true);
    expect(
      parseThemeJson(mergeAppEmbeds(kit, "no es json")).current.blocks[
        EASYSELL_EMBED.id
      ],
    ).toMatchObject({ type: EASYSELL_EMBED.type, disabled: false });
  });

  it("EasySell queda siempre encendido: reusa el del tema, lo enciende y no lo duplica", () => {
    const easysell = (disabled: boolean) => ({
      type: "shopify://apps/easysell-cod-form/blocks/app-embed/otro",
      disabled,
      settings: { a: 1 },
    });
    const on = (s: string | null) =>
      Object.values(
        parseThemeJson(s!).current.blocks as Record<
          string,
          { type: string; disabled?: boolean }
        >,
      ).filter((b) => b.type.startsWith("shopify://apps/easysell-cod-form/"));

    const off = JSON.stringify({
      current: {
        blocks: {
          live: easysell(true),
          loox: { type: "shopify://apps/loox/blocks/x/1" },
        },
      },
    });
    const fixed = withEasySellOn(off);
    expect(on(fixed)).toEqual([{ ...easysell(false) }]);
    expect(Object.keys(parseThemeJson(fixed!).current.blocks)).toEqual([
      "live",
      "loox",
    ]);

    expect(on(withEasySellOn(JSON.stringify({ current: {} })))).toEqual([
      { type: EASYSELL_EMBED.type, disabled: false, settings: {} },
    ]);
    expect(
      withEasySellOn(
        JSON.stringify({ current: { blocks: { live: easysell(false) } } }),
      ),
    ).toBeNull();
    expect(withEasySellOn("no es json")).toBeNull();

    // El kit trae el suyo y el tema publicado otro: queda uno, el del tema publicado, encendido.
    const kit = readFileSync(
      join(KIT_DIR, "config/settings_data.json"),
      "utf8",
    );
    expect(on(mergeAppEmbeds(kit, off))).toEqual([{ ...easysell(false) }]);
  });

  it("el settings_data del kit trae EasySell encendido", () => {
    const kit = parseThemeJson(
      readFileSync(join(KIT_DIR, "config/settings_data.json"), "utf8"),
    );
    expect(kit.current.blocks[EASYSELL_EMBED.id]).toEqual({
      type: EASYSELL_EMBED.type,
      disabled: false,
      settings: {},
    });
    expect(withEasySellOn(JSON.stringify(kit))).toBeNull();
  });
});

describe("actualizar una PDP personalizada", () => {
  const kit = readFileSync(join(KIT_DIR, "templates/product.json"), "utf8");
  it.each([true, false])("pone opiniones antes del slider conservando ajustes y bloques (UGC: %s)", videos => {
    const remote = JSON.parse(kit);
    const details = remote.sections.main.blocks["product-details"];
    details.blocks.merchant_note = { type: "text", settings: { text: "Mi nota" } };
    details.blocks.social_proof.disabled = true;
    details.blocks.review_slider.settings.anchor_id = "mis-resenas";
    details.block_order = ["merchant_note", "review_slider", ...(videos ? ["ugc_slider"] : []), "social_proof", "details_accordion"];
    const result = JSON.parse(withPdpReviewOrder(JSON.stringify(remote))!);
    const next = result.sections.main.blocks["product-details"];
    expect(next.block_order).toEqual(["merchant_note", "social_proof", "review_slider", ...(videos ? ["ugc_slider"] : []), "details_accordion"]);
    expect(next.blocks).toEqual(details.blocks);
    expect(result.order).toEqual(remote.order);
    expect(withPdpReviewOrder(JSON.stringify(result))).toBeNull();
  });
  it("conserva órdenes personalizados, ausencias y JSON inválido", () => {
    expect(withPdpReviewOrder(kit)).toBeNull();
    expect(withPdpReviewOrder("{")).toBeNull();
    const remote = JSON.parse(kit);
    const details = remote.sections.main.blocks["product-details"];
    details.blocks.merchant_note = { type: "text", settings: { text: "Mi nota" } };
    for (const order of [["review_slider", "merchant_note", "social_proof"], ["review_slider"], ["social_proof"]]) {
      details.block_order = order;
      expect(withPdpReviewOrder(JSON.stringify(remote))).toBeNull();
    }
  });
  function legacyIntro() {
    const remote = JSON.parse(kit);
    const details = remote.sections.main.blocks["product-details"];
    const blocks = details.blocks;
    delete blocks.google_rating;
    delete blocks.gallery_benefits;
    const badges = blocks.stars_row;
    delete badges.blocks.event_badges;
    badges.blocks.review_stars = {
      ...blocks.review_stars,
      disabled: true,
      settings: {
        star_size: 20,
        text_size: 14,
        margin_top: 8,
        margin_bottom: -8,
        anchor: "opiniones",
      },
    };
    badges.block_order = ["review_stars", "hype_badge"];
    blocks.social_badge = badges.blocks.social_badge;
    delete badges.blocks.social_badge;
    delete blocks.review_stars;
    blocks.merchant_note = {
      type: "text",
      settings: { text: "Texto del comerciante" },
    };
    blocks.pack_offers.settings.heading = "Mis packs";
    blocks.buy_buttons.settings.show_dynamic_checkout = false;
    details.settings.gap = 32;
    details.block_order = [
      "social_proof",
      "stars_row",
      "title",
      "subtitle",
      "divider",
      "price",
      "social_badge",
      "benefit_usps",
      "pack_offers",
      "merchant_note",
      "buy_buttons",
      "ugc_slider",
      "details_accordion",
    ];
    return remote;
  }
  it("migra la ficha anterior con Google y beneficios sin reemplazar ajustes o bloques del comerciante", () => {
    const remote = legacyIntro();
    const before = remote.sections.main.blocks["product-details"];
    const result = JSON.parse(
      withPdpIntro(
        `/* Guardado por Shopify */\n${JSON.stringify(remote)}`,
        kit,
      )!,
    );
    const details = result.sections.main.blocks["product-details"];
    expect(
      details.block_order
        .slice(0, 7)
        .map((id: string) => details.blocks[id].type),
    ).toEqual([
      "df-google-rating",
      "df-review-stars",
      "group",
      "df-title",
      "df-subtitle",
      "df-gallery-benefits",
      "df-pack-offers",
    ]);
    expect(details.blocks.review_stars.disabled).toBe(true);
    expect(details.blocks.review_stars.settings).toMatchObject({
      compact: true,
      star_size: 16,
      text_size: 12,
      margin_top: 0,
      margin_bottom: 0,
      anchor: "opiniones",
    });
    for (const id of [
      "merchant_note",
      "pack_offers",
      "buy_buttons",
      "title",
      "subtitle",
      "social_proof",
    ])
      expect(details.blocks[id]).toEqual(before.blocks[id]);
    expect(details.settings).toEqual(before.settings);
    expect(
      details.blocks.stars_row.block_order.map(
        (id: string) => details.blocks.stars_row.blocks[id].type,
      ),
    ).toEqual(["df-event-badges", "df-hype-badge", "df-social-badge"]);
    expect(details.block_order.indexOf("social_proof")).toBe(
      details.block_order.indexOf("ugc_slider") + 1,
    );
    expect(result.order).toEqual(remote.order);
    expect(withPdpIntro(JSON.stringify(result), kit)).toBeNull();
  });
  it("no recupera un bloque descartado ni reordena una ficha ya migrada", () => {
    const remote = JSON.parse(kit);
    const details = remote.sections.main.blocks["product-details"];
    delete details.blocks.gallery_benefits;
    details.block_order = details.block_order
      .filter((id: string) => id !== "gallery_benefits")
      .reverse();
    expect(withPdpIntro(JSON.stringify(remote), kit)).toBeNull();
  });
  it("conserva reseñas apagadas desde su grupo y no recupera prueba social fuera del orden", () => {
    const remote = legacyIntro();
    const before = remote.sections.main.blocks["product-details"];
    before.blocks.stars_row.disabled = true;
    delete before.blocks.stars_row.blocks.review_stars.disabled;
    before.block_order = before.block_order.filter(
      (id: string) => id !== "social_proof",
    );
    const result = JSON.parse(withPdpIntro(JSON.stringify(remote), kit)!);
    const details = result.sections.main.blocks["product-details"];
    expect(details.blocks.stars_row.disabled).toBe(true);
    expect(details.blocks.review_stars.disabled).toBe(true);
    expect(details.block_order).not.toContain("social_proof");
  });
  it("conserva grupos personalizados y falla sin mutar si falta la estructura conocida", () => {
    const custom = legacyIntro();
    custom.sections.main.blocks[
      "product-details"
    ].blocks.stars_row.blocks.custom = {
      type: "text",
      settings: { text: "Propio" },
    };
    expect(withPdpIntro(JSON.stringify(custom), kit)).toBeNull();
    const incomplete = legacyIntro();
    delete incomplete.sections.main.blocks["product-details"].blocks
      .pack_offers;
    expect(withPdpIntro(JSON.stringify(incomplete), kit)).toBeNull();
    expect(withPdpIntro("no es json", kit)).toBeNull();
    expect(withPdpIntro("null", kit)).toBeNull();
  });
  it("agrega las secciones nuevas, conserva ajustes y respeta apagadas", async () => {
    const { withPdpSections } = await import("./kit");
    const kit = readFileSync(join(KIT_DIR, "templates/product.json"), "utf8");
    const remote = {
      sections: {
        main: { type: "product-information", settings: { gap: 32 } },
        custom: {
          type: "custom-liquid",
          settings: { custom_liquid: "Contenido propio" },
        },
        old_guarantee: { type: "df-guarantee", disabled: true, settings: {} },
      },
      order: ["main", "custom", "old_guarantee"],
    };
    const result = JSON.parse(withPdpSections(JSON.stringify(remote), kit)!);
    expect(result.sections.main).toEqual(remote.sections.main);
    expect(result.sections.custom).toEqual(remote.sections.custom);
    expect(result.sections.old_guarantee.disabled).toBe(true);
    expect(
      Object.values(result.sections).filter(
        (s) => (s as { type: string }).type === "df-guarantee",
      ),
    ).toHaveLength(1);
    expect(Object.keys(result.sections)).toHaveLength(12);
    expect(withPdpSections(JSON.stringify(result), kit)).toBeNull();
  });
});
