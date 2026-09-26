import "server-only";
import { graphGet, graphList, graphPost } from "@/lib/integrations/meta/client";
import { fromMinorUnits, toMinorUnits } from "../currency";
import type { Structure } from "../schemas";
import { INSIGHT_FIELDS, toInsightRow, type InsightLevel, type InsightRow } from "./insights";
import { ATTRIBUTION_SPEC, type CreativePayload, type Targeting } from "./payloads";

// Escrituras y lecturas de campañas en Meta (docs/spec-anuncios.md §3, §6, §7.4). Portado de dropflex
// (lib/ads/meta/adapter.ts) sobre el cliente de v2 (appsecret_proof, reintentos seguros). Todo se
// crea en PAUSA: nada gasta sin «Publicar». Cada función recibe el token; la moneda, cuando hay montos.

export interface AdAccountInfo {
  id: string;
  name: string | null;
  currency: string;
  timezone: string;
  /** 1 = activa (https://developers.facebook.com/docs/marketing-api/reference/ad-account). */
  accountStatus: number | null;
}

export async function getAdAccount(token: string, accountId: string): Promise<AdAccountInfo> {
  const raw = await graphGet<Record<string, unknown>>(token, `/${accountId}`, { fields: "id,name,currency,timezone_name,account_status" });
  return {
    id: String(raw.id ?? accountId),
    name: typeof raw.name === "string" ? raw.name : null,
    currency: typeof raw.currency === "string" ? raw.currency : "CLP",
    timezone: typeof raw.timezone_name === "string" ? raw.timezone_name : "America/Santiago",
    accountStatus: typeof raw.account_status === "number" ? raw.account_status : null,
  };
}

function requireId(body: unknown, what: string): string {
  const id = (body as { id?: unknown }).id;
  if (typeof id !== "string" || !id) throw new Error(`Meta no devolvió el id de ${what}.`);
  return id;
}

/** La campaña (C1, C4, C6, C7). CBO: el presupuesto y la puja van aquí. ABO: sin presupuesto compartido. */
export async function createCampaign(token: string, p: { accountId: string; name: string; structure: Structure; dailyBudget: number | null; currency: string }): Promise<string> {
  const budget: Record<string, string> =
    p.structure === "cbo" && p.dailyBudget
      ? { bid_strategy: "LOWEST_COST_WITHOUT_CAP", daily_budget: String(toMinorUnits(p.dailyBudget, p.currency)) }
      : // Sin presupuesto de campaña Meta exige declararlo: apagado, cada conjunto se juzga por SU gasto.
        { is_adset_budget_sharing_enabled: "false" };
  const body = await graphPost(token, `/${p.accountId}/campaigns`, {
    name: p.name,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
    ...budget,
  });
  return requireId(body, "la campaña");
}

/** Un conjunto (C2, C3, C5, C17). ABO: presupuesto y puja aquí. `dynamic`: el anuncio lleva variantes (DCO). */
export async function createAdset(
  token: string,
  p: { accountId: string; campaignId: string; name: string; targeting: Targeting; pixelId: string; dailyBudget: number | null; currency: string; startTime: string | null; dynamic: boolean },
): Promise<string> {
  const body = await graphPost(token, `/${p.accountId}/adsets`, {
    name: p.name,
    campaign_id: p.campaignId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: JSON.stringify({ pixel_id: p.pixelId, custom_event_type: "PURCHASE" }),
    attribution_spec: JSON.stringify(ATTRIBUTION_SPEC),
    targeting: JSON.stringify(p.targeting),
    ...(p.dynamic ? { is_dynamic_creative: "true" } : {}),
    ...(p.dailyBudget ? { bid_strategy: "LOWEST_COST_WITHOUT_CAP", daily_budget: String(toMinorUnits(p.dailyBudget, p.currency)) } : {}),
    ...(p.startTime ? { start_time: p.startTime } : {}),
  });
  return requireId(body, "el conjunto");
}

