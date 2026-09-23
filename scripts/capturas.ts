/**
 * Capturas de cada ruta a 390×844 (móvil) y 1280×800 (escritorio), en claro y oscuro,
 * en docs/capturas/pantallas/. También captura el asistente abierto sobre Precio.
 *
 *   npm run dev   # en otra terminal (o BASE_URL=http://localhost:3000)
 *   npx tsx scripts/capturas.ts [filtro]
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs/capturas/pantallas");
const only = process.argv[2];

export const ROUTES: { name: string; path: string; after?: (p: Page) => Promise<void> }[] = [
  { name: "hoy", path: "/today" },
  { name: "productos", path: "/products" },
  { name: "producto", path: "/products/corrector-de-postura" },
  { name: "textos", path: "/products/corrector-de-postura/copy" },
  { name: "imagenes", path: "/products/corrector-de-postura/images" },
  {
    name: "asistente",
    path: "/products/corrector-de-postura/base",
    after: async (p) => {
      await p.getByRole("button", { name: "Abrir asistente" }).first().click();
      await p.getByRole("button", { name: "Cerrar asistente" }).waitFor();
      await p.waitForTimeout(600);
    },
  },
  { name: "campanas", path: "/campaigns" },
  { name: "campana", path: "/campaigns/corrector-video-ugc" },
  { name: "ajustes", path: "/settings" },
  { name: "login", path: "/auth/login" },
];

export const VIEWPORTS = [
  { name: "390", width: 390, height: 844, isMobile: true },
  { name: "1280", width: 1280, height: 800, isMobile: false },
] as const;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      for (const r of ROUTES.filter((r) => !only || r.name.includes(only))) {
        await page.goto(BASE + r.path, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        if (r.after) await r.after(page);
        const file = join(OUT, `${r.name}-${vp.name}-${scheme === "light" ? "claro" : "oscuro"}.png`);
        await page.screenshot({ path: file, animations: "disabled" });
        console.log(file.replace(process.cwd() + "/", ""));
      }
      await ctx.close();
    }
  }
  await browser.close();
}

if (process.argv[1]?.endsWith("capturas.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
