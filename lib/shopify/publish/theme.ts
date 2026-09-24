// El tema de DropFlex en la tienda del comerciante (docs/spec-tema-shopify.md §4): instalar sin
// publicar (vista previa), actualizar solo el código que cambió, publicar con un toque explícito.
// Idempotente: instalar dos veces retoma; actualizar una tienda al día no escribe nada.
import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { shopifyMutation, shopifyQuery } from "@/lib/integrations/shopify/client";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { assertNoUserErrors, PublishError, stageUploads } from "./files";
import { isProtected, kitHistory, mergeAppEmbeds, missingFromTheme, planUpdate, readKit, withEasySellOn, type Kit, type RemoteFile } from "./kit";
import { zip } from "./zip";

export type ThemeStatus = "installing" | "preview" | "published" | "failed";

export interface ThemeInstallation {
  user_id: string;
  shop_domain: string;
  theme_gid: string | null;
  theme_name: string | null;
  kit_version: string | null;
  status: ThemeStatus;
  error_message: string | null;
  published_at: string | null;
  updated_at: string;
}

const TABLE = "shopify_theme_installations";
const THEME_PREFIX = "DropFlex ";

export async function getThemeInstallation(userId: string): Promise<ThemeInstallation | null> {
  const { data, error } = await adminClient().from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Leer el tema instalado: ${error.message}`);
  return (data as ThemeInstallation | null) ?? null;
}

async function saveInstallation(userId: string, patch: Partial<ThemeInstallation> & { shop_domain: string; status: ThemeStatus }) {
  const { error } = await adminClient()
    .from(TABLE)
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Guardar el tema instalado: ${error.message}`);
}

/** «gid://shopify/OnlineStoreTheme/123» → vista previa en la tienda. */
export const previewUrl = (shop: string, themeGid: string) => `https://${shop}/?preview_theme_id=${themeGid.split("/").pop()}`;

// ---------------------------------------------------------------- Lecturas del tema remoto

const THEMES = /* GraphQL */ `
  query Themes {
    themes(first: 50) { nodes { id name role processing processingFailed } }
  }
`;

interface RemoteTheme {
  id: string;
  name: string;
  role: string;
  processing: boolean;
  processingFailed: boolean;
}

async function listThemes(conn: ShopifyConnection): Promise<RemoteTheme[]> {
  return (await shopifyQuery<{ themes: { nodes: RemoteTheme[] } }>(conn, THEMES)).themes.nodes;
}

const THEME_FILES = /* GraphQL */ `
  query ThemeFiles($id: ID!, $after: String) {
    theme(id: $id) {
      files(first: 250, after: $after) {
        nodes { filename checksumMd5 }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

async function remoteFiles(conn: ShopifyConnection, themeGid: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let after: string | null = null;
  for (;;) {
    const res: { theme: { files: { nodes: { filename: string; checksumMd5: string | null }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } =
      await shopifyQuery(conn, THEME_FILES, { id: themeGid, after });
    if (!res.theme) throw new PublishError("El tema de DropFlex ya no está en tu tienda. Instálalo de nuevo.");
    out.push(...res.theme.files.nodes.map((n) => ({ path: n.filename, md5: n.checksumMd5 })));
    if (!res.theme.files.pageInfo.hasNextPage) return out;
    after = res.theme.files.pageInfo.endCursor;
  }
}

const FILE_BODY = /* GraphQL */ `
  query FileBody($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      files(filenames: $names, first: 1) {
        nodes {
          body {
            ... on OnlineStoreThemeFileBodyText { content }
            ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
            ... on OnlineStoreThemeFileBodyUrl { url }
          }
        }
      }
    }
  }
`;

/** El texto de un archivo del tema (TEXT, BASE64 o URL: Shopify usa los tres, spec principio 10). */
async function readThemeFile(conn: ShopifyConnection, themeGid: string, name: string): Promise<string | null> {
  const res = await shopifyQuery<{ theme: { files: { nodes: { body: { content?: string; contentBase64?: string; url?: string } }[] } } | null }>(conn, FILE_BODY, {
    id: themeGid,
    names: [name],
  });
  const body = res.theme?.files.nodes[0]?.body;
  if (!body) return null;
  if (body.content != null) return body.content;
  if (body.contentBase64 != null) return Buffer.from(body.contentBase64, "base64").toString("utf8");
  if (body.url) {
    const r = await fetch(body.url, { signal: AbortSignal.timeout(15_000) });
    return r.ok ? r.text() : null;
  }
  return null;
}

// ---------------------------------------------------------------- Instalar

const THEME_CREATE = /* GraphQL */ `
  mutation ThemeCreate($source: URL!, $name: String!) {
    themeCreate(source: $source, name: $name) {
      theme { id name }
      userErrors { field message }
    }
  }
`;

const THEME_DELETE = /* GraphQL */ `
  mutation ThemeDelete($id: ID!) {
    themeDelete(id: $id) { deletedThemeId userErrors { field message } }
  }
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea el tema sin publicar desde un ZIP en memoria (subida preparada, sin URL pública) y espera a
 * que Shopify lo procese. Si ya hay uno de esta versión, no crea otro. Largo: correr con after().
 */
