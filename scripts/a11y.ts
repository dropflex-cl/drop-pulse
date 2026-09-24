/**
 * Auditoría de accesibilidad con axe en cada ruta, a 390px y 1280px, en claro y oscuro.
 * Incluye el asistente abierto. Sale con código 1 si hay violaciones.
 *
 *   npm run dev   # en otra terminal
 *   npx tsx scripts/a11y.ts
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { ROUTES, VIEWPORTS } from "./capturas";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXTRA = [
  { name: "tokens", path: "/dev/tokens" },
  { name: "componentes", path: "/dev/components" },
  { name: "registro", path: "/auth/sign-up" },
  { name: "recuperar", path: "/auth/forgot-password" },
  { name: "nueva-clave", path: "/auth/update-password" },
  { name: "confirma", path: "/auth/sign-up-success" },
  { name: "error-auth", path: "/auth/error?error=otp_expired" },
  // Anuncios: el configurador con sus 5 secciones abiertas, y vacío (datos de ejemplo).
  {
    name: "anuncios",
    path: "/dev/screens/ads?state=ready",
    after: async (page: import("@playwright/test").Page) => {
      for (const k of ["creatives", "audience", "budget", "copy", "engine"]) await page.click(`#cfg-${k} h3 button`);
    },
  },
  { name: "anuncios-vacio", path: "/dev/screens/ads?state=empty" },
];

async function main() {
  const browser = await chromium.launch();
  let total = 0;
  for (const vp of VIEWPORTS) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      for (const r of [...ROUTES, ...EXTRA] as typeof ROUTES) {
        await page.goto(BASE + r.path, { waitUntil: "networkidle" });
        if (r.after) await r.after(page);
        await page.waitForTimeout(300);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const tag = `${r.name} ${vp.name} ${scheme}`;
        if (!result.violations.length) {
          console.log(`ok   ${tag}`);
          continue;
        }
        total += result.violations.length;
        console.log(`FAIL ${tag}`);
        for (const v of result.violations) {
          console.log(`  - ${v.id} (${v.impact}): ${v.help}`);
          for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1] ?? ""}`);
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(total ? `\n${total} violaciones` : "\nSin violaciones");
  process.exit(total ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
