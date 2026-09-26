// Campañas reales (docs/spec-anuncios.md §11): las creadas en Meta desde la etapa Anuncios, con su
// veredicto a partir de las decisiones del motor, sus métricas del periodo y el detalle para seguirlas.
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { derive, sumMetrics, type Metrics } from "@/lib/ads/meta/insights";
import { addDays, localDate } from "@/lib/ads/schedule";
import { toAdMedia, type CampaignRow, type MediaRow } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";
import { sessionUser } from "@/lib/integrations/session";
import { changeText, committedDaily, type AdRow, type ChangeRow, type DecisionRow, type SetRow } from "@/lib/pipeline/ads-engine";
import { count, money, multiplier } from "@/lib/format";
import { baseImage, listImageRows, listProductRows, withDisplayUrls } from "@/lib/products/store";
import type { AdChangeView, AdDecisionView, AdHourPoint, AdSeriesPoint, AdUnitView, Campaign, CampaignDetail } from "@/lib/types";

export type CampaignPeriod = "today" | "7" | "30";

const userId = cache(async () => {
  const user = await sessionUser();
  if (!user) redirect("/auth/login");
  return user.id;
});

type DailyRow = Metrics & { date: string; unit_id: string; level: string };

const num = (v: unknown) => Number(v ?? 0);
const toDaily = (r: Record<string, unknown>): DailyRow => ({
  date: r.date as string,
  unit_id: r.unit_id as string,
  level: r.level as string,
  spend: num(r.spend),
  impressions: num(r.impressions),
  reach: num(r.reach),
  clicks: num(r.clicks),
  purchases: num(r.purchases),
  purchase_value: num(r.purchase_value),
  initiated_checkouts: num(r.initiated_checkouts),
});

function periodDates(period: CampaignPeriod, timeZone: string): Set<string> | null {
  const today = localDate(new Date(), timeZone);
  if (period === "today") return new Set([today]);
  const n = period === "7" ? 7 : 30;
  return new Set(Array.from({ length: n }, (_, i) => addDays(today, -i)));
}

const toDecisionView = (d: DecisionRow): AdDecisionView => ({
  id: d.id,
  unitId: d.unit_id,
  level: d.level,
  verdict: d.verdict,
  disposition: d.disposition,
  reason: d.reason,
  rule: d.metrics?.rule ?? null,
  progress: d.progress == null ? null : Number(d.progress),
  suggestedBudget: d.suggested_budget == null ? null : Number(d.suggested_budget),
  winners: d.metrics?.winners,
  decidedAt: d.decided_at,
  lastSeenAt: d.last_seen_at,
});

/** Veredicto de la tarjeta a partir de las decisiones (§11): apagar > subir > aprendiendo > seguir. */
function verdictOf(c: CampaignRow, decisions: DecisionRow[]): { verdict: Campaign["verdict"]; reason: string; nextBudget?: string } {
  const pending = decisions.filter((d) => d.disposition === "pending");
  const pause = pending.find((d) => d.verdict === "pause");
  if (pause) return { verdict: "apagar", reason: pause.reason };
  const scale = pending.find((d) => d.verdict === "scale");
  if (scale) return { verdict: "subir", reason: scale.reason, nextBudget: money(Number(scale.suggested_budget), c.currency) };
  const current = decisions.filter((d) => d.disposition === "pending" || d.disposition === "info");
  if (c.status === "paused") return { verdict: "seguir", reason: c.published_at ? "En pausa." : "Creada en pausa. Revísala y toca Publicar cuando quieras que empiece." };
  if (current.length && current.every((d) => d.verdict === "wait")) return { verdict: "aprendiendo", reason: current[0].reason };
  return { verdict: "seguir", reason: current.find((d) => d.verdict === "keep")?.reason ?? "Sin decisiones todavía: la primera lectura llega en menos de una hora." };
}