export async function installTheme(conn: ShopifyConnection, kit: Kit = readKit()): Promise<ThemeInstallation> {
  const current = await getThemeInstallation(conn.user_id);
  const themes = await listThemes(conn);
  if (current?.theme_gid && current.shop_domain === conn.shop_domain && current.status !== "failed") {
    const still = themes.find((t) => t.id === current.theme_gid);
    if (still && !still.processingFailed) return current;
  }

  // La biblioteca admite 20 temas: se borran solo temas de DropFlex sin publicar, nunca uno del comerciante.
  if (themes.length >= 20) {
    const ours = themes.filter((t) => t.name.startsWith(THEME_PREFIX) && t.role !== "MAIN" && t.id !== current?.theme_gid);
    for (const t of ours.slice(0, themes.length - 19)) {
      const del = await shopifyMutation<{ themeDelete: { userErrors: { message: string }[] } }>(conn, THEME_DELETE, { id: t.id });
      assertNoUserErrors("Liberar espacio de temas", del.themeDelete.userErrors);
    }
    if (themes.length - ours.length >= 20) throw new PublishError("Tu tienda ya tiene 20 temas. Borra uno que no uses en Shopify y vuelve a intentar.");
  }

  const main = themes.find((t) => t.role === "MAIN");
  const liveSettings = main ? await readThemeFile(conn, main.id, "config/settings_data.json").catch(() => null) : null;
  const entries = kit.files.map((f) =>
    f.path === "config/settings_data.json" ? { name: f.path, data: Buffer.from(mergeAppEmbeds(f.data.toString("utf8"), liveSettings)) } : { name: f.path, data: f.data },
  );
  const archive = zip(entries);
  const name = `${THEME_PREFIX}${kit.version}`;
  const [source] = await stageUploads(conn, "FILE", [{ filename: `${name.replace(/\s+/g, "-")}.zip`, mimeType: "application/zip", data: archive }]);
  const created = await shopifyMutation<{ themeCreate: { theme: { id: string; name: string } | null; userErrors: { message: string }[] } }>(conn, THEME_CREATE, { source, name });
  assertNoUserErrors("Crear el tema", created.themeCreate.userErrors);
  const theme = created.themeCreate.theme;
  if (!theme) throw new PublishError("Shopify no creó el tema. Intenta de nuevo.");
  await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, theme_gid: theme.id, theme_name: theme.name, kit_version: kit.version, status: "installing", error_message: null });

  // Shopify procesa el ZIP en segundo plano: hasta 5 minutos.
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    await sleep(3000);
    const t = (await listThemes(conn)).find((x) => x.id === theme.id);
    if (!t || t.processingFailed) return fail(conn, "Shopify no pudo procesar el tema. Intenta instalarlo de nuevo.");
    if (!t.processing) break;
    if (Date.now() > deadline) return fail(conn, "Shopify tardó demasiado en procesar el tema. Revisa en unos minutos.");
  }
  // Un archivo inválido se descarta en silencio y se lleva los templates que lo usan (sin
  // templates/product.json, todas las fichas dan 404): se verifica el kit completo.
  const files = new Set((await remoteFiles(conn, theme.id)).map((f) => f.path));
  const lost = missingFromTheme(kit.files.map((f) => f.path), files);
  if (lost.length) {
    console.error("[theme/install] Shopify descartó", lost);
    return fail(conn, `Shopify rechazó ${lost.length === 1 ? "un archivo" : `${lost.length} archivos`} del tema (${lost.slice(0, 4).join(", ")}${lost.length > 4 ? "…" : ""}). No lo publiques; avísanos para revisarlo.`);
  }

  await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status: "preview", error_message: null });
  return (await getThemeInstallation(conn.user_id))!;
}

async function fail(conn: ShopifyConnection, message: string): Promise<ThemeInstallation> {
  await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status: "failed", error_message: message });
  return (await getThemeInstallation(conn.user_id))!;
}

export async function markThemeFailed(conn: ShopifyConnection, message: string) {
  await fail(conn, message);
}

// ---------------------------------------------------------------- Actualizar

