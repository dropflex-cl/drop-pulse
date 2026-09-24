// Historial del kit: la huella MD5 de cada versión publicada (en git) de los archivos del
// comerciante (templates/, sections/*.json, config/settings_data.json). «Actualizar tema» usa esto
// para saber si el template de una tienda sigue siendo una versión nuestra sin editar (y entonces
// se puede actualizar) o si el comerciante lo cambió en el editor (y no se toca).
//
// Uso: npx tsx scripts/kit-history.ts            → escribe lib/shopify/publish/kit-history.json
//      npx tsx scripts/kit-history.ts --check    → sale con 1 si difiere
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isProtected, readKit } from "../lib/shopify/publish/kit";

const THEME = "lib/shopify/themes/DropPulse";
const OUT = join(__dirname, "..", "lib", "shopify", "publish", "kit-history.json");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

const history: Record<string, string[]> = {};
for (const f of readKit().files.filter((x) => isProtected(x.path))) {
  const path = `${THEME}/${f.path}`;
  const commits = git("log", "--format=%H", "--", path).toString().split("\n").filter(Boolean);
  const hashes = new Set<string>();
  for (const c of commits) {
    try {
      hashes.add(md5(git("show", `${c}:${path}`)));
    } catch {
      // El archivo no existía en ese commit (se agregó después).
    }
  }
  if (hashes.size) history[f.path] = [...hashes].sort();
}

const next = JSON.stringify(history, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const same = existsSync(OUT) && readFileSync(OUT, "utf8") === next;
  console.log(same ? "Historial del kit al día" : "El historial del kit difiere: npx tsx scripts/kit-history.ts");
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, next);
console.log(`Escrito ${OUT}: ${Object.keys(history).length} archivos`);
