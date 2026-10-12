// El tema de DropFlex en la tienda, desde la etapa Publicar: instalar (en segundo plano, Shopify
// tarda en procesar el ZIP), actualizar y publicar. Lo largo corre con after(); el estado queda en
// shopify_theme_installations y la pantalla lo sondea.
import "server-only";
import { after } from "next/server";
import { getShopifyConnection, type ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { ProductApiError } from "@/lib/products/http";
import { PublishError } from "@/lib/shopify/publish/files";
import { readKit } from "@/lib/shopify/publish/kit";
import { getThemeInstallation, getThemeUpdateStatus, installTheme, markThemeFailed, previewUrl, publishTheme, syncThemeState, updateTheme, type ThemeInstallation } from "@/lib/shopify/publish/theme";
import { connectionProblem } from "./publish";

async function connection(userId: string) {
  const conn = await getShopifyConnection(userId);
  const problem = connectionProblem(conn);
  if (problem || !conn) throw new ProductApiError(problem ?? "Conecta tu tienda Shopify.", 409);
  return conn;
}

const message = (e: unknown) => (e instanceof PublishError ? e.message : "Shopify no pudo instalar el tema. Intenta de nuevo en unos minutos.");

export async function startThemeInstall(userId: string): Promise<void> {
  const conn = await connection(userId);
  const current = await getThemeInstallation(userId);
  if (current?.status === "installing" && Date.now() - Date.parse(current.updated_at) < 6 * 60_000) return;
  after(() =>
    installTheme(conn).catch(async (e) => {
      console.error("[theme/install]", e);
      await markThemeFailed(conn, message(e));
    }),
  );
}

export async function runThemeUpdate(userId: string) {
  const conn = await connection(userId);
  try {
    return await updateTheme(conn);
  } catch (e) {
    console.error("[theme/update]", e);
    throw new ProductApiError(e instanceof PublishError ? e.message : "No pudimos actualizar el tema. Intenta de nuevo.", 502);
  }
}

export async function runThemePublish(userId: string): Promise<ThemeInstallation> {
  const conn = await connection(userId);
  try {
    return await publishTheme(conn);
  } catch (e) {
    console.error("[theme/publish]", e);
    throw new ProductApiError(e instanceof PublishError ? e.message : "No pudimos publicar el tema. Intenta de nuevo.", 502);
  }
}

export interface ThemeView {
  status: ThemeInstallation["status"] | "none";
  name?: string;
  error?: string;
  previewUrl?: string;
  /** El tema necesita código nuevo o una transición de la plantilla de DropFlex. */
  outdated: boolean;
  /** No se pudo comprobar un destino seguro para actualizar. */
  updateError?: string;
}

const SYNC_EVERY_MS = 60_000;
const lastSync = new Map<string, number>();
const updateChecks = new Map<string, { key: string; until: number; result: Promise<{ outdated: boolean; updateError?: string }> }>();

function checkThemeUpdate(conn: ShopifyConnection, inst: ThemeInstallation) {
  const kit = readKit();
  const key = JSON.stringify([conn.shop_domain, inst.theme_gid, inst.kit_version, inst.updated_at, kit.version]);
  const cached = updateChecks.get(conn.user_id);
  if (cached?.key === key && cached.until > Date.now()) return cached.result;
  const result = getThemeUpdateStatus(conn, inst, kit).catch(error => {
    updateChecks.delete(conn.user_id);
    throw error;
  });
  // Caché breve y acotada: no repetir cientos de huellas durante el sondeo de publicación.
  if (updateChecks.size >= 100) updateChecks.delete(updateChecks.keys().next().value!);
  updateChecks.set(conn.user_id, { key, until: Date.now() + SYNC_EVERY_MS, result });
  return result;
}

/**
 * Si el comerciante publicó o borró el tema desde Shopify, se corrige después de responder (a lo más
 * una vez por minuto por instancia): la siguiente lectura o sondeo ya lo muestra, y Shopify no frena
 * la pantalla. Instalar, actualizar y publicar desde DropFlex guardan su estado ellos mismos.
 */
function scheduleThemeSync(conn: ShopifyConnection) {
  const now = Date.now();
  if (now - (lastSync.get(conn.user_id) ?? 0) < SYNC_EVERY_MS) return;
  lastSync.set(conn.user_id, now);
  after(() => syncThemeState(conn).then(() => undefined, (e) => console.error("[theme] sincronizar el estado", e)));
}

/** El tema para la pantalla, tal como está registrado (lo cambiado en Shopify se corrige en segundo plano). */
export async function themeView(userId: string): Promise<ThemeView> {
  const [conn, inst] = await Promise.all([getShopifyConnection(userId), getThemeInstallation(userId)]);
  if (conn && !connectionProblem(conn) && inst) scheduleThemeSync(conn);
  if (!inst || (conn && inst.shop_domain !== conn.shop_domain)) return { status: "none", outdated: false };
  let update: { outdated: boolean; updateError?: string } = { outdated: false };
  if (conn && !connectionProblem(conn) && inst.theme_gid && ["published", "preview"].includes(inst.status)) {
    try { update = await checkThemeUpdate(conn, inst); }
    catch (error) {
      console.error("[theme] comprobar actualización", error);
      update.updateError = "No pudimos consultar los archivos del tema en Shopify. Intenta de nuevo en unos minutos.";
    }
  }
  return {
    status: inst.status,
    name: inst.theme_name ?? undefined,
    error: inst.error_message ?? undefined,
    previewUrl: inst.theme_gid && inst.status !== "failed" ? previewUrl(inst.shop_domain, inst.theme_gid) : undefined,
    ...update,
  };
}