const FILES_UPSERT = /* GraphQL */ `
  mutation FilesUpsert($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $id, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

const FILES_DELETE = /* GraphQL */ `
  mutation FilesDelete($id: ID!, $files: [String!]!) {
    themeFilesDelete(themeId: $id, files: $files) {
      deletedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

const TEXT = /\.(liquid|json|css|js|svg|txt|md)$/;

export interface ThemeUpdateResult {
  upserted: number;
  restored: number;
  removed: number;
}

const SETTINGS = "config/settings_data.json";

/**
 * settings_data va aparte y al final: si toca subir el del kit, conserva los app embeds del tema
 * (EasySell, Loox, píxeles); y en cada actualización EasySell queda encendido (kit.ts ›
 * withEasySellOn), aunque el archivo sea del comerciante. Encender EasySell es best effort.
 */
async function updateSettings(conn: ShopifyConnection, themeGid: string, kitSettings: string | null) {
  const remote = await readThemeFile(conn, themeGid, SETTINGS).catch(() => null);
  const base = kitSettings ? mergeAppEmbeds(kitSettings, remote) : remote;
  if (!base) return;
  const body = withEasySellOn(base) ?? base;
  if (body === remote) return;
  try {
    const res = await shopifyMutation<{ themeFilesUpsert: { userErrors: { message: string }[] } }>(conn, FILES_UPSERT, {
      id: themeGid,
      files: [{ filename: SETTINGS, body: { type: "TEXT", value: body } }],
    });
    assertNoUserErrors("Actualizar la configuración del tema", res.themeFilesUpsert.userErrors);
  } catch (e) {
    if (kitSettings) throw e;
    console.error("[theme/update] no se pudo encender EasySell", e);
  }
}

/** Sube solo el código que cambió (y repone lo del comerciante que falte), de a 50 archivos. */
export async function updateTheme(conn: ShopifyConnection, kit: Kit = readKit()): Promise<ThemeUpdateResult> {
  const inst = await getThemeInstallation(conn.user_id);
  if (!inst?.theme_gid) throw new PublishError("Primero instala el tema de DropFlex.");
  const plan = planUpdate(kit.files, await remoteFiles(conn, inst.theme_gid), kitHistory);
  const byPath = new Map(kit.files.map((f) => [f.path, f]));
  // Primero el código y al final los archivos del comerciante: un template nuevo puede usar un bloque
  // que llega en esta misma actualización.
  const toSend = [...plan.upsert, ...plan.restore].filter((p) => p !== SETTINGS).sort((a, b) => Number(isProtected(a)) - Number(isProtected(b)));
  for (let i = 0; i < toSend.length; i += 50) {
    const files = toSend.slice(i, i + 50).map((path) => {
      const f = byPath.get(path)!;
      return { filename: path, body: TEXT.test(path) ? { type: "TEXT", value: f.data.toString("utf8") } : { type: "BASE64", value: f.data.toString("base64") } };
    });
    const res = await shopifyMutation<{ themeFilesUpsert: { userErrors: { message: string }[] } }>(conn, FILES_UPSERT, { id: inst.theme_gid, files });
    assertNoUserErrors("Actualizar el tema", res.themeFilesUpsert.userErrors);
  }
  await updateSettings(conn, inst.theme_gid, [...plan.upsert, ...plan.restore].includes(SETTINGS) ? byPath.get(SETTINGS)?.data.toString("utf8") ?? null : null);
  if (plan.remove.length) {
    const res = await shopifyMutation<{ themeFilesDelete: { userErrors: { message: string }[] } }>(conn, FILES_DELETE, { id: inst.theme_gid, files: plan.remove });
    assertNoUserErrors("Quitar archivos viejos del tema", res.themeFilesDelete.userErrors);
  }
  await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status: inst.status, kit_version: kit.version, error_message: null });
  return { upserted: plan.upsert.length, restored: plan.restore.length, removed: plan.remove.length };
}

// ---------------------------------------------------------------- Publicar

const THEME_PUBLISH = /* GraphQL */ `
  mutation ThemePublish($id: ID!) {
    themePublish(id: $id) { theme { id role } userErrors { field message } }
  }
`;

/** Lo hace visible a los compradores. Solo tras la confirmación explícita del comerciante. */
export async function publishTheme(conn: ShopifyConnection): Promise<ThemeInstallation> {
  const inst = await getThemeInstallation(conn.user_id);
  if (!inst?.theme_gid || inst.status === "installing" || inst.status === "failed") throw new PublishError("El tema todavía no está listo para publicar.");
  if (inst.status === "published") return inst;
  const res = await shopifyMutation<{ themePublish: { userErrors: { message: string }[] } }>(conn, THEME_PUBLISH, { id: inst.theme_gid });
  assertNoUserErrors("Publicar el tema", res.themePublish.userErrors);
  await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status: "published", published_at: new Date().toISOString(), error_message: null });
  return (await getThemeInstallation(conn.user_id))!;
}

/**
 * Lo que la pantalla necesita saber del tema, mirando la tienda: si lo borraron o si el comerciante
 * publicó otro tema desde Shopify, el registro se corrige.
 */
export async function syncThemeState(conn: ShopifyConnection): Promise<ThemeInstallation | null> {
  const inst = await getThemeInstallation(conn.user_id);
  if (!inst?.theme_gid || inst.shop_domain !== conn.shop_domain || inst.status === "installing") return inst;
  const t = (await listThemes(conn)).find((x) => x.id === inst.theme_gid);
  if (!t) {
    await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status: "failed", error_message: "El tema de DropFlex ya no está en tu tienda. Instálalo de nuevo." });
  } else {
    const status: ThemeStatus = t.role === "MAIN" ? "published" : "preview";
    if (status !== inst.status) await saveInstallation(conn.user_id, { shop_domain: conn.shop_domain, status, published_at: status === "published" ? new Date().toISOString() : null });
  }
  return getThemeInstallation(conn.user_id);
}
