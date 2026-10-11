/** Prueba opt-in con navegador y datos locales. Nunca conecta tiendas ni proveedores. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createContextRepository, contextAccess } from "./repository";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput } from "./validation";
import type { ToolCommand } from "./mcp";
import { preparePublish } from "@/lib/pipeline/publish";
import { fingerprint } from "@/lib/shopify/publish/mapping";
import { publicationSnapshot } from "@/lib/products/publication-snapshot";
import { optimizeImage } from "@/lib/media/optimize";

describe.runIf(process.env.PI_UI_TEST === "1")("Ficha de producto · navegador local", () => {
  let db: SupabaseClient, owner: Principal, browser: Browser;
  let execute: ReturnType<typeof createProductIntelligenceExecutor>;
  const scenarios = ["empty", "partial", "complete", "published", "updated"];
  const ids = new Map<string, string>();
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const files: string[] = [];
  const qa: unknown[] = [];
  const directory = "output/product-experience/qa";
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) { const r = await op; if (r.error) throw new Error(JSON.stringify(r.error)); return r; }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const login = { email: `ui-${randomUUID()}@example.test`, password: randomUUID() };
    const created = await checked(db.auth.admin.createUser({ ...login, email_confirm: true }));
    const uid = created.data.user!.id;
    owner = { userId: uid, actorId: uid, actorKind: "merchant", scopes: PI_SCOPES };
    await checked(db.from("merchant_settings").insert({ user_id: uid, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString(), free_shipping: false, handling_days: 1, transit_days_min: 2, transit_days_max: 3, cutoff_hour: 13 }));
    const session = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: items => { for (const item of items) cookies.push({ name: item.name, value: item.value, url: "http://localhost:3100", httpOnly: false, sameSite: "Lax" }); } } });
    await checked(session.auth.signInWithPassword(login));
    execute = createProductIntelligenceExecutor(createContextRepository(db));
    for (const scenario of scenarios) {
      const id = randomUUID(); ids.set(scenario, id);
      await checked(db.from("products").insert({ id, user_id: uid, title: `Organizador ${scenario}`, shopify_product_id: id, currency: "CLP" }));
      if (scenario === "empty") continue;
      await execute(owner, { tool: "save_product_context", input: parseToolInput("save_product_context", { product_id: id, schema_version: "1.0", expected_revision: 0, idempotency_key: randomUUID(), context: { display_name: "Organizador de escritorio", description: "Reúne lápices y útiles en tu escritorio." }, pricing: { mode: "recommended", unit_cost_minor: 4000 } }) } as ToolCommand, AbortSignal.timeout(10000));
      const raw = await createContextRepository(db).loadLanding({ p_access: contextAccess(owner), p_product_id: id }, AbortSignal.timeout(10000)) as { revision: number; landing_etag: string };
      const listing = { title: "Organizador para tu escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.", offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." };
      await execute(owner, { tool: "save_landing_content", input: parseToolInput("save_landing_content", { product_id: id, schema_version: "1.1", expected_revision: raw.revision, expected_landing_etag: raw.landing_etag, idempotency_key: randomUUID(), entries: [{ component: "listing", content: [{ key: "default", angle_id: null, hook_id: null, content: listing }, { key: "desk", angle_id: "desk", hook_id: null, content: { ...listing, title: "Encuentra tus útiles sin buscar" } }] }, { component: "pain-block", content: { heading: "Cada cosa en su lugar", moments: [{ slot: 1, title: "El lápiz entre los papeles", text: "Quien trabaja en un escritorio pierde tiempo buscando los útiles entre papeles y cuadernos." }], bridge: "Los compartimentos reúnen los útiles y los dejan a la vista." } }] }) } as ToolCommand, AbortSignal.timeout(10000));
      if (scenario === "partial") continue;
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#eee"/><rect x="130" y="210" width="340" height="220" rx="25" fill="#808080"/><path d="M240 210V120M340 210V90" stroke="#222" stroke-width="30"/></svg>');
      const image = await optimizeImage(svg), path = `${uid}/${id}/${randomUUID()}.webp`; files.push(path);
      await checked(db.storage.from("page-media").upload(path, image.data, { contentType: image.mime }));
      await checked(db.from("page_images").insert({ id: randomUUID(), product_id: id, user_id: uid, slot: "cover", source: "upload", render_status: "succeeded", status: "approved", storage_path: path, width: 600, height: 600, size_bytes: image.data.length }));
      if (scenario === "published" || scenario === "updated") {
        const prepared = await preparePublish(uid, id);
        await checked(db.from("product_publications").insert({ product_id: id, user_id: uid, shop_domain: "fixture.myshopify.com", status: "published", published_at: new Date().toISOString(), fingerprint: fingerprint(prepared.input), summary: { content: publicationSnapshot(prepared.input) } }));
      }
      if (scenario === "updated") await checked(db.from("products").update({ page_accent_color: "#222222" }).eq("id", id));
    }
    await mkdir(directory, { recursive: true }); browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/report.json`, JSON.stringify(qa, null, 2));
    await browser?.close();
    if (files.length) await checked(db.storage.from("page-media").remove(files));
    if (owner) await checked(db.auth.admin.deleteUser(owner.userId));
  }, 20000);
  for (const width of [390, 1440]) it(`representa los cinco casos y los controles en ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 } }); await context.addCookies(cookies);
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    for (const scenario of scenarios) {
      const response = await page.goto(`http://localhost:3100/products/${ids.get(scenario)}`, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200); expect(page.url()).toContain(`/products/${ids.get(scenario)}`);
      await expect.poll(() => page.getByRole("navigation", { name: "Producto", exact: true }).count()).toBe(1);
      const title = { empty: "Sin página guardada", partial: "Falta completar para publicar", complete: "Listo para publicar", published: "Publicado en tu tienda", updated: "Cambios sin publicar" }[scenario]!;
      expect(await page.locator("#product-situation").innerText()).toBe(title);
      if (scenario !== "empty") {
        await page.getByLabel("Versión de la página").selectOption("1");
        expect(await page.locator("section[aria-labelledby=product-preview]").innerText()).toContain("Encuentra tus útiles sin buscar");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(accessibility.violations).toEqual([]);
      qa.push({ width, scenario, status: response?.status(), errors: [...errors], violations: accessibility.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })) });
      await page.screenshot({ path: `${directory}/${scenario}-${width}.png`, fullPage: true });
      expect(errors).toEqual([]);
    }
    const id = ids.get("complete")!;
    for (const suffix of ["base", "copy", "images", "publish"]) {
      const response = await page.goto(`http://localhost:3100/products/${id}/${suffix}`, { waitUntil: "networkidle" }); expect(response?.status()).toBe(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      qa.push({ width, route: suffix, violations: accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) });
      expect(accessibility.violations).toEqual([]);
      await page.screenshot({ path: `${directory}/${suffix}-${width}.png`, fullPage: true });
    }
    await page.goto(`http://localhost:3100/products/${id}/base`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Producto", exact: true }).fill(`Organizador ajustado ${width}`);
    await expect.poll(async () => (await checked(db.from("pi_product_inputs").select("display_name").eq("product_id", id).single())).data!.display_name, { timeout: 15000 }).toBe(`Organizador ajustado ${width}`);
    await page.goto(`http://localhost:3100/products/${id}/copy`, { waitUntil: "networkidle" });
    const toggle = page.getByRole("switch", { name: "Mostrar en la página" });
    for (const enabled of [false, true]) {
      const saved = page.waitForResponse(response => response.url().includes(`/copy/components/pain-block`) && response.request().method() === "PATCH");
      await toggle.click(); expect((await saved).status()).toBe(200);
      await expect.poll(async () => { const current = await checked(db.from("page_components").select("enabled").eq("product_id", id).eq("component", "pain-block").is("superseded_at", null).single()); return current.data!.enabled; }, { timeout: 15000 }).toBe(enabled);
      await expect.poll(async () => (await toggle.isEnabled()) && (await toggle.isChecked()) === enabled, { timeout: 15000 }).toBe(true);
    }
    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    await page.screenshot({ path: `${directory}/editor-${width}.png`, fullPage: true });
    await page.getByRole("dialog").getByLabel("Título", { exact: true }).fill(`Organizador ajustado para ${width}`);
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect.poll(async () => (await preparePublish(owner.userId, id)).input.listing.title, { timeout: 15000 }).toBe(`Organizador ajustado para ${width}`);
    await page.goto(`http://localhost:3100/products/${id}/images`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect.poll(async () => (await preparePublish(owner.userId, id)).missing.some(m => m.includes("portada")), { timeout: 15000 }).toBe(true);
    await page.getByRole("button", { name: "Usar de portada", exact: true }).click();
    await expect.poll(async () => (await preparePublish(owner.userId, id)).missing, { timeout: 15000 }).toEqual([]);
    expect(errors).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`http://localhost:3100/products/${id}`, { waitUntil: "networkidle" });
    const dark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    qa.push({ width, theme: "dark", violations: dark.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) });
    expect(dark.violations).toEqual([]);
    await page.screenshot({ path: `${directory}/complete-dark-${width}.png`, fullPage: true });
    await context.close();
  }, 180000);
});
