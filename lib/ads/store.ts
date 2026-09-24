import "server-only";
import { randomUUID } from "node:crypto";
import { approvedBriefs } from "@/lib/pipeline/copy";
import { adminClient } from "@/lib/integrations/admin";
import { getMetaConnection, type MetaConnection } from "@/lib/integrations/meta/connection";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { activeComponents, currentContent } from "@/lib/copy/store";
import { getPricingPlan } from "@/lib/pricing/store";
import { ProductApiError } from "@/lib/products/http";
import { getMarket } from "@/lib/settings/market";
import type { ProductRow } from "@/lib/products/store";
import type { AdMedia, AdTemplate } from "@/lib/types";
import { buildPreset, DEFAULT_PRESET, type PresetKey } from "./presets";
import { STRUCTURES, engineSchema, launchSchema, type EngineConfig, type LaunchConfig, type Structure } from "./schemas";
import { defaultTexts } from "./texts";
import { type MediaRatio, FORMAT_ERROR, MAX_IMAGE_BYTES, MAX_MEDIA_PER_PRODUCT, MAX_VIDEO_BYTES, RATIO_ERROR, ratioOf, sniffMedia } from "./media";

// Lecturas y escrituras de la etapa Anuncios (docs/spec-anuncios.md §8). Siempre con service_role
// filtrando por el dueño. La configuración vive en la campaña: el borrador es una fila de ad_campaigns
// con status `draft`.

export const AD_MEDIA_BUCKET = "ad-media";
const SIGNED_URL_TTL_S = 60 * 60;

