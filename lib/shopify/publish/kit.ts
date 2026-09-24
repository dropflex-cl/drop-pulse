// El tema de DropFlex como «kit» (docs/spec-tema-shopify.md §4): sus archivos, cuáles son del
// comerciante (nunca se pisan al actualizar) y qué hay que subir para dejar una tienda al día.
// `planUpdate` es puro (con tests); `readKit` lee el tema del repo.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import KIT_HISTORY from "./kit-history.json";

/** Huellas de las versiones anteriores de los archivos del comerciante (scripts/kit-history.ts). */
export const kitHistory: Record<string, string[]> = KIT_HISTORY;

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

/**
 * `history`: las huellas de las versiones anteriores del kit de cada archivo del comerciante
 * (kit-history.json, generado desde git). Un template igual a una versión nuestra anterior no lo
 * editó nadie: se actualiza. Uno distinto lo cambió el comerciante en el editor: no se toca.
 */
export function planUpdate(local: Pick<KitFile, "path" | "md5">[], remote: RemoteFile[], history: Record<string, string[]> = {}): UpdatePlan {
  const theirs = new Map(remote.map((r) => [r.path, r.md5]));
  const ours = new Set(local.map((f) => f.path));
  const plan: UpdatePlan = { upsert: [], restore: [], remove: [], unchanged: 0, skippedProtected: 0 };
  for (const f of local) {
    const remoteMd5 = theirs.get(f.path);
    if (isProtected(f.path)) {
      // Lo que falta se repone (Shopify lo descartó o lo borraron).
      if (!theirs.has(f.path)) plan.restore.push(f.path);
      else if (remoteMd5 === f.md5) plan.unchanged++;
      else if (remoteMd5 && history[f.path]?.includes(remoteMd5)) plan.upsert.push(f.path);
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
 * EasySell COD Form (el formulario de pago contra entrega): su app embed queda SIEMPRE encendido en
 * el tema de DropFlex, como en v1. Shopify guarda los app embeds por tema (settings_data ›
 * current.blocks): el kit lo trae encendido, la instalación lo normaliza y cada «Actualizar tema»
 * lo vuelve a encender. El uuid es el de la extensión de la app, el mismo en toda tienda.
 */
export const EASYSELL_EMBED = {
  id: "17754088914158789468",
  type: "shopify://apps/easysell-cod-form/blocks/app-embed/7bfd0a95-6839-4f02-b2ee-896832dbe67e",
} as const;
const isEasySell = (type: unknown) => typeof type === "string" && type.startsWith("shopify://apps/easysell-cod-form/");

/**
 * El settings_data con EasySell encendido: reusa el bloque que ya exista (el primero; los repetidos
 * se quitan) o agrega el del kit. Devuelve null si ya estaba encendido y solo, o si no es JSON.
 */
export function withEasySellOn(settings: string): string | null {
  try {
    const data = parseThemeJson(settings);
    if (!data || typeof data.current !== "object" || data.current === null) return null;
    const blocks: Record<string, { type?: string; disabled?: boolean }> = { ...(data.current.blocks ?? {}) };
    const ids = Object.keys(blocks).filter((id) => isEasySell(blocks[id]?.type));
    if (ids.length === 1 && blocks[ids[0]].disabled !== true) return null;
    if (ids.length) {
      blocks[ids[0]] = { ...blocks[ids[0]], disabled: false };
      for (const id of ids.slice(1)) delete blocks[id];
    } else {
      blocks[EASYSELL_EMBED.id] = { type: EASYSELL_EMBED.type, disabled: false, settings: {} } as { type: string; disabled: boolean };
    }
    data.current.blocks = blocks;
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/**
 * Copia los app embeds (EasySell, Loox, píxeles…) del tema publicado al settings_data del kit: viven
 * por tema, y sin esto quedan apagados en el tema nuevo. Los del kit mandan si ya existen, y
 * EasySell queda encendido (el del tema publicado, si lo tenía). Best effort: si falla, se instala igual.
 */
export function mergeAppEmbeds(kitSettings: string, liveSettings: string | null): string {
  let merged = kitSettings;
  if (liveSettings) {
    try {
      const kit = parseThemeJson(kitSettings);
      const live = parseThemeJson(liveSettings);
      const blocks = (live?.current?.blocks ?? {}) as Record<string, { type?: string }>;
      const embeds = Object.entries(blocks).filter(([, b]) => typeof b?.type === "string" && b.type.startsWith("shopify://apps/"));
      if (embeds.length && typeof kit.current === "object") {
        kit.current.blocks = { ...Object.fromEntries(embeds), ...(kit.current.blocks ?? {}) };
        merged = JSON.stringify(kit);
      }
    } catch {
      merged = kitSettings;
    }
  }
  return withEasySellOn(merged) ?? merged;
}

/** Los archivos del kit que no llegaron al tema (Shopify los descartó al importar). */
export function missingFromTheme(kitPaths: string[], remote: Set<string>): string[] {
  return kitPaths.filter((p) => !remote.has(p));
}
