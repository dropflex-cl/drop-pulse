import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeUrl, isShopDomain, missingScopes,
  missingPublishScopes, normalizeShop, verifyShopifyRequest } from "./oauth";

function signed(params: Record<string, string>) {
  const p = new URLSearchParams(params);
  const msg = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join("&");
  p.set("hmac", createHmac("sha256", "shopify-secret").update(msg).digest("hex"));
  return p;
}

describe("normalizeShop", () => {
  it("acepta nombre, dominio o URL", () => {
    expect(normalizeShop("MiTienda")).toBe("mitienda.myshopify.com");
    expect(normalizeShop("mitienda.myshopify.com")).toBe("mitienda.myshopify.com");
    expect(normalizeShop("https://mitienda.myshopify.com/admin/products")).toBe("mitienda.myshopify.com");
  });

  it("rechaza vacío y caracteres inválidos con error de campo", () => {
    expect(() => normalizeShop("  ")).toThrow("Escribe la dirección de tu tienda.");
    expect(() => normalizeShop("mi_tienda")).toThrow(/letras, números y guiones/);
  });
});

describe("isShopDomain (anti-SSRF)", () => {
  it.each(["evil.com", "a.myshopify.com.evil.com", "x.myshopify.com/../", "", "-a.myshopify.com"])("rechaza %s", (d) => {
    expect(isShopDomain(d)).toBe(false);
  });
  it("acepta un dominio de Shopify", () => expect(isShopDomain("qs060z-e7.myshopify.com")).toBe(true));
});

describe("verifyShopifyRequest", () => {
  const now = 1_790_158_296_000;
  const params = { host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvcXMwNjB6LWU3", shop: "qs060z-e7.myshopify.com", timestamp: String(now / 1000) };

  it("valida el lanzamiento firmado de la App URL", () => {
    expect(verifyShopifyRequest(signed(params), now)).toBe(true);
  });

  it("rechaza un parámetro cambiado", () => {
    const p = signed(params);
    p.set("shop", "otra.myshopify.com");
    expect(verifyShopifyRequest(p, now)).toBe(false);
  });

  it("rechaza un timestamp de hace más de 10 minutos", () => {
    expect(verifyShopifyRequest(signed(params), now + 11 * 60_000)).toBe(false);
  });
});

describe("alcances", () => {
  it("write_products implica read_products", () => {
    expect(missingScopes(["write_products", "read_inventory", "read_orders"])).toEqual([]);
  });
  it("detecta los que faltan", () => {
    expect(missingScopes(["read_products"])).toEqual(["write_products", "read_inventory", "read_orders"]);
  });
  it("publicar pide temas y archivos aparte", () => {
    expect(missingPublishScopes(["write_products", "read_inventory", "read_orders"])).toEqual(["read_themes", "write_themes", "read_files", "write_files"]);
    expect(missingPublishScopes(["write_themes", "write_files"])).toEqual([]);
  });
  it("la URL de autorización pide los de conectar y los de publicar, y vuelve al callback", () => {
    const u = new URL(authorizeUrl("mitienda.myshopify.com", "st"));
    expect(u.searchParams.get("scope")).toBe("read_products,write_products,read_inventory,read_orders,read_themes,write_themes,read_files,write_files");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.dropflex.test/api/onboarding/shopify/callback");
    expect(u.searchParams.has("grant_options[]")).toBe(false);
  });
});
