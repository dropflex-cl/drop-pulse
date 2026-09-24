import "server-only";
import { getCampaignTree, getDailyInsights } from "@/lib/ads/meta/adapter";
import { derive, sumMetrics, type InsightLevel, type Metrics } from "@/lib/ads/meta/insights";
import { addDays, localDate } from "@/lib/ads/schedule";
import { fail, type CampaignRow } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";
import { MetaAuthError } from "@/lib/integrations/meta/client";
import { markMetaError, metaToken } from "@/lib/integrations/meta/connection";
import { metaReason } from "./ads-launch";
import { autoApply, campaignUnits, evaluateCampaign, storeDecisions } from "./ads-engine";

// La lectura de cada hora (docs/spec-anuncios.md §6). Por campaña: estado y presupuesto reales desde
// Meta → insights diarios por campaña, conjunto y anuncio (el día se reescribe mientras Meta asienta
// las conversiones) → una foto horaria que SOLO se agrega (el historial de los gráficos) → el motor.

/** Campañas por llamada; la próxima hora sigue con las que falten. */
const BATCH = 10;
/** Tiempo para leer campañas dentro de la función (maxDuration 300). */
const BUDGET_MS = 240_000;
/** Días hacia atrás que se vuelven a leer: Meta asienta conversiones hasta 72 h después. */
const SETTLE_DAYS = 3;
/** Una campaña sin entrega hace más de esto deja de leerse sola. */
const STALE_DELIVERY_DAYS = 30;
/** «Actualizar ahora»: como mucho una vez cada 5 minutos. */
export const MANUAL_SYNC_MIN_MS = 5 * 60 * 1000;

const now = () => new Date().toISOString();

type Row = Metrics & { date: string };