/** Sube una imagen (bytes en base64) y devuelve su hash. */
export async function uploadImage(token: string, accountId: string, base64: string): Promise<string> {
  const body = await graphPost<{ images?: Record<string, { hash?: string }> }>(token, `/${accountId}/adimages`, { bytes: base64 });
  const hash = Object.values(body.images ?? {})[0]?.hash;
  if (!hash) throw new Error("Meta no devolvió el hash de la imagen.");
  return hash;
}

/** Sube un video por URL (firmada, 1 h). Meta lo procesa aparte: hay que esperar `ready`. */
export async function uploadVideo(token: string, accountId: string, fileUrl: string, name: string): Promise<string> {
  const body = await graphPost(token, `/${accountId}/advideos`, { file_url: fileUrl, name });
  return requireId(body, "el video");
}

export type VideoStatus = "ready" | "processing" | "error";

export async function videoStatus(token: string, videoId: string): Promise<VideoStatus> {
  const raw = await graphGet<{ status?: { video_status?: string } }>(token, `/${videoId}`, { fields: "status" });
  const s = raw.status?.video_status;
  return s === "ready" ? "ready" : s === "error" ? "error" : "processing";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que Meta termine de procesar el video, con un plazo. */
export async function waitVideoReady(token: string, videoId: string, deadline: number): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const s = await videoStatus(token, videoId);
    if (s === "ready") return;
    if (s === "error") throw new Error("Meta no pudo procesar el video. Revisa el formato o súbelo de nuevo.");
    if (Date.now() + 3000 > deadline) throw new Error("Meta sigue procesando el video. Reintenta en unos minutos.");
    await sleep(Math.min(3000 * 1.5 ** attempt, 15_000));
  }
}

/** La miniatura preferida del video, subida como imagen (el creativo de video la necesita). */
export async function videoThumbnailHash(token: string, accountId: string, videoId: string): Promise<string> {
  const body = await graphGet<{ data?: { uri?: string; is_preferred?: boolean }[] }>(token, `/${videoId}/thumbnails`);
  const chosen = body.data?.find((t) => t.is_preferred) ?? body.data?.[0];
  if (!chosen?.uri) throw new Error("El video no tiene miniatura todavía.");
  const res = await fetch(chosen.uri, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`No pudimos leer la miniatura del video (${res.status}).`);
  return uploadImage(token, accountId, Buffer.from(await res.arrayBuffer()).toString("base64"));
}

export async function createCreative(token: string, accountId: string, payload: CreativePayload): Promise<string> {
  const body = await graphPost(token, `/${accountId}/adcreatives`, {
    name: payload.name,
    object_story_spec: JSON.stringify(payload.object_story_spec),
    ...(payload.asset_feed_spec ? { asset_feed_spec: JSON.stringify(payload.asset_feed_spec) } : {}),
    url_tags: payload.url_tags,
  });
  return requireId(body, "el creativo");
}

export async function createAd(token: string, p: { accountId: string; adsetId: string; creativeId: string; name: string }): Promise<string> {
  const body = await graphPost(token, `/${p.accountId}/ads`, {
    name: p.name,
    adset_id: p.adsetId,
    creative: JSON.stringify({ creative_id: p.creativeId }),
    status: "PAUSED",
  });
  return requireId(body, "el anuncio");
}

/** Activa, pausa o borra (Meta modela el borrado como `status: DELETED`) una campaña, conjunto o anuncio. */
export async function setStatus(token: string, metaId: string, status: "ACTIVE" | "PAUSED" | "DELETED"): Promise<void> {
  await graphPost(token, `/${metaId}`, { status });
}

export async function setDailyBudget(token: string, metaId: string, amount: number, currency: string): Promise<void> {
  await graphPost(token, `/${metaId}`, { daily_budget: String(toMinorUnits(amount, currency)) });
}

/** Mueve el inicio de un conjunto. Meta lo acepta mientras el conjunto no haya empezado a entregar. */
export async function setStartTime(token: string, adsetId: string, startTime: string): Promise<void> {
  await graphPost(token, `/${adsetId}`, { start_time: startTime });
}