function cardMetrics(c: CampaignRow, m: Metrics): Campaign["metrics"] {
  const d = derive(m);
  const limit = Number(c.engine.cpa_limit);
  return [
    { label: "Costo por venta", value: d.cpa == null ? "—" : money(d.cpa, c.currency), target: `Límite ${money(limit, c.currency)}`, trend: d.cpa == null ? undefined : d.cpa <= limit ? "good" : "bad" },
    { label: "Ventas", value: count(d.purchases) },
    { label: "Gasto", value: money(d.spend, c.currency) },
    { label: "Retorno", value: d.roas == null ? "—" : multiplier(d.roas) },
  ];
}

async function campaignRows(uid: string): Promise<CampaignRow[]> {
  const { data, error } = await adminClient().from("ad_campaigns").select("*").eq("user_id", uid).in("status", ["active", "paused", "archived"]).order("created_at", { ascending: false });
  if (error) throw new Error(`Leer campañas: ${error.message}`);
  return (data ?? []) as CampaignRow[];
}

async function productImages(uid: string, productIds: string[]): Promise<Map<string, { name: string; image: string }>> {
  if (!productIds.length) return new Map();
  const [rows, images] = await Promise.all([listProductRows(uid), listImageRows(uid, productIds)]);
  const covers = productIds.map((id) => baseImage(images.filter((i) => i.product_id === id)) ?? images.find((i) => i.product_id === id)).filter((i): i is NonNullable<typeof i> => !!i);
  const urls = await withDisplayUrls(covers);
  return new Map(productIds.map((id) => [id, { name: rows.find((r) => r.id === id)?.title ?? "", image: urls.get(covers.find((c) => c.product_id === id)?.id ?? "") ?? "" }]));
}

const daysLabel = (c: CampaignRow) => {
  if (!c.published_at) return "Meta Ads · en pausa";
  const d = Math.max(1, Math.round((Date.now() - Date.parse(c.published_at)) / 86_400_000));
  return `Meta Ads · ${d === 1 ? "1 día" : `${d} días`}`;
};

/** Las campañas con su veredicto y las cifras del periodo. */
export const getCampaigns = cache(async (period: CampaignPeriod = "7"): Promise<(Campaign & { spend: number; confirmedSales: number })[]> => {
  const uid = await userId();
  const rows = await campaignRows(uid);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const db = adminClient();
  const [{ data: daily }, { data: decisions }, products] = await Promise.all([
    db.from("ad_insights_daily").select("*").in("campaign_id", ids).eq("level", "campaign"),
    db.from("ad_decisions").select("*").in("campaign_id", ids).in("disposition", ["pending", "info"]).order("last_seen_at", { ascending: false }),
    productImages(uid, [...new Set(rows.map((r) => r.product_id))]),
  ]);
  return rows.map((c) => {
    const dates = periodDates(period, c.timezone);
    const days = (daily ?? []).map(toDaily).filter((d) => d.unit_id === c.id);
    const inPeriod = sumMetrics(days.filter((d) => !dates || dates.has(d.date)));
    const decs = ((decisions ?? []) as DecisionRow[]).filter((d) => d.campaign_id === c.id);
    // La decisión vigente de cada unidad.
    const latest = [...new Map(decs.map((d) => [d.unit_id, d])).values()];
    const v = verdictOf(c, latest);
    const last7 = [...Array(7)].map((_, i) => addDays(localDate(new Date(), c.timezone), i - 6));
    return {
      id: c.id,
      productId: c.product_id,
      name: c.name,
      image: products.get(c.product_id)?.image ?? "",
      verdict: v.verdict,
      reason: v.reason,
      meta: daysLabel(c),
      paused: c.status !== "active",
      nextBudget: v.nextBudget,
      metrics: cardMetrics(c, inPeriod),
      budget: Number(c.daily_budget ?? 0),
      history: last7.map((date) => {
        const d = days.find((x) => x.date === date);
        return { day: date.slice(5), spend: d?.spend ?? 0, sales: d?.purchases ?? 0, cpa: d && d.purchases ? d.spend / d.purchases : null };
      }),
      spend: inPeriod.spend,
      confirmedSales: inPeriod.purchases,
    };
  });
});