/** Lee y guarda todo de una campaña. No lanza: deja el error en la fila. */
export async function syncCampaign(c: CampaignRow): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient();
  const token = await metaToken(c.user_id);
  try {
    if (!token) throw new MetaAuthError("Sin token");
    if (!c.meta_campaign_id) return { ok: true };
    const { sets, ads } = await campaignUnits(c.id);

    // 1. Estado y presupuesto reales (si alguien los cambió en Ads Manager, se refleja y se anota).
    const tree = await getCampaignTree(token, c.meta_campaign_id, c.currency);
    const at = now();
    // El estado configurado (ACTIVE/PAUSED), no el efectivo: ese mezcla «en revisión», «con problemas»
    // o «campaña pausada», que no son una decisión sobre la unidad.
    const status = tree.campaign.status === "ACTIVE" ? "active" : "paused";
    const campaignPatch: Record<string, unknown> = { last_synced_at: at, sync_error: null, updated_at: at };
    if (status !== c.status && ["active", "paused"].includes(c.status)) {
      campaignPatch.status = status;
      await db.from("ad_changes").insert({ user_id: c.user_id, campaign_id: c.id, level: "campaign", unit_id: c.id, action: "external", before: { status: c.status }, after: { status }, actor: "meta" });
    }
    if (c.structure === "cbo" && tree.campaign.dailyBudget != null && Number(c.daily_budget) !== tree.campaign.dailyBudget) {
      campaignPatch.daily_budget = tree.campaign.dailyBudget;
      await db.from("ad_changes").insert({ user_id: c.user_id, campaign_id: c.id, level: "campaign", unit_id: c.id, action: "external", before: { budget: c.daily_budget }, after: { budget: tree.campaign.dailyBudget }, actor: "meta" });
    }
    for (const live of tree.adsets) {
      const s = sets.find((x) => x.meta_adset_id === live.metaId);
      if (!s) continue;
      const st = live.status ?? s.status;
      const budget = live.dailyBudget;
      const moved = budget != null && s.daily_budget != null && Number(s.daily_budget) !== budget;
      if (st !== s.status || moved) {
        await db.from("ad_sets").update({ status: st, ...(moved ? { daily_budget: budget } : {}), updated_at: at }).eq("id", s.id);
        if (moved) await db.from("ad_changes").insert({ user_id: c.user_id, campaign_id: c.id, level: "adset", unit_id: s.id, action: "external", before: { budget: s.daily_budget }, after: { budget }, actor: "meta" });
        s.status = st;
        if (moved) s.daily_budget = budget;
      }
    }
    for (const live of tree.ads) {
      const a = ads.find((x) => x.meta_ad_id === live.metaId);
      const st = live.status;
      if (a && st && st !== a.status) await db.from("ads").update({ status: st, updated_at: at }).eq("id", a.id);
    }

    // 2. Insights diarios de los últimos días (en la hora de la cuenta).
    const today = localDate(new Date(), c.timezone);
    const first = c.published_at ? localDate(new Date(c.published_at), c.timezone) : today;
    const lastRead = c.last_synced_at ? addDays(localDate(new Date(c.last_synced_at), c.timezone), -SETTLE_DAYS) : first;
    // Desde la última lectura menos los días que Meta tarda en asentar, sin ir antes del inicio ni de 30 días.
    const since = [first, lastRead, addDays(today, -STALE_DELIVERY_DAYS)].sort().at(-1)!;
    const byMeta = new Map<string, { level: InsightLevel; id: string }>([[c.meta_campaign_id, { level: "campaign", id: c.id }]]);
    for (const s of sets) if (s.meta_adset_id) byMeta.set(s.meta_adset_id, { level: "adset", id: s.id });
    for (const a of ads) if (a.meta_ad_id) byMeta.set(a.meta_ad_id, { level: "ad", id: a.id });

    const rows: { level: InsightLevel; unit: string; row: Row }[] = [];
    for (const level of ["campaign", "adset", "ad"] as const) {
      for (const r of await getDailyInsights(token, c.meta_campaign_id, level, since, today)) {
        const u = byMeta.get(r.metaId);
        if (u) rows.push({ level, unit: u.id, row: r });
      }
    }
    if (rows.length) {
      const upserts = rows.map(({ level, unit, row }) => {
        const d = derive(row);
        return {
          user_id: c.user_id,
          campaign_id: c.id,
          level,
          unit_id: unit,
          date: row.date,
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          clicks: row.clicks,
          purchases: row.purchases,
          purchase_value: row.purchase_value,
          initiated_checkouts: row.initiated_checkouts,
          ctr: d.ctr,
          cpc: d.cpc,
          cpm: d.cpm,
          cpa: d.cpa,
          roas: d.roas,
          updated_at: at,
        };
      });
      fail("Guardar las métricas del día", (await db.from("ad_insights_daily").upsert(upserts, { onConflict: "unit_id,date" })).error);
      if (rows.some((r) => r.row.spend > 0)) campaignPatch.last_delivery_at = at;
    }

    // 3. La foto horaria: lo de hoy y lo acumulado de cada unidad (solo se agrega).
    const { data: all, error } = await db.from("ad_insights_daily").select("level, unit_id, date, spend, impressions, reach, clicks, purchases, purchase_value, initiated_checkouts").eq("campaign_id", c.id);
    fail("Leer el historial", error);
    const units = new Map<string, { level: InsightLevel; days: Row[] }>();
    for (const r of all ?? []) {
      const key = r.unit_id as string;
      const row: Row = { date: r.date as string, spend: Number(r.spend), impressions: Number(r.impressions), reach: Number(r.reach), clicks: Number(r.clicks), purchases: Number(r.purchases), purchase_value: Number(r.purchase_value), initiated_checkouts: Number(r.initiated_checkouts) };
      units.set(key, { level: r.level as InsightLevel, days: [...(units.get(key)?.days ?? []), row] });
    }
    const snaps = [...units.entries()].map(([unit, u]) => ({
      user_id: c.user_id,
      campaign_id: c.id,
      level: u.level,
      unit_id: unit,
      captured_at: at,
      date: today,
      today: derive(sumMetrics(u.days.filter((d) => d.date === today))),
      lifetime: derive(sumMetrics(u.days)),
    }));
    if (snaps.length) fail("Guardar la foto horaria", (await db.from("ad_insights_snapshots").insert(snaps)).error);

    fail("Guardar la campaña", (await db.from("ad_campaigns").update(campaignPatch).eq("id", c.id)).error);

    // 4. El motor, con la configuración de ESTA campaña (solo publicada y entregando).
    const fresh = { ...c, ...(campaignPatch as Partial<CampaignRow>) };
    if (fresh.status === "active") {
      const { decisions, units: engineUnits } = await evaluateCampaign(fresh);
      const stored = await storeDecisions(fresh, decisions);
      await autoApply(fresh, stored, engineUnits);
    }
    return { ok: true };
  } catch (e) {
    console.error("[ads-sync]", c.id, e);
    if (e instanceof MetaAuthError) await markMetaError(c.user_id, "expired").catch(() => {});
    const error = metaReason(e);
    await db.from("ad_campaigns").update({ last_synced_at: now(), sync_error: error, updated_at: now() }).eq("id", c.id);
    return { ok: false, error };
  }
}

/** El job horario: las campañas en pausa o activas con entrega reciente, las menos frescas primero. */
export async function runAdsSync(): Promise<{ synced: number; failed: number; left: boolean }> {
  const started = Date.now();
  const cutoff = new Date(Date.now() - STALE_DELIVERY_DAYS * 86_400_000).toISOString();
  const { data, error } = await adminClient()
    .from("ad_campaigns")
    .select("*")
    .in("status", ["active", "paused"])
    .not("meta_campaign_id", "is", null)
    .or(`last_delivery_at.gte.${cutoff},published_at.gte.${cutoff},launched_at.gte.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH * 5);
  fail("Listar campañas por leer", error);
  const list = (data ?? []) as CampaignRow[];
  let synced = 0;
  let failed = 0;
  // Una hora: las que ya se leyeron en los últimos 50 minutos no se repiten.
  const due = list.filter((c) => !c.last_synced_at || Date.now() - Date.parse(c.last_synced_at) > 50 * 60 * 1000);
  for (let i = 0; i < due.length; i += BATCH) {
    if (Date.now() - started > BUDGET_MS) return { synced, failed, left: true };
    const results = await Promise.all(due.slice(i, i + BATCH).map(syncCampaign));
    for (const r of results) {
      if (r.ok) synced++;
      else failed++;
    }
  }
  return { synced, failed, left: false };
}
