/** Local fixture QA; never reads or changes a merchant account. Start npm run dev first. */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const directory = "output/visual-production";
async function main() {
  await mkdir(directory, { recursive: true });
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") throw new Error("QA requires local Supabase");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = `visual-browser-${randomUUID()}@example.test`, password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const cookies: { name: string; value: string }[] = [];
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookies, setAll: next => { cookies.splice(0, cookies.length, ...next); } } });
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error) { await admin.auth.admin.deleteUser(created.data.user.id); throw signed.error; }
  const browser = await chromium.launch();
  const results: { viewport: string; theme: string; tab: string; violations: unknown; overflow: boolean }[] = [];
  try {
    for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 900 }]) {
      for (const theme of ["light", "dark"] as const) {
        const context = await browser.newContext({ viewport, colorScheme: theme }); await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: base }))); const page = await context.newPage();
        await page.goto(`${base}/dev/screens/visual-production?state=stale`, { waitUntil: "networkidle" });
        // The fixture is read-only: UI actions are checked against isolated mock responses.
        for (const tab of ["Plan", "Identidad", "Piezas"]) {
          await page.getByText(tab, { exact: true }).click();
          const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          results.push({ viewport: viewport.name, theme, tab, violations: audit.violations, overflow });
          await page.screenshot({ path: `${directory}/${viewport.name}-${theme}-${tab.toLowerCase()}.png`, fullPage: true });
        }
        await page.getByText("Identidad", { exact: true }).click(); await page.getByRole("button", { name: "Editar identidad", exact: true }).click();
        await page.getByRole("textbox", { name: "Describe el producto", exact: true }).fill("Nueva propuesta visual");
        let submitted = false;
        await page.route("**/api/products/*/visual", async route => {
          if (route.request().method() === "PUT") { submitted = true; await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "El contexto cambió. Actualiza antes de guardar." }) }); }
          else await route.fulfill({ status: 503, body: "" });
        });
        await page.getByRole("button", { name: "Guardar propuesta", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "El contexto cambió" }).waitFor();
        if (!submitted) throw new Error("La edición no envió la propuesta");
        await context.close();
      }
    }
    await writeFile(`${directory}/qa.json`, JSON.stringify(results, null, 2));
    for (const r of results) console.log(`${r.viewport} ${r.theme} ${r.tab}: ${Array.isArray(r.violations) ? r.violations.length : 0} violaciones, overflow=${r.overflow}`);
    if (results.some(r => r.overflow || (r.violations as unknown[]).length)) process.exitCode = 1;
  } finally { await browser.close(); await admin.auth.admin.deleteUser(created.data.user.id); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