/** Gasto y ventas del periodo, sumando todas las campañas (en la moneda de la primera). */
export async function getCampaignSummary(period: CampaignPeriod = "7"): Promise<{ spend: number; confirmedSales: number; currency: string }> {
  const list = await getCampaigns(period);
  const uid = await userId();
  const rows = await campaignRows(uid);
  return { spend: list.reduce((s, c) => s + c.spend, 0), confirmedSales: list.reduce((s, c) => s + c.confirmedSales, 0), currency: rows[0]?.currency ?? "CLP" };
}

function series(days: DailyRow[]): AdSeriesPoint[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const m = derive(d);
      return { date: d.date, spend: m.spend, purchases: m.purchases, cpa: m.cpa, ctr: m.ctr, cpc: m.cpc, cpm: m.cpm, roas: m.roas };
    });
}

/** El detalle de una campaña: decisiones por unidad, cambios con Deshacer, series diarias y horarias. */
export const getCampaignDetail = cache(async (id: string): Promise<CampaignDetail | null> => {
  const uid = await userId();
  const db = adminClient();
  const { data } = await db.from("ad_campaigns").select("*").eq("user_id", uid).eq("id", id).maybeSingle();
  const c = data as CampaignRow | null;
  if (!c || !["active", "paused", "archived"].includes(c.status)) return null;

  const today = localDate(new Date(), c.timezone);
  const yesterday = addDays(today, -1);
  const [sets, ads, daily, decisions, changes, snaps, media, products] = await Promise.all([
    db.from("ad_sets").select("*").eq("campaign_id", id).order("position").then((r) => (r.data ?? []) as SetRow[]),
    db.from("ads").select("*").eq("campaign_id", id).order("created_at").then((r) => (r.data ?? []) as AdRow[]),
    db.from("ad_insights_daily").select("*").eq("campaign_id", id).then((r) => (r.data ?? []).map(toDaily)),
    db.from("ad_decisions").select("*").eq("campaign_id", id).in("disposition", ["pending", "info", "applied", "auto_applied"]).order("last_seen_at", { ascending: false }).limit(200).then((r) => (r.data ?? []) as DecisionRow[]),
    db.from("ad_changes").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(50).then((r) => (r.data ?? []) as ChangeRow[]),
    db.from("ad_insights_snapshots").select("captured_at, date, today").eq("campaign_id", id).eq("level", "campaign").in("date", [today, yesterday]).order("captured_at").then((r) => r.data ?? []),
    db.from("ad_media").select("*").eq("product_id", c.product_id).then((r) => (r.data ?? []) as MediaRow[]),
    productImages(uid, [c.product_id]),
  ]);

  const mediaViews = new Map((await toAdMedia(media)).map((m) => [m.id, m]));
  const byUnit = (unit: string) => daily.filter((d) => d.unit_id === unit);
  // La vigente de cada unidad: la última pendiente o informativa; si no, la última aplicada.
  const current = new Map<string, DecisionRow>();
  for (const d of decisions) {
    const prev = current.get(d.unit_id);
    const live = (x: DecisionRow) => x.disposition === "pending" || x.disposition === "info";
    if (!prev || (!live(prev) && live(d) && d.last_seen_at >= prev.last_seen_at)) current.set(d.unit_id, d);
  }

  const unitView = (level: "adset" | "ad", u: SetRow | AdRow, mediaId: string | null, budget: number | null): AdUnitView => {
    const m = derive(sumMetrics(byUnit(u.id)));
    const media = mediaId ? mediaViews.get(mediaId) : undefined;
    const d = current.get(u.id);
    return { id: u.id, level, name: u.name, active: u.status === "ACTIVE", budget, image: media?.url ?? null, video: media?.kind === "video", spend: m.spend, purchases: m.purchases, cpa: m.cpa, decision: d ? toDecisionView(d) : null };
  };
  const units: AdUnitView[] =
    c.structure === "abo"
      ? sets.map((s) => unitView("adset", s, ads.find((a) => a.adset_id === s.id)?.media_id ?? null, s.daily_budget == null ? null : Number(s.daily_budget)))
      : ads.map((a) => unitView("ad", a, a.media_id, null));

  const names = new Map<string, string>([[c.id, "Campaña"], ...sets.map((s) => [s.id, s.name] as [string, string]), ...ads.map((a) => [a.id, a.name] as [string, string])]);
  const ruleText = (ruleId: string | null) => (ruleId ? (decisions.find((d) => d.rule_id === ruleId)?.metrics?.rule ?? null) : null);
  const changeViews: AdChangeView[] = changes.map((ch) => ({
    id: ch.id,
    unitName: names.get(ch.unit_id) ?? "",
    text: changeText(ch, c.currency),
    actor: ch.actor,
    rule: ruleText(ch.rule_id),
    at: ch.created_at,
    undoable: !ch.undone_at && ["pause", "resume", "set_budget"].includes(ch.action),
    undone: Boolean(ch.undone_at),
  }));

  const hourly = (date: string): AdHourPoint[] => {
    const byHour = new Map<number, AdHourPoint>();
    for (const s of snaps.filter((x) => x.date === date)) {
      const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: c.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date(s.captured_at as string)));
      const t = s.today as { spend?: number; purchases?: number };
      byHour.set(hour, { hour, spend: num(t.spend), purchases: num(t.purchases) });
    }
    return [...byHour.values()].sort((a, b) => a.hour - b.hour);
  };

  const total = derive(sumMetrics(byUnit(c.id)));
  const dailySeries: Record<string, AdSeriesPoint[]> = { campaign: series(byUnit(c.id)) };
  for (const u of units) dailySeries[u.id] = series(byUnit(u.id));
  const product = products.get(c.product_id);
  const campaignDecision = current.get(c.id);

  return {
    id: c.id,
    productId: c.product_id,
    productName: product?.name ?? "",
    productImage: product?.image ?? "",
    name: c.name,
    structure: c.structure,
    status: c.status as CampaignDetail["status"],
    currency: c.currency,
    timezone: c.timezone,
    engine: c.engine,
    dailyBudget: c.daily_budget == null ? null : Number(c.daily_budget),
    dailyTotal: committedDaily(c, sets),
    launchedAt: c.launched_at,
    publishedAt: c.published_at,
    startsAt: c.starts_at,
    canRedo: c.status !== "archived" && !c.last_delivery_at && daily.every((d) => !(d.spend > 0)),
    lastSyncedAt: c.last_synced_at,
    syncError: c.sync_error,
    totals: { spend: total.spend, purchases: total.purchases, cpa: total.cpa, roas: total.roas, ctr: total.ctr },
    units,
    campaignDecision: campaignDecision ? toDecisionView(campaignDecision) : null,
    changes: changeViews,
    daily: dailySeries,
    hourly: { today: hourly(today), yesterday: hourly(yesterday) },
  };
});

