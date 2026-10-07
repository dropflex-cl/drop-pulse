/** Reproduce consentimiento nativo sin grant de DropFlex; solo fixtures locales. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, "http://127.0.0.1:55321", "La prueba solo puede escribir en Supabase local.");
assert.equal(process.env.APP_URL, "http://localhost:3000");
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const merchant = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const resource = "http://localhost:3000/api/mcp", redirectUri = "http://localhost:3000/pi-test-callback";
let userId: string | undefined, clientId: string | undefined, browser: Browser | undefined;
async function authorize() {
  assert(clientId);
  const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
  const response = await fetch(`${url}/auth/v1/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "email offline_access", code_challenge: challenge, code_challenge_method: "S256", resource })}`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const id = new URL(response.headers.get("location")!).searchParams.get("authorization_id");
  assert(id); return id;
}
async function main() {
  try {
    const email = `pi-recovery-${randomBytes(8).toString("hex")}@example.test`, password = randomBytes(32).toString("base64url");
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!user.error && user.data.user); userId = user.data.user.id;
    const registered = await admin.auth.admin.oauth.createClient({ client_name: "Cliente incompleto de prueba", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", scope: "email offline_access" });
    assert(!registered.error && registered.data); clientId = registered.data.client_id;
    const login = await merchant.auth.signInWithPassword({ email, password }); assert(!login.error);
    const firstId = await authorize();
    const details = await merchant.auth.oauth.getAuthorizationDetails(firstId); assert(!details.error);
    const approved = await merchant.auth.oauth.approveAuthorization(firstId, { skipBrowserRedirect: true }); assert(!approved.error);
    const local = await admin.from("pi_access_grants").select("active").eq("user_id", userId).eq("client_id", clientId);
    assert(!local.error); assert.deepEqual(local.data, [], "El fixture no reproduce el grant ausente.");

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:3000/auth/login?${new URLSearchParams({ next: "/oauth/connections" })}`);
    await page.getByLabel("Correo", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await page.getByRole("heading", { name: "Cliente incompleto de prueba", exact: true }).waitFor({ timeout: 30000 });
    await page.getByText("Acceso inactivo", { exact: true }).waitFor();
    const recoveryText = "La conexión quedó incompleta. Revisa tus conexiones, revócala y vuelve a conectar el cliente MCP.";
    await page.getByText(recoveryText, { exact: true }).waitFor();
    assert.equal(await page.locator("li").count(), 0, "Se inventaron permisos para el consentimiento nativo.");

    const repeatedId = await authorize();
    for (const view of ["connections", "consent"] as const) {
      for (const width of [390, 1280]) for (const colorScheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ colorScheme });
        await page.goto(view === "connections" ? "http://localhost:3000/oauth/connections" : `http://localhost:3000/oauth/consent?authorization_id=${repeatedId}`);
        await page.getByText(recoveryText, { exact: true }).waitFor();
        await page.waitForFunction((scheme) => document.documentElement.classList.contains(scheme), colorScheme);
        const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        assert.deepEqual(axe.violations.map(({ id }) => id), [], `Accesibilidad: ${view}/${width}/${colorScheme}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "La pantalla desborda.");
        await page.screenshot({ path: `/private/tmp/pi-oauth-recovery-${view}-${width}-${colorScheme}.png`, fullPage: true });
      }
    }
    await page.getByRole("link", { name: "Revisa tus conexiones", exact: true }).click();
    await page.getByRole("button", { name: "Revoca la conexión", exact: true }).click();
    await page.getByText("Todavía no tienes conexiones MCP.", { exact: true }).waitFor();
    const native = await merchant.auth.oauth.listGrants(); assert(!native.error); assert.deepEqual(native.data, []);

    const freshId = await authorize();
    await page.goto(`http://localhost:3000/oauth/consent?authorization_id=${freshId}`);
    await page.getByRole("button", { name: "Autoriza la conexión", exact: true }).waitFor();
    assert.equal(await page.getByRole("switch", { checked: true }).count(), 1, "Se seleccionaron permisos sin decisión.");
    await page.getByRole("button", { name: "Autoriza la conexión", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/pi-test-callback" && url.searchParams.has("code"));
    const grant = await admin.from("pi_access_grants").select("active,scopes").eq("user_id", userId).eq("client_id", clientId).single();
    assert(!grant.error); assert.deepEqual(grant.data, { active: true, scopes: ["product_intelligence:read"] });
    await page.goto("http://localhost:3000/oauth/connections");
    assert.equal(await page.getByRole("heading", { name: "Cliente incompleto de prueba", exact: true }).count(), 1);
    assert.equal(await page.getByText(recoveryText, { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Revoca la conexión", exact: true }).click();
    await page.getByText("Acceso inactivo", { exact: true }).waitFor();
    console.log(JSON.stringify({ environment: "local", incomplete_connection_visible: true, no_permissions_on_read: true, native_revocation: true, fresh_consent: true, default_read_only: true, reauthorized_grant: true, wcag: true, screens: 8 }));
  } finally {
    await browser?.close();
    if (clientId) { const result = await admin.auth.admin.oauth.deleteClient(clientId); assert(!result.error, "No pudimos limpiar el cliente fixture."); }
    if (userId) { const result = await admin.auth.admin.deleteUser(userId); assert(!result.error, "No pudimos limpiar el usuario fixture."); }
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falló la recuperación local."); process.exitCode = 1; });
