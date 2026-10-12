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
export const KIT_DIR = join(
  process.cwd(),
  "lib",
  "shopify",
  "themes",
  KIT_THEME,
);
const FOLDERS = [
  "assets",
  "blocks",
  "config",
  "layout",
  "locales",
  "sections",
  "snippets",
  "templates",
];

export interface KitFile {
  /** «sections/header.liquid». */
  path: string;
  data: Buffer;
  md5: string;
}

export interface Kit {
  files: KitFile[];
  /** Huella del código y las transiciones de plantilla que aplica Actualizar tema. */
  version: string;
}

/**
 * Del comerciante: lo escribe el editor de temas (orden de secciones, grupos de header y pie, sus
 * ajustes). Una actualización nunca los toca; solo se reponen si faltan (principio 4 del spec).
 */
export function isProtected(path: string): boolean {
  return (
    path.startsWith("templates/") ||
    /^sections\/[^/]+\.json$/.test(path) ||
    path === "config/settings_data.json"
  );
}

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

let memo: Kit | null = null;

/** El kit del repo. En producción no cambia mientras corre la instancia: se lee una vez. */
export function readKit(dir = KIT_DIR): Kit {
  if (dir === KIT_DIR && memo && process.env.NODE_ENV === "production")
    return memo;
  const files: KitFile[] = [];
  for (const folder of FOLDERS) {
    const base = join(dir, folder);
    const walk = (d: string) => {
      for (const name of readdirSync(d).sort()) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else {
          const data = readFileSync(full);
          files.push({
            path: relative(dir, full).split(sep).join("/"),
            data,
            md5: md5(data),
          });
        }
      }
    };
    walk(base);
  }
  const code = files
    .filter((f) => !isProtected(f.path))
    .map((f) => `${f.path}:${f.md5}`)
    .join("\n");
  // Esta transición también debe ofrecer Actualizar tema cuando el código ya está al día.
  const kit = {
    files,
    version: md5(Buffer.from(`${code}\npdp-intro:1\npdp-review-order:1`)).slice(0, 10),
  };
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
export function planUpdate(
  local: Pick<KitFile, "path" | "md5">[],
  remote: RemoteFile[],
  history: Record<string, string[]> = {},
): UpdatePlan {
  const theirs = new Map(remote.map((r) => [r.path, r.md5]));
  const ours = new Set(local.map((f) => f.path));
  const plan: UpdatePlan = {
    upsert: [],
    restore: [],
    remove: [],
    unchanged: 0,
    skippedProtected: 0,
  };
  for (const f of local) {
    const remoteMd5 = theirs.get(f.path);
    if (isProtected(f.path)) {
      // Lo que falta se repone (Shopify lo descartó o lo borraron).
      if (!theirs.has(f.path)) plan.restore.push(f.path);
      else if (remoteMd5 === f.md5) plan.unchanged++;
      else if (remoteMd5 && history[f.path]?.includes(remoteMd5))
        plan.upsert.push(f.path);
      else plan.skippedProtected++;
      continue;
    }
    if (remoteMd5 === f.md5) plan.unchanged++;
    else plan.upsert.push(f.path);
  }
  for (const r of remote) {
    const name = r.path.split("/").pop() ?? "";
    if (!ours.has(r.path) && name.startsWith("df-") && !isProtected(r.path))
      plan.remove.push(r.path);
  }
  return plan;
}

/** Shopify antepone un comentario (barra-asterisco) a los JSON que guarda el editor: se quita. */
export const parseThemeJson = (text: string) =>
  JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));

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
const isEasySell = (type: unknown) =>
  typeof type === "string" &&
  type.startsWith("shopify://apps/easysell-cod-form/");

/**
 * El settings_data con EasySell encendido: reusa el bloque que ya exista (el primero; los repetidos
 * se quitan) o agrega el del kit. Devuelve null si ya estaba encendido y solo, o si no es JSON.
 */
