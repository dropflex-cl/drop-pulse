// Reconoce solo código que existe en la historia ancestral de este checkout. Un servidor anterior
// no conoce huellas futuras y, por tanto, no puede usarlas como destino de una actualización.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isProtected, readKit } from "../lib/shopify/publish/kit";

const THEME = "lib/shopify/themes/DropPulse";
const KIT = "lib/shopify/publish/kit.ts";
const OUT = join(__dirname, "..", "lib/shopify/publish/kit-releases.json");
const git = (...args: string[]) => execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const md5 = (data: Buffer | string) => createHash("md5").update(data).digest("hex");
const commits = git("log", "--first-parent", "--reverse", "--format=%H", "--", THEME, KIT).toString().trim().split("\n");
const snapshots = commits.map(commit => {
  const files = git("ls-tree", "-r", commit, "--", THEME).toString().trim().split("\n").flatMap(line => {
    const match = /^\d+ blob ([a-f0-9]+)\t(.+)$/.exec(line);
    if (!match) return [];
    const path = match[2].slice(THEME.length + 1);
    return /^(assets|blocks|config|layout|locales|sections|snippets|templates)\//.test(path) && !isProtected(path) ? [{ path, blob: match[1] }] : [];
  });
  let source = "";
  try { source = git("show", `${commit}:${KIT}`).toString(); } catch { /* Antes de instalar kits. */ }
  const suffix = source.match(/version:\s*md5\(Buffer\.from\(`\$\{code\}([^`]*)`\)\)/)?.[1];
  return { files, transition: suffix?.replace(/\\n/g, "\n") ?? "" };
}).filter(snapshot => snapshot.files.length);
const blobs = [...new Set(snapshots.flatMap(s => s.files.map(f => f.blob)))];
const batch = execFileSync("git", ["cat-file", "--batch"], { input: blobs.join("\n") + "\n", maxBuffer: 256 * 1024 * 1024 });
const hashes = new Map<string, string>();
let offset = 0;
for (const blob of blobs) {
  const end = batch.indexOf(10, offset);
  const size = Number(batch.subarray(offset, end).toString().split(" ")[2]);
  if (!Number.isSafeInteger(size)) throw new Error(`No se pudo leer el objeto ${blob}`);
  hashes.set(blob, md5(batch.subarray(end + 1, end + 1 + size)));
  offset = end + size + 2;
}
const codeChecksums: Record<string, Set<string>> = {};
const versions = new Set<string>();
for (const snapshot of snapshots) {
  const files = snapshot.files.map(f => ({ path: f.path, md5: hashes.get(f.blob)! }));
  // El orden de readKit: carpetas ordenadas y recorrido lexicográfico dentro de cada carpeta.
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  versions.add(md5(files.map(f => `${f.path}:${f.md5}`).join("\n") + snapshot.transition).slice(0, 10));
  for (const f of files) (codeChecksums[f.path] ??= new Set()).add(f.md5);
}
const current = readKit();
versions.add(current.version);
for (const f of current.files.filter(f => !isProtected(f.path))) (codeChecksums[f.path] ??= new Set()).add(f.md5);
const next = JSON.stringify({ versions: [...versions].sort(), codeChecksums: Object.fromEntries(Object.entries(codeChecksums).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, values]) => [path, [...values].sort()])) }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== next) throw new Error("Regenera las huellas del tema con npm run shopify:components.");
  console.log("Huellas de versiones del tema al día");
} else {
  writeFileSync(OUT, next);
  console.log(`Versiones del tema: ${versions.size}; archivos reconocidos: ${Object.keys(codeChecksums).length}`);
}
