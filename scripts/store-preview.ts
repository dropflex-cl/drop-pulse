// Genera los archivos que la vista previa en React toma del tema (lib/store-preview/generate.ts).
//
// Uso:
//   npx tsx scripts/store-preview.ts          → escribe store.generated.css y theme.generated.ts
//   npx tsx scripts/store-preview.ts --check  → solo compara; sale con 1 si difieren

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { CATALOG } from "../lib/shopify/components/catalog";
import { CSS_OUT, TS_OUT, storeCss, themeTs } from "../lib/store-preview/generate";

const check = process.argv.includes("--check");
const files = Object.fromEntries(CATALOG.map((c) => [c.id, c.file]));
let stale = 0;
for (const [path, next] of [
  [CSS_OUT, storeCss()],
  [TS_OUT, themeTs(files)],
] as const) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current === next) continue;
  stale++;
  if (check) console.error(`${relative(process.cwd(), path)} no está al día: corre npm run store-preview`);
  else {
    writeFileSync(path, next);
    console.log(`Escrito ${relative(process.cwd(), path)}`);
  }
}
if (check && stale) process.exit(1);
if (!stale) console.log("La vista previa está al día con el tema");