/** Impresiones de toda la vida de la campaña: 0 = nunca entregó (Meta no devuelve filas). */
export async function lifetimeImpressions(token: string, campaignId: string): Promise<number> {
  const body = await graphGet<{ data?: { impressions?: string }[] }>(token, `/${campaignId}/insights`, { fields: "impressions", date_preset: "maximum" });
  return (body.data ?? []).reduce((n, r) => n + (Number(r.impressions) || 0), 0);
}

export interface LiveUnit {
  metaId: string;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  startTime?: string | null;
  adsetId?: string | null;
}

const budgetOf = (raw: Record<string, unknown>, currency: string) => (raw.daily_budget == null || raw.daily_budget === "" ? null : fromMinorUnits(Number(raw.daily_budget), currency));
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Estado y presupuesto reales de la campaña, sus conjuntos y sus anuncios (3 lecturas). */
export async function getCampaignTree(token: string, campaignId: string, currency: string): Promise<{ campaign: LiveUnit; adsets: LiveUnit[]; ads: LiveUnit[] }> {
  const [c, sets, ads] = await Promise.all([
    graphGet<Record<string, unknown>>(token, `/${campaignId}`, { fields: "id,status,effective_status,daily_budget" }),
    graphList<Record<string, unknown>>(token, `/${campaignId}/adsets`, { fields: "id,status,effective_status,daily_budget,start_time" }),
    graphList<Record<string, unknown>>(token, `/${campaignId}/ads`, { fields: "id,status,effective_status,adset_id" }),
  ]);
  const unit = (r: Record<string, unknown>): LiveUnit => ({ metaId: String(r.id ?? ""), status: str(r.status), effectiveStatus: str(r.effective_status), dailyBudget: budgetOf(r, currency) });
  return {
    campaign: unit(c),
    adsets: sets.map((r) => ({ ...unit(r), startTime: str(r.start_time) })),
    ads: ads.map((r) => ({ ...unit(r), adsetId: str(r.adset_id) })),
  };
}

/** Insights diarios (en la zona de la cuenta) de una campaña al nivel pedido, con la atribución C17. */
export async function getDailyInsights(token: string, campaignId: string, level: InsightLevel, since: string, until: string): Promise<InsightRow[]> {
  const rows = await graphList<Record<string, unknown>>(token, `/${campaignId}/insights`, {
    level,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    fields: INSIGHT_FIELDS.join(","),
  });
  return rows.map((r) => toInsightRow(r, level));
}

export interface InterestOption {
  id: string;
  name: string;
  audienceSize: number | null;
}

export async function searchInterests(token: string, q: string): Promise<InterestOption[]> {
  if (!q.trim()) return [];
  const body = await graphGet<{ data?: Record<string, unknown>[] }>(token, "/search", { type: "adinterest", q: q.trim(), limit: "25" });
  return (body.data ?? [])
    .filter((r) => typeof r.id === "string")
    .map((r) => ({ id: String(r.id), name: typeof r.name === "string" ? r.name : String(r.id), audienceSize: typeof r.audience_size_lower_bound === "number" ? r.audience_size_lower_bound : null }));
}

/** Las regiones de un país (sus `key` de Meta no son códigos ISO: solo salen de aquí). */
export async function listRegions(token: string, country: string): Promise<{ key: string; name: string }[]> {
  if (!/^[A-Z]{2}$/.test(country)) return [];
  const body = await graphGet<{ data?: Record<string, unknown>[] }>(token, "/search", {
    type: "adgeolocation",
    location_types: JSON.stringify(["region"]),
    country_code: country,
    q: "",
    limit: "200",
  });
  return (body.data ?? [])
    .filter((r) => typeof r.key === "string" && (r.country_code === undefined || r.country_code === country))
    .map((r) => ({ key: String(r.key), name: typeof r.name === "string" ? r.name : String(r.key) }));
}
