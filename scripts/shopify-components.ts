// Copia los componentes de conversión (lib/shopify/components) a un tema de lib/shopify/themes.
//
// Cada componente vive en su carpeta con la misma estructura que un tema (sections/, blocks/,
// snippets/, assets/). Este script aplana esas carpetas dentro del tema elegido; lo compartido
// (_shared) va siempre. Los archivos del tema que no son de DropFlex no se tocan, y un archivo
// df-* que ya no existe en components/ se borra del tema, para que el tema nunca quede con un
// componente viejo.
//
// Uso:
//   npx tsx scripts/shopify-components.ts                 → tema DropPulse
//   npx tsx scripts/shopify-components.ts --theme Otro     → otro tema de lib/shopify/themes
//   npx tsx scripts/shopify-components.ts --check          → solo compara; sale con 1 si difiere

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "lib", "shopify");
const COMPONENTS = join(ROOT, "components");
const THEME_DIRS = ["sections", "blocks", "snippets", "assets"] as const;
const OWNED = /^df-/;

const args = process.argv.slice(2);
const themeName = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : "DropPulse";
const checkOnly = args.includes("--check");
const theme = join(ROOT, "themes", themeName);

if (!existsSync(theme)) {
  console.error(`No existe el tema ${themeName} en lib/shopify/themes`);
  process.exit(1);
}

const md5 = (buf: Buffer) => createHash("md5").update(buf).digest("hex");

// Archivos que debería tener el tema: destino → origen.
const wanted = new Map<string, string>();
for (const component of readdirSync(COMPONENTS)) {
  const dir = join(COMPONENTS, component);
  if (!statSync(dir).isDirectory()) continue;
  for (const sub of THEME_DIRS) {
    const from = join(dir, sub);
    if (!existsSync(from)) continue;
    for (const file of readdirSync(from)) {
      if (!OWNED.test(file)) {
        console.error(`${relative(ROOT, join(from, file))}: todo archivo de componente empieza con df-`);
        process.exit(1);
      }
      const target = join(theme, sub, file);
      if (wanted.has(target)) {
        console.error(`${sub}/${file} está en dos componentes`);
        process.exit(1);
      }
      wanted.set(target, join(from, file));
    }
  }
}

let changed = 0;
for (const [target, source] of wanted) {
  const next = readFileSync(source);
  const same = existsSync(target) && md5(readFileSync(target)) === md5(next);
  if (same) continue;
  changed++;
  console.log(`${checkOnly ? "difiere" : "copia"}  ${relative(theme, target)}`);
  if (!checkOnly) {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, next);
  }
}

for (const sub of THEME_DIRS) {
  const dir = join(theme, sub);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    const target = join(dir, file);
    if (!OWNED.test(file) || wanted.has(target)) continue;
    changed++;
    console.log(`${checkOnly ? "sobra" : "borra"}  ${sub}/${file}`);
    if (!checkOnly) rmSync(target);
  }
}

console.log(changed === 0 ? `Tema ${themeName} al día` : `${changed} cambios${checkOnly ? " pendientes" : ""}`);
if (checkOnly && changed > 0) process.exit(1);