export function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export interface CampaignRow {
  id: string;
  user_id: string;
  product_id: string;
  ad_account_id: string | null;
  meta_campaign_id: string | null;
  name: string;
  structure: Structure;
  template_key: string | null;
  template_id: string | null;
  status: "draft" | "launching" | "paused" | "active" | "failed" | "archived";
  launch: LaunchConfig;
  engine: EngineConfig;
  daily_budget: number | null;
  currency: string;
  timezone: string;
  source_campaign_id: string | null;
  meta_objects: { level: "campaign" | "adset" | "creative" | "ad"; id: string }[];
  progress: { step: string; done: number; total: number } | null;
  error: string | null;
  launched_at: string | null;
  starts_at: string | null;
  published_at: string | null;
  last_delivery_at: string | null;
  last_changed_at: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaRow {
  id: string;
  user_id: string;
  product_id: string;
  kind: "image" | "video";
  name: string;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  ratio: MediaRatio | null;
  duration_s: number | null;
  size_bytes: number;
  position: number;
  ad_account_id: string | null;
  meta_image_hash: string | null;
  meta_video_id: string | null;
  thumbnail_hash: string | null;
  status: "uploading" | "processing" | "ready" | "error";
  error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- Contexto del producto

export interface AdsContext {
  meta: MetaConnection | null;
  /** Cuenta, página y píxel elegidos. */
  metaReady: boolean;
  currency: string;
  timezone: string;
  country: string;
  /** CPA límite por defecto: el CPA máximo del producto (equilibrio), o el límite escrito a mano. */
  cpaLimit: number | null;
  spendCap: number | null;
  freeShipping: boolean;
  productUrl: string | null;
  texts: Pick<LaunchConfig, "primary_texts" | "headlines" | "description">;
}

async function merchantSettings(userId: string): Promise<{ ad_daily_spend_cap: number | null; free_shipping: boolean }> {
  const { data, error } = await adminClient().from("merchant_settings").select("ad_daily_spend_cap, free_shipping").eq("user_id", userId).maybeSingle();
  fail("Leer los ajustes", error);
  const row = data as { ad_daily_spend_cap: number | string | null; free_shipping: boolean } | null;
  return { ad_daily_spend_cap: row?.ad_daily_spend_cap == null ? null : Number(row.ad_daily_spend_cap), free_shipping: row?.free_shipping ?? true };
}


export async function adsContext(userId: string, product: ProductRow): Promise<AdsContext> {
  const [meta, shop, pricing, settings, briefs, items] = await Promise.all([
    getMetaConnection(userId),
    getShopifyConnection(userId),
    getPricingPlan(userId, product.id),
    merchantSettings(userId),
    approvedBriefs(userId, product.id),
    activeComponents(userId, [product.id]),
  ]);
  const { market } = await getMarket(userId, shop);
  const listingRow = (items.get(product.id) ?? []).find((r) => r.component === LISTING && r.status === "approved");
  const listing = listingRow ? (currentContent(listingRow) as Listing) : null;
  const hooks = briefs ? (["primary", "secondary"] as const).map((r) => briefs[r].payload?.hooks[briefs[r].payload?.recommended_hook ?? 0]?.text ?? "") : [];
  const cpaLimit = pricing?.maxCpa && pricing.maxCpa > 0 ? pricing.maxCpa : pricing?.purchaseCostLimit && pricing.purchaseCostLimit > 0 ? pricing.purchaseCostLimit : null;
  return {
    meta,
    metaReady: Boolean(meta?.status === "connected" && meta.ad_account_id && meta.page_id && meta.pixel_id),
    currency: meta?.ad_account_currency?.trim() || product.currency,
    timezone: market.timezone ?? "America/Santiago",
    country: market.countryCode,
    cpaLimit,
    spendCap: settings.ad_daily_spend_cap,
    freeShipping: settings.free_shipping,
    productUrl: shop?.shop_domain && product.handle ? `https://${shop.shop_domain}/products/${product.handle}` : null,
    texts: defaultTexts({ hooks, offerLine: listing?.offer_line ?? null, shortName: listing?.short_name ?? null, title: product.title, freeShipping: settings.free_shipping }),
  };
}

/** La configuración de una plantilla del sistema para este producto. */
export function presetFor(key: PresetKey, ctx: AdsContext, creatives: string[] = []) {
  return buildPreset(key, { country: ctx.country, currency: ctx.currency, cpaLimit: ctx.cpaLimit ?? 1, creatives, texts: ctx.texts });
}

// ---------------------------------------------------------------- Campañas

export async function listCampaignRows(userId: string, productId?: string): Promise<CampaignRow[]> {
  let q = adminClient().from("ad_campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  fail("Leer las campañas", error);
  return (data ?? []) as CampaignRow[];
}

export async function getCampaignRow(userId: string, id: string): Promise<CampaignRow | null> {
  const { data, error } = await adminClient().from("ad_campaigns").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  fail("Leer la campaña", error);
  return data as CampaignRow | null;
}

/** El borrador abierto del producto (el de la campaña de testeo, no el de una CBO de ganadores). */
export async function getDraft(userId: string, productId: string, sourceCampaignId: string | null = null): Promise<CampaignRow | null> {
  let q = adminClient().from("ad_campaigns").select("*").eq("user_id", userId).eq("product_id", productId).in("status", ["draft", "launching"]);
  q = sourceCampaignId ? q.eq("source_campaign_id", sourceCampaignId) : q.is("source_campaign_id", null);
  const { data, error } = await q.maybeSingle();
  fail("Leer el borrador", error);
  return data as CampaignRow | null;
}

export interface DraftInput {
  name: string;
  structure: Structure;
  template_key: string | null;
  template_id: string | null;
  launch: LaunchConfig;
  engine: EngineConfig;
}

/**
 * Guarda el borrador. La forma se valida (cada campo con su tipo), pero no lo que falta para lanzar:
 * un borrador puede estar a medias. Lo completo se valida al lanzar (lib/ads/validate.ts).
 */
export function parseDraft(body: Partial<DraftInput>): DraftInput {
  const structure = STRUCTURES.find((s) => s === body.structure);
  if (!structure) throw new ProductApiError("Elige ABO o CBO.", 400, "structure");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const lax = laxLaunch(body.launch);
  const engine = engineSchema.safeParse(body.engine);
  if (!engine.success) throw new ProductApiError("Revisa los valores de las reglas del motor.", 400, "engine");
  return {
    name: name || "Campaña",
    structure,
    template_key: typeof body.template_key === "string" ? body.template_key.slice(0, 40) : null,
    template_id: typeof body.template_id === "string" && /^[0-9a-f-]{36}$/.test(body.template_id) ? body.template_id : null,
    launch: lax,
    engine: engine.data,
  };
}

/** Un borrador incompleto: se aceptan listas vacías y textos en blanco, pero no otros tipos. */
function laxLaunch(raw: unknown): LaunchConfig {
  const parsed = launchSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const bad = parsed.error.issues.filter((i) => i.code !== "too_small" && i.code !== "custom");
  if (bad.length || typeof raw !== "object" || raw === null) throw new ProductApiError("La configuración no es válida. Recarga la página.", 400, "launch");
  if (JSON.stringify(raw).length > 60_000) throw new ProductApiError("La configuración es demasiado grande.", 413, "launch");
  return raw as LaunchConfig;
}

export async function saveDraft(userId: string, product: ProductRow, input: DraftInput, ctx: AdsContext, sourceCampaignId: string | null = null): Promise<CampaignRow> {
  const db = adminClient();
  const current = await getDraft(userId, product.id, sourceCampaignId);
  if (current?.status === "launching") throw new ProductApiError("La campaña se está creando en Meta. Espera a que termine.", 409);
  const row = {
    user_id: userId,
    product_id: product.id,
    name: input.name,
    structure: input.structure,
    template_key: input.template_key,
    template_id: input.template_id,
    launch: input.launch,
    engine: input.engine,
    daily_budget: input.structure === "cbo" ? input.launch.budget : null,
    currency: ctx.currency,
    timezone: ctx.timezone,
    ad_account_id: ctx.meta?.ad_account_id ?? null,
    updated_at: new Date().toISOString(),
  };
  const res = current
    ? await db.from("ad_campaigns").update(row).eq("id", current.id).select("*").single()
    : await db.from("ad_campaigns").insert({ ...row, status: "draft", source_campaign_id: sourceCampaignId }).select("*").single();
  fail("Guardar el borrador", res.error);
  return res.data as CampaignRow;
}

// ---------------------------------------------------------------- Tope de gasto diario

export async function saveSpendCap(userId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new ProductApiError("Escribe un monto mayor que cero.", 400, "amount");
  const { data } = await adminClient().from("merchant_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new ProductApiError("Confirma tu mercado en Ajustes antes de definir el tope.", 409);
  const { error } = await adminClient().from("merchant_settings").update({ ad_daily_spend_cap: amount, updated_at: new Date().toISOString() }).eq("user_id", userId);
  fail("Guardar el tope diario", error);
}

// ---------------------------------------------------------------- Plantillas propias

interface TemplateRow {
  id: string;
  name: string;
  structure: Structure;
  launch: LaunchConfig;
  engine: EngineConfig;
  based_on: string | null;
  updated_at: string;
}

const toTemplate = (r: TemplateRow): AdTemplate => ({ id: r.id, name: r.name, structure: r.structure, launch: r.launch, engine: r.engine, basedOn: r.based_on, updatedAt: r.updated_at });

export async function listTemplates(userId: string): Promise<AdTemplate[]> {
  const { data, error } = await adminClient().from("ad_templates").select("id, name, structure, launch, engine, based_on, updated_at").eq("user_id", userId).order("created_at", { ascending: true });
  fail("Leer las plantillas", error);
  return ((data ?? []) as TemplateRow[]).map(toTemplate);
}

function templateName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw new ProductApiError("Ponle un nombre a la plantilla.", 400, "name");
  if ([...name].length > 60) throw new ProductApiError("El nombre tiene hasta 60 caracteres.", 400, "name");
  return name;
}

/** Una plantilla no guarda los creativos: son de cada producto. */
export async function createTemplate(userId: string, body: { name?: unknown; structure?: unknown; launch?: unknown; engine?: unknown; based_on?: unknown }): Promise<AdTemplate> {
  const draft = parseDraft({ name: "x", structure: body.structure as Structure, launch: body.launch as LaunchConfig, engine: body.engine as EngineConfig });
  const { data, error } = await adminClient()
    .from("ad_templates")
    .insert({ user_id: userId, name: templateName(body.name), structure: draft.structure, launch: { ...draft.launch, creatives: [] }, engine: draft.engine, based_on: typeof body.based_on === "string" ? body.based_on.slice(0, 40) : null })
    .select("id, name, structure, launch, engine, based_on, updated_at")
    .single();
  fail("Guardar la plantilla", error);
  return toTemplate(data as TemplateRow);
}

export async function renameTemplate(userId: string, id: string, name: unknown): Promise<AdTemplate> {
  const { data, error } = await adminClient()
    .from("ad_templates")
    .update({ name: templateName(name), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id, name, structure, launch, engine, based_on, updated_at")
    .maybeSingle();
  fail("Renombrar la plantilla", error);
  if (!data) throw new ProductApiError("No encontramos esa plantilla.", 404);
  return toTemplate(data as TemplateRow);
}

export async function duplicateTemplate(userId: string, id: string): Promise<AdTemplate> {
  const { data } = await adminClient().from("ad_templates").select("name, structure, launch, engine, based_on").eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) throw new ProductApiError("No encontramos esa plantilla.", 404);
  const t = data as Omit<TemplateRow, "id" | "updated_at">;
  return createTemplate(userId, { ...t, name: `${t.name} (copia)`.slice(0, 60) });
}

/** Borrar una plantilla no toca las campañas que la usaron: cada una tiene su copia. */
export async function deleteTemplate(userId: string, id: string) {
  const { error } = await adminClient().from("ad_templates").delete().eq("user_id", userId).eq("id", id);
  fail("Borrar la plantilla", error);
}

// ---------------------------------------------------------------- Creativos

export async function listMediaRows(userId: string, productId: string): Promise<MediaRow[]> {
  const { data, error } = await adminClient().from("ad_media").select("*").eq("user_id", userId).eq("product_id", productId).order("created_at", { ascending: true });
  fail("Leer los creativos", error);
  return (data ?? []) as MediaRow[];
}

export async function toAdMedia(rows: MediaRow[]): Promise<AdMedia[]> {
  if (!rows.length) return [];
  const { data } = await adminClient().storage.from(AD_MEDIA_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_S);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    url: urls.get(r.storage_path) ?? "",
    ratio: r.ratio,
    durationS: r.duration_s == null ? null : Number(r.duration_s),
    status: r.status,
    error: r.error,
  }));
}

const MEDIA_EXT: Record<string, { kind: "image" | "video"; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
};

export async function prepareMediaUpload(userId: string, productId: string, file: { type?: string; size?: number }) {
  const t = file.type ? MEDIA_EXT[file.type] : undefined;
  if (!t) throw new ProductApiError(FORMAT_ERROR, 415, "file");
  const max = t.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!file.size || file.size > max) throw new ProductApiError(t.kind === "image" ? "La imagen pesa más de 30 MB." : "El video pesa más de 1 GB.", 413, "file");
  const { count } = await adminClient().from("ad_media").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("product_id", productId);
  if ((count ?? 0) >= MAX_MEDIA_PER_PRODUCT) throw new ProductApiError(`Ya subiste ${MAX_MEDIA_PER_PRODUCT} creativos a este producto. Quita alguno.`, 409);
  const path = `${userId}/${productId}/${randomUUID()}.${t.ext}`;
  const { data, error } = await adminClient().storage.from(AD_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Preparar la subida: ${error?.message ?? "sin URL"}`);
  return { path, uploadUrl: data.signedUrl };
}

export async function confirmMedia(
  userId: string,
  productId: string,
  body: { path: string; name: string; width: number; height: number; durationS: number | null },
): Promise<AdMedia> {
  const { path } = body;
  if (!path.startsWith(`${userId}/${productId}/`) || path.includes("..")) throw new ProductApiError("Esa subida no es de este producto.", 400, "path");
  const db = adminClient();
  const drop = async (msg: string, status = 415) => {
    await db.storage.from(AD_MEDIA_BUCKET).remove([path]);
    throw new ProductApiError(msg, status, "file");
  };
  // Solo los primeros bytes: un video de 1 GB no pasa por una función.
  const signed = await db.storage.from(AD_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data) throw new ProductApiError("No encontramos el archivo subido. Súbelo de nuevo.", 404, "path");
  const head = await fetch(signed.data.signedUrl, { headers: { Range: "bytes=0-63" }, signal: AbortSignal.timeout(15_000) });
  if (!head.ok) throw new ProductApiError("No encontramos el archivo subido. Súbelo de nuevo.", 404, "path");
  const bytes = new Uint8Array(await head.arrayBuffer());
  const size = Number(head.headers.get("content-range")?.split("/")[1] ?? head.headers.get("content-length") ?? 0);
  const kind = sniffMedia(bytes);
  if (!kind) return drop(FORMAT_ERROR);
  if (size > (kind.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) return drop(kind.kind === "image" ? "La imagen pesa más de 30 MB." : "El video pesa más de 1 GB.", 413);
  const ratio = ratioOf(Number(body.width), Number(body.height));
  if (!ratio) return drop(RATIO_ERROR, 422);

  const { data: last } = await db.from("ad_media").select("position").eq("product_id", productId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from("ad_media")
    .insert({
      user_id: userId,
      product_id: productId,
      kind: kind.kind,
      name: String(body.name || "Creativo").slice(0, 120),
      storage_path: path,
      mime_type: kind.mime,
      width: Math.round(Number(body.width)),
      height: Math.round(Number(body.height)),
      ratio,
      duration_s: kind.kind === "video" && Number.isFinite(Number(body.durationS)) ? Number(body.durationS) : null,
      size_bytes: size,
      position: ((last?.position as number | undefined) ?? -1) + 1,
      status: "ready",
    })
    .select("*")
    .single();
  if (error) {
    await db.storage.from(AD_MEDIA_BUCKET).remove([path]);
    throw new Error(`Guardar el creativo: ${error.message}`);
  }
  return (await toAdMedia([data as MediaRow]))[0];
}

/** Quita un creativo que ninguna campaña lanzada usa. */
export async function deleteMedia(userId: string, productId: string, mediaId: string) {
  const db = adminClient();
  const { data } = await db.from("ad_media").select("id, storage_path").eq("user_id", userId).eq("product_id", productId).eq("id", mediaId).maybeSingle();
  if (!data) throw new ProductApiError("No encontramos ese creativo.", 404);
  const { count } = await db.from("ads").select("id", { count: "exact", head: true }).eq("media_id", mediaId);
  if ((count ?? 0) > 0) throw new ProductApiError("Este creativo está en una campaña lanzada: no se puede quitar.", 409);
  const rm = await db.storage.from(AD_MEDIA_BUCKET).remove([data.storage_path as string]);
  if (rm.error) throw new Error(`Borrar el archivo: ${rm.error.message}`);
  fail("Borrar el creativo", (await db.from("ad_media").delete().eq("id", mediaId)).error);
}

export { DEFAULT_PRESET };
