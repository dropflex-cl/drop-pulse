/** Consentimiento/revocación reales en preview local; fixtures borrados al finalizar. */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseToolOutput } from "../lib/product-intelligence/validation";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";
import { createMcpAuthenticator, type DelegatedIdentity } from "../lib/product-intelligence/oauth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, "http://127.0.0.1:55321", "La prueba de UI solo puede escribir en Supabase local.");
assert.equal(process.env.APP_URL, "http://localhost:3000");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!, publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
assert(serviceKey && publicKey);
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const resourceUrl = "http://localhost:3000/api/mcp";
let userId: string | undefined, clientId: string | undefined, browser: Browser | undefined;
async function checkGrant(identity: DelegatedIdentity) {
  const result = await admin.rpc("pi_check_oauth_grant", { p_user_id: identity.userId, p_client_id: identity.clientId, p_session_id: identity.sessionId, p_token_session_id: identity.tokenSessionId, p_version: identity.grantVersion, p_resource_url: identity.resourceUrl });
  assert(!result.error); return result.data;
}
async function main() {
  try {
    const email = `pi-ui-${randomBytes(8).toString("hex")}@example.test`, password = randomBytes(32).toString("base64url");
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!user.error && user.data.user); userId = user.data.user.id;
    const registered = await admin.auth.admin.oauth.createClient({ client_name: "Cliente de prueba MCP", redirect_uris: ["http://localhost:3000/pi-test-callback"], token_endpoint_auth_method: "none", scope: "email offline_access" });
    assert(!registered.error && registered.data); clientId = registered.data.client_id;
    const verifier = randomBytes(32).toString("base64url"), state = randomBytes(16).toString("hex");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = await fetch(`${url}/auth/v1/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: "http://localhost:3000/pi-test-callback", response_type: "code", scope: "email offline_access", code_challenge: challenge, code_challenge_method: "S256", state, resource: resourceUrl })}`, { redirect: "manual" });
    assert.equal(authorize.status, 302);
    const authorizationId = new URL(authorize.headers.get("location")!).searchParams.get("authorization_id")!;
    assert(authorizationId);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" });
    const page = await context.newPage();
    const next = `/oauth/consent?authorization_id=${authorizationId}`;
    await page.goto(`http://localhost:3000/auth/login?${new URLSearchParams({ next })}`);
    await page.getByLabel("Correo", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await page.getByRole("heading", { name: "Autoriza la conexión MCP", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("switch", { name: "Consultar contexto y estrategia", exact: false }).waitFor();
    assert.equal(await page.getByRole("switch", { checked: true }).count(), 1, "Generación o escritura se habilitó sin elegirla.");
    assert.equal(await page.getByRole("switch", { checked: false }).count(), 5);
    let screens = 0;
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction((scheme) => document.documentElement.classList.contains(scheme), colorScheme);
        const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        assert.deepEqual(axe.violations.map(({ id }) => id), [], `Accesibilidad: ${width}/${colorScheme}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "La pantalla desborda horizontalmente.");
        await page.screenshot({ path: `/private/tmp/pi-oauth-consent-${width}-${colorScheme}.png`, fullPage: true }); screens++;
      }
    }
    await page.getByRole("button", { name: "Autoriza la conexión", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/pi-test-callback" && url.searchParams.has("code"), { timeout: 30000 });
    const callback = new URL(page.url()); assert.equal(callback.searchParams.get("state"), state);
    const response = await fetch(`${url}/auth/v1/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: callback.searchParams.get("code")!, code_verifier: verifier, redirect_uri: "http://localhost:3000/pi-test-callback", resource: resourceUrl }) });
    assert(response.ok, `Token de consentimiento UI: HTTP ${response.status}`);
    const tokens = await response.json();
    const authenticate = createMcpAuthenticator({ resourceUrl, issuer: `${url}/auth/v1`, jwksUrl: `${url}/auth/v1/.well-known/jwks.json`, allowedOrigins: ["http://localhost:3000"] }, checkGrant);
    const request = () => new Request(resourceUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const auth = await authenticate(request()); assert.deepEqual(auth.principal.scopes, ["product_intelligence:read"]);
    const productId = randomUUID();
    const settings = await admin.from("merchant_settings").insert({ user_id: userId, country_code: "CL", currency: "CLP", language: "es" });
    const product = await admin.from("products").insert({ id: productId, user_id: userId, shopify_product_id: "pi-ui-fixture", title: "Producto de prueba", currency: "CLP" });
    assert(!settings.error && !product.error, "No pudimos crear el contexto de prueba local.");
    const form = { unitCost: 4000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75, salePrice: 29990, compareAtPrice: 39990, extraUnitDiscount: 50 };
    const firstPrice = await context.request.put(`http://localhost:3000/api/products/${productId}/pricing`, { data: { ...form, expectedPricingStamp: null } });
    assert.equal(firstPrice.status(), 200, "El writer UI no confirmó el precio.");
    const observedStamp = (await firstPrice.json()).pricing.pricingStamp;
    assert.match(observedStamp, /^[0-9a-f]{64}$/);
    const newPrice = await context.request.put(`http://localhost:3000/api/products/${productId}/pricing`, { data: { ...form, unitCost: 4500, expectedPricingStamp: observedStamp } });
    assert.equal(newPrice.status(), 200);
    const stalePrice = await context.request.put(`http://localhost:3000/api/products/${productId}/pricing`, { data: { ...form, expectedPricingStamp: observedStamp } });
    assert.equal(stalePrice.status(), 409, "Una pantalla vieja sobrescribió el precio nuevo.");
    const mcp = new Client({ name: "pi-ui-runtime", version: "1" });
    try {
      await mcp.connect(new StreamableHTTPClientTransport(new URL(resourceUrl), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
      const discovered: string[] = []; let cursor: string | undefined;
      do { const page = await mcp.listTools(cursor ? { cursor } : undefined); discovered.push(...page.tools.map(({ name }) => name)); cursor = page.nextCursor; } while (cursor);
      assert.deepEqual(discovered, ["get_product_context", "save_product_context", "save_product_analysis", "patch_product_analysis", "save_research", "set_product_strategy", "get_product_strategy"]);
      const missing = await mcp.callTool({ name: "get_product_context", arguments: { product_id: "00000000-0000-4000-8000-000000000099" } });
      const result = parseToolOutput("get_product_context", missing.structuredContent);
      assert(!result.ok); assert.equal(result.error.code, "NOT_FOUND");
      const persisted = parseToolOutput("get_product_context", (await mcp.callTool({ name: "get_product_context", arguments: { product_id: productId } })).structuredContent);
      assert(persisted.ok); assert.equal(persisted.revision, 2); assert.equal(persisted.data.product.pricing?.unit_cost_minor, 4500);
      const forbidden = parseToolOutput("save_product_context", (await mcp.callTool({ name: "save_product_context", arguments: { product_id: productId,
        schema_version: "1.0", expected_revision: 2, idempotency_key: "read-only-probe", pricing: { mode: "recommended", unit_cost_minor: 5000 } } })).structuredContent);
      assert(!forbidden.ok); assert.equal(forbidden.error.code, "FORBIDDEN");
    } finally { await mcp.close(); }
    const merchantCookies = await context.cookies();
    const authCookie = merchantCookies.find(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
    assert(authCookie, "No encontramos una cookie de sesión local para verificar aislamiento.");
    const cookieName = authCookie.name.replace(/\.\d+$/, "");
    const cookiePayload = `base64-${Buffer.from(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: auth.expiresAt, expires_in: auth.expiresAt - Math.floor(Date.now() / 1000), token_type: "bearer", user: { id: userId } })).toString("base64url")}`;
    const delegatedContext = await browser.newContext();
    await delegatedContext.addCookies(createChunks(cookieName, cookiePayload).map(({ name, value }) => ({ name, value, domain: "localhost", path: "/" })));
    const delegatedApi = await delegatedContext.request.get("http://localhost:3000/api/onboarding/state");
    assert.equal(delegatedApi.status(), 401, "El token MCP colocado en cookie autorizó una API del SaaS.");
    const delegatedPage = await delegatedContext.request.get("http://localhost:3000/today", { maxRedirects: 0 });
    assert.equal(delegatedPage.status(), 307, "El token MCP colocado en cookie autorizó la UI del SaaS.");
    await delegatedContext.close();
    await page.goto("http://localhost:3000/oauth/connections");
    await page.getByRole("heading", { name: "Cliente de prueba MCP" }).waitFor();
    const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(({ id }) => id), []);
    await page.getByRole("button", { name: "Revoca la conexión" }).click();
    await page.getByText("Acceso inactivo", { exact: true }).waitFor();
    await assert.rejects(authenticate(request()), { status: 401 });
    console.log(JSON.stringify({ environment: "local", screens, wcag: true, consent: true, default_read_only: true, revoke_ui: true, delegated_cookie_blocked: true, domain_executor: true, pricing_ui_cas: true, persisted_context_read: true, published_tools: 11 }));
    await context.close();
  } finally {
    await browser?.close();
    if (clientId) { const { error } = await admin.auth.admin.oauth.deleteClient(clientId); assert(!error, "No pudimos limpiar el cliente fixture de UI."); }
    if (userId) { const { error } = await admin.auth.admin.deleteUser(userId); assert(!error, "No pudimos limpiar el usuario fixture de UI."); }
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falló la prueba UI local."); process.exitCode = 1; });