export function withEasySellOn(settings: string): string | null {
  try {
    const data = parseThemeJson(settings);
    if (!data || typeof data.current !== "object" || data.current === null)
      return null;
    const blocks: Record<string, { type?: string; disabled?: boolean }> = {
      ...(data.current.blocks ?? {}),
    };
    const ids = Object.keys(blocks).filter((id) =>
      isEasySell(blocks[id]?.type),
    );
    if (ids.length === 1 && blocks[ids[0]].disabled !== true) return null;
    if (ids.length) {
      blocks[ids[0]] = { ...blocks[ids[0]], disabled: false };
      for (const id of ids.slice(1)) delete blocks[id];
    } else {
      blocks[EASYSELL_EMBED.id] = {
        type: EASYSELL_EMBED.type,
        disabled: false,
        settings: {},
      } as { type: string; disabled: boolean };
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
export function mergeAppEmbeds(
  kitSettings: string,
  liveSettings: string | null,
): string {
  let merged = kitSettings;
  if (liveSettings) {
    try {
      const kit = parseThemeJson(kitSettings);
      const live = parseThemeJson(liveSettings);
      const blocks = (live?.current?.blocks ?? {}) as Record<
        string,
        { type?: string }
      >;
      const embeds = Object.entries(blocks).filter(
        ([, b]) =>
          typeof b?.type === "string" && b.type.startsWith("shopify://apps/"),
      );
      if (embeds.length && typeof kit.current === "object") {
        kit.current.blocks = {
          ...Object.fromEntries(embeds),
          ...(kit.current.blocks ?? {}),
        };
        merged = JSON.stringify(kit);
      }
    } catch {
      merged = kitSettings;
    }
  }
  return withEasySellOn(merged) ?? merged;
}

/** Los archivos del kit que no llegaron al tema (Shopify los descartó al importar). */
export function missingFromTheme(
  kitPaths: string[],
  remote: Set<string>,
): string[] {
  return kitPaths.filter((p) => !remote.has(p));
}

interface ProductBlock {
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
  blocks?: Record<string, ProductBlock>;
  block_order?: string[];
}

/** Migra una vez la ficha DropFlex anterior; conserva ajustes, bloques ajenos y apagados. */
export function withPdpIntro(
  remote: string,
  kitTemplate: string,
): string | null {
  try {
    const data = parseThemeJson(remote),
      kit = parseThemeJson(kitTemplate);
    if (!data?.sections || !kit?.sections) return null;
    const findDetails = (sections: Record<string, ProductBlock> = {}) => {
      const mains = Object.values(sections).filter(
        (s) => s.type === "product-information",
      );
      if (mains.length !== 1) return undefined;
      const details = Object.values(mains[0].blocks ?? {}).filter(
        (b) => b.type === "_product-details",
      );
      return details.length === 1 ? details[0] : undefined;
    };
    const details = findDetails(data.sections),
      defaults = findDetails(kit.sections);
    if (
      !details?.blocks ||
      !Array.isArray(details.block_order) ||
      !defaults?.blocks ||
      !defaults.blocks.google_rating ||
      !defaults.blocks.gallery_benefits ||
      !defaults.blocks.review_stars ||
      !defaults.blocks.stars_row?.blocks?.event_badges
    )
      return null;
    const blocks = details.blocks;
    const idOf = (type: string) => {
      const ids = Object.keys(blocks).filter((id) => blocks[id].type === type);
      return ids.length === 1 ? ids[0] : undefined;
    };
    // La presencia de los dos bloques nuevos marca la transición. Un orden editado después se conserva.
    if (
      Object.values(blocks).some((b) =>
        ["df-google-rating", "df-gallery-benefits"].includes(b.type),
      )
    )
      return null;
    const title = idOf("df-title"),
      subtitle = idOf("df-subtitle"),
      packs = idOf("df-pack-offers");
    if (!title || !subtitle || !packs || !idOf("buy-buttons")) return null;
    // Solo reconocemos el group del kit anterior, no grupos personalizados con contenido ajeno.
    const groups = Object.entries(blocks).filter(
      ([, b]) =>
        b.type === "group" &&
        Object.values(b.blocks ?? {}).some(
          (child) => child.type === "df-review-stars",
        ) &&
        Object.values(b.blocks ?? {}).every((child) =>
          [
            "df-review-stars",
            "df-hype-badge",
            "df-social-badge",
            "df-event-badges",
          ].includes(child.type),
        ),
    );
    if (
      groups.length !== 1 ||
      Object.values(blocks).some((b) => b.type === "df-review-stars")
    )
      return null;
    const [badgesId, badges] = groups[0];
    if (
      [title, subtitle, packs, badgesId].some(
        (id) => !details.block_order!.includes(id),
      )
    )
      return null;
    const reviewIds = Object.keys(badges.blocks!).filter(
      (id) => badges.blocks![id].type === "df-review-stars",
    );
    if (reviewIds.length !== 1 || !badges.block_order?.includes(reviewIds[0]))
      return null;
    const freshId = (base: string, siblings: Record<string, ProductBlock>) => {
      let id = base;
      while (Object.hasOwn(siblings, id)) id += "_df";
      return id;
    };
    const reviewId = freshId(reviewIds[0], blocks);
    const review = badges.blocks![reviewIds[0]];
    blocks[reviewId] = {
      ...review,
      ...(badges.disabled === true || defaults.blocks.review_stars.disabled === true ? { disabled: true } : {}),
      settings: {
        ...review.settings,
        ...defaults.blocks.review_stars.settings,
      },
    };
    delete badges.blocks![reviewIds[0]];
    badges.block_order = (badges.block_order ?? []).filter(
      (id) => id !== reviewIds[0],
    );
    const socialId = idOf("df-social-badge");
    if (
      socialId &&
      details.block_order.includes(socialId) &&
      !Object.values(badges.blocks!).some((b) => b.type === "df-social-badge")
    ) {
      const nestedId = freshId(socialId, badges.blocks!);
      badges.blocks![nestedId] = blocks[socialId];
      badges.block_order.push(nestedId);
      delete blocks[socialId];
    }
    if (
      !Object.values(badges.blocks!).some((b) => b.type === "df-event-badges")
    ) {
      const eventId = freshId("event_badges", badges.blocks!);
      badges.blocks![eventId] = structuredClone(
        defaults.blocks.stars_row.blocks!.event_badges,
      );
      badges.block_order.unshift(eventId);
    }
    badges.settings = {
      ...badges.settings,
      gap: defaults.blocks.stars_row.settings!.gap,
      vertical_on_mobile:
        defaults.blocks.stars_row.settings!.vertical_on_mobile,
    };
    const googleId = freshId("google_rating", blocks),
      benefitsId = freshId("gallery_benefits", blocks);
    blocks[googleId] = structuredClone(defaults.blocks.google_rating);
    blocks[benefitsId] = structuredClone(defaults.blocks.gallery_benefits);
    const intro = [
      googleId,
      reviewId,
      badgesId,
      title,
      subtitle,
      benefitsId,
      packs,
    ];
    const candidateProof = idOf("df-social-proof");
    const proofId =
      candidateProof && details.block_order.includes(candidateProof)
        ? candidateProof
        : undefined;
    const remaining = details.block_order.filter(
      (id) => blocks[id] && !intro.includes(id) && id !== proofId,
    );
    if (proofId) {
      const ugc = idOf("df-ugc-slider");
      const index = ugc ? remaining.indexOf(ugc) : -1;
      remaining.splice(index >= 0 ? index + 1 : remaining.length, 0, proofId);
    }
    details.block_order = [...intro, ...remaining];
    return JSON.stringify(data);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** Invierte el grupo anterior de reseñas del kit sin tocar ajustes ni órdenes personalizados. */
export function withPdpReviewOrder(remote: string): string | null {
  let data;
  try { data = parseThemeJson(remote); }
  catch (error) { if (error instanceof SyntaxError) return null; throw error; }
  if (!data?.sections) return null;
  let changed = false;
  for (const main of Object.values(data.sections) as ProductBlock[]) {
    if (main.type !== "product-information") continue;
    for (const details of Object.values(main.blocks ?? {})) {
      if (details.type !== "_product-details" || !details.blocks || !Array.isArray(details.block_order)) continue;
      const order = details.block_order;
      if (["df-review-slider", "df-social-proof"].some(type => order.filter(id => details.blocks![id]?.type === type).length !== 1)) continue;
      const index = order.findIndex(id => details.blocks![id]?.type === "df-review-slider");
      if (index < 0) continue;
      const proofIndex = details.blocks[order[index + 1]]?.type === "df-social-proof" ? index + 1
        : details.blocks[order[index + 1]]?.type === "df-ugc-slider" && details.blocks[order[index + 2]]?.type === "df-social-proof" ? index + 2 : -1;
      if (proofIndex < 0) continue;
      const [proof] = order.splice(proofIndex, 1);
      order.splice(index, 0, proof);
      changed = true;
    }
  }
  return changed ? JSON.stringify(data) : null;
}

/** Agrega las nuevas secciones a plantillas DropFlex personalizadas sin cambiar sus ajustes. */
export function withPdpSections(
  remote: string,
  kitTemplate: string,
): string | null {
  try {
    const data = parseThemeJson(remote),
      kit = parseThemeJson(kitTemplate);
    if (!data?.sections || !Array.isArray(data.order) || !kit?.sections)
      return null;
    if (
      !Object.values(data.sections).some(
        (s) => (s as { type?: string }).type === "product-information",
      )
    )
      return null;
    const newTypes = new Set([
      "df-product-includes",
      "df-usage-steps",
      "df-use-cases",
      "df-before-after",
      "df-results-timeline",
      "df-customer-stories",
      "df-expert-endorsement",
      "df-mechanism",
      "df-guarantee",
      "df-offer-summary",
    ]);
    const present = new Set(
      Object.values(data.sections).map((s) => (s as { type?: string }).type),
    );
    let changed = false;
    for (const key of kit.order) {
      const section = kit.sections[key];
      if (!newTypes.has(section.type) || present.has(section.type)) continue;
      let id = key;
      while (Object.hasOwn(data.sections, id)) id += "_df";
      const previous = kit.order
        .slice(0, kit.order.indexOf(key))
        .reverse()
        .find((k: string) =>
          data.order.some(
            (id: string) => data.sections[id]?.type === kit.sections[k].type,
          ),
        );
      const anchor = previous
        ? data.order.findIndex(
            (id: string) =>
              data.sections[id]?.type === kit.sections[previous].type,
          )
        : data.order.length - 1;
      data.sections[id] = section;
      data.order.splice(anchor + 1, 0, id);
      present.add(section.type);
      changed = true;
    }
    if (Object.keys(data.sections).length > 25)
      throw new Error(
        "La plantilla supera las 25 secciones de Shopify. Quita secciones duplicadas antes de actualizar la PDP.",
      );
    return changed ? JSON.stringify(data) : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
