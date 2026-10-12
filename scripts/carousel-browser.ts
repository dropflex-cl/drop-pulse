/** Aísla la interfaz real para QA; las escrituras quedan interceptadas y no usan cuentas del comerciante. */
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
const dir = "output/carousel-implementation";
async function main() {
  await mkdir(dir, { recursive: true });
  const built = await build({ entryPoints: ["scripts/fixtures/carousel-browser.tsx"], bundle: true, write: false, format: "iife", define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, jsx: "automatic", tsconfig: "tsconfig.json" });
  const cssFiles = await readdir(".next/static/css");
  const css = (await Promise.all(cssFiles.filter(f => f.endsWith(".css")).map(f => readFile(`.next/static/css/${f}`, "utf8")))).join("\n");
  const browser = await chromium.launch(), results = [];
  try {
    for (const width of [390, 1280]) for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme as "light" | "dark" }); const page = await ctx.newPage();
      await page.route("https://carousel.test/", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="es" class="${theme}"><head><title>Carruseles</title><style>${css}</style></head><body><div id="root"></div><script>${built.outputFiles![0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>` }));
      const errors: string[] = []; page.on("pageerror", e => { errors.push(e.message); console.error(e.message); }); page.setDefaultTimeout(10000);
      await page.goto("https://carousel.test/"); await page.getByRole("button", { name: "Edita las tarjetas" }).waitFor();
      await page.getByRole("button", { name: "Usa este carrusel" }).click(); await page.getByRole("button", { name: "Quita del anuncio" }).waitFor();
      await page.screenshot({ path: `${dir}/${width}-${theme}-library.png`, fullPage: true });
      await page.getByRole("button", { name: "Edita las tarjetas" }).click(); await page.getByRole("dialog").waitFor();
      await page.getByRole("textbox", { name: "Texto principal", exact: true }).fill("Nuevo texto para el pack de dos");
      await page.getByRole("button", { name: "Mueve después", exact: true }).first().click();
      let saved: unknown;
      await page.route("**/api/products/*/ads/carousels", async route => { saved = route.request().postDataJSON(); await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Otra edición cambió el carrusel. Revisa y guarda nuevamente." }) }); });
      await page.getByRole("button", { name: "Guarda el carrusel" }).click(); await page.getByRole("alert").waitFor();
      if ((saved as { content?: { cards?: { key: string }[] } }).content?.cards?.[0].key !== "oferta") throw new Error("La edición no conserva el orden elegido.");
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      await page.screenshot({ path: `${dir}/${width}-${theme}-editor.png`, fullPage: true });
      results.push({ width, theme, overflow, errors, violations: audit.violations }); await ctx.close();
    }
    await writeFile(`${dir}/browser-qa.json`, JSON.stringify(results, null, 2));
    for (const r of results) console.log(`${r.width} ${r.theme}: ${r.violations.length} problemas a11y, overflow=${r.overflow}, errores=${r.errors.length}`);
    if (results.some(r => r.violations.length || r.overflow || r.errors.length)) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