/** Lo que Hoy muestra de las campañas: decisiones pendientes, errores y cambios automáticos del día. */
export async function campaignAttention(uid: string): Promise<{ pending: (DecisionRow & { campaign: CampaignRow })[]; failing: CampaignRow[]; autoToday: (ChangeRow & { campaign: CampaignRow })[] }> {
  const db = adminClient();
  const rows = await campaignRows(uid);
  if (!rows.length) return { pending: [], failing: [], autoToday: [] };
  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ data: pending }, { data: auto }] = await Promise.all([
    db.from("ad_decisions").select("*").in("campaign_id", ids).eq("disposition", "pending").order("last_seen_at", { ascending: false }),
    db.from("ad_changes").select("*").in("campaign_id", ids).eq("actor", "engine").is("undone_at", null).gte("created_at", since).order("created_at", { ascending: false }),
  ]);
  const by = new Map(rows.map((r) => [r.id, r]));
  return {
    pending: ((pending ?? []) as DecisionRow[]).map((d) => ({ ...d, campaign: by.get(d.campaign_id)! })),
    failing: rows.filter((r) => r.sync_error),
    autoToday: ((auto ?? []) as ChangeRow[]).map((ch) => ({ ...ch, campaign: by.get(ch.campaign_id)! })),
  };
}
