/**
 * Montajes para comparar pantallas: arriba la referencia (design-system/screenshots/pantallas),
 * abajo nuestras capturas equivalentes (docs/capturas/pantallas). Salida: docs/capturas/comparacion/pantallas/.
 *
 *   npx tsx scripts/capturas.ts && npx tsx scripts/comparar-pantallas.ts
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REF = join(process.cwd(), "design-system/screenshots/pantallas");
const OURS = join(process.cwd(), "docs/capturas/pantallas");
const OUT = join(process.cwd(), "docs/capturas/comparacion/pantallas");

const GROUPS: { ref: string; ours: string[]; vp: "390" | "1280"; dir?: string }[] = [
  { ref: "PantallasOnboarding1", ours: ["o1-crear-cuenta", "o3-shopify"], vp: "390", dir: "onboarding" },
  { ref: "PantallasOnboarding2", ours: ["o4-productos", "o5-numeros", "o6-meta"], vp: "390", dir: "onboarding" },
  { ref: "PantallasOnboarding3", ours: ["o8-listo", "o9-hoy"], vp: "390", dir: "onboarding" },
  { ref: "PantallasOnboardingEscritorio1", ours: ["o4-productos"], vp: "1280", dir: "onboarding" },
  { ref: "PantallasMovil1", ours: ["hoy", "productos", "producto"], vp: "390" },
  { ref: "PantallasMovil2", ours: ["textos", "imagenes"], vp: "390" },
  { ref: "PantallasMovil3", ours: ["campanas", "asistente"], vp: "390" },
  { ref: "PantallasEscritorio1", ours: ["textos"], vp: "1280" },
  { ref: "PantallasEscritorio2", ours: ["campanas"], vp: "1280" },
];

const uri = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 600 } });
  for (const g of GROUPS) {
    for (const theme of ["claro", "oscuro"]) {
      const ref = join(REF, `${g.ref}-${theme}.png`);
      const ours = g.ours.map((n) => join(g.dir ? join(process.cwd(), "docs/capturas", g.dir) : OURS, `${n}-${g.vp}-${theme}.png`)).filter(existsSync);
      if (!ours.length) continue;
      const w = g.vp === "390" ? 390 : 1280;
      await page.setContent(`<body style="margin:0;background:#888;font:14px system-ui;color:#fff">
        <p style="margin:8px">Referencia · ${g.ref} (${theme})</p><img style="max-width:100%;display:block" src="${uri(ref)}">
        <p style="margin:8px">Implementación · ${g.ours.join(", ")} a ${g.vp}px</p>
        <div style="display:flex;gap:40px;padding:8px 32px;align-items:flex-start">${ours.map((o) => `<img style="width:${w}px" src="${uri(o)}">`).join("")}</div>
      </body>`);
      await page.screenshot({ path: join(OUT, `${g.ref}-${theme}.png`), fullPage: true });
    }
  }
  await browser.close();
  console.log(`Montajes en ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
