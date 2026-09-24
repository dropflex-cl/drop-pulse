// El tema de DropFlex como «kit» (docs/spec-tema-shopify.md §4): sus archivos, cuáles son del
// comerciante (nunca se pisan al actualizar) y qué hay que subir para dejar una tienda al día.
// `planUpdate` es puro (con tests); `readKit` lee el tema del repo.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const KIT_THEME = "DropPulse";
export const KIT_DIR = join(process.cwd(), "lib", "shopify", "themes", KIT_THEME);
const FOLDERS = ["assets", "blocks", "config", "layout", "locales", "sections", "snippets", "templates"];

export interface KitFile {
  /** «sections/header.liquid». */
  path: string;
  data: Buffer;
  md5: string;
}

export interface Kit {
  files: KitFile[];
  /** Huella del código del tema (los archivos que se actualizan): cambia con cada cambio del kit. */
  version: string;
}

/**
 * Del comerciante: lo escribe el editor de temas (orden de secciones, grupos de header y pie, sus
 * ajustes). Una actualización nunca los toca; solo se reponen si faltan (principio 4 del spec).
 */
export function isProtected(path: string): boolean {
  return path.startsWith("templates/") || /^sections\/[^/]+\.json$/.test(path) || path === "config/settings_data.json";
}

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

let memo: Kit | null = null;

/** El kit del repo. En producción no cambia mientras corre la instancia: se lee una vez. */
export function readKit(dir = KIT_DIR): Kit {
  if (dir === KIT_DIR && memo && process.env.NODE_ENV === "production") return memo;
  const files: KitFile[] = [];
  for (const folder of FOLDERS) {
    const base = join(dir, folder);
    const walk = (d: string) => {
      for (const name of readdirSync(d).sort()) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else {
          const data = readFileSync(full);
          files.push({ path: relative(dir, full).split(sep).join("/"), data, md5: md5(data) });
        }
      }
    };
    walk(base);
  }
  const code = files.filter((f) => !isProtected(f.path)).map((f) => `${f.path}:${f.md5}`).join("\n");
  const kit = { files, version: md5(Buffer.from(code)).slice(0, 10) };
  if (dir === KIT_DIR) memo = kit;
  return kit;
}

export interface RemoteFile {
  path: string;
  md5: string | null;
}

export interface UpdatePlan {
  /** Código nuevo o distinto: se sube. */
  upsert: string[];
  /** Del comerciante y ausente en la tienda: se repone (un product.json que falta deja las fichas en 404). */
  restore: string[];
  /** Archivos df-* que ya no existen en el kit: se borran (un componente viejo no queda colgando). */
  remove: string[];
  unchanged: number;
  /** Del comerciante y presente: no se toca. */
  skippedProtected: number;
}

export function planUpdate(local: Pick<KitFile, "path" | "md5">[], remote: RemoteFile[]): UpdatePlan {
  const theirs = new Map(remote.map((r) => [r.path, r.md5]));
  const ours = new Set(local.map((f) => f.path));
  const plan: UpdatePlan = { upsert: [], restore: [], remove: [], unchanged: 0, skippedProtected: 0 };
  for (const f of local) {
    const remoteMd5 = theirs.get(f.path);
    if (isProtected(f.path)) {
      // Solo se repone lo que falta (Shopify lo descartó o lo borraron): lo presente nunca se pisa.
      if (!theirs.has(f.path)) plan.restore.push(f.path);
      else plan.skippedProtected++;
      continue;
    }
    if (remoteMd5 === f.md5) plan.unchanged++;
    else plan.upsert.push(f.path);
  }
  for (const r of remote) {
    const name = r.path.split("/").pop() ?? "";
    if (!ours.has(r.path) && name.startsWith("df-") && !isProtected(r.path)) plan.remove.push(r.path);
  }
  return plan;
}

/** Shopify antepone un comentario (barra-asterisco) a los JSON que guarda el editor: se quita. */
export const parseThemeJson = (text: string) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));

/**
 * Copia los app embeds (EasySell, Loox, píxeles…) del tema publicado al settings_data del kit: viven
 * por tema, y sin esto el formulario de pago contra entrega queda apagado en el tema nuevo. Los del
 * kit mandan si ya existen. Best effort: si falla, se instala igual.
 */
export function mergeAppEmbeds(kitSettings: string, liveSettings: string | null): string {
  if (!liveSettings) return kitSettings;
  try {
    const kit = parseThemeJson(kitSettings);
    const live = parseThemeJson(liveSettings);
    const blocks = (live?.current?.blocks ?? {}) as Record<string, { type?: string }>;
    const embeds = Object.entries(blocks).filter(([, b]) => typeof b?.type === "string" && b.type.startsWith("shopify://apps/"));
    if (!embeds.length || typeof kit.current !== "object") return kitSettings;
    kit.current.blocks = { ...Object.fromEntries(embeds), ...(kit.current.blocks ?? {}) };
    return JSON.stringify(kit);
  } catch {
    return kitSettings;
  }
}

/** Los archivos del kit que no llegaron al tema (Shopify los descartó al importar). */
export function missingFromTheme(kitPaths: string[], remote: Set<string>): string[] {
  return kitPaths.filter((p) => !remote.has(p));
}
