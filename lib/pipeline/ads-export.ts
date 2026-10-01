// «Exportar CSV» del detalle de una campaña (lib/ads/export.ts arma el archivo): lee sus conjuntos,
// anuncios y el historial diario de cada unidad.
import "server-only";
import { exportCsv, exportFilename, exportRows, type ExportAd, type ExportDaily, type ExportSet } from "@/lib/ads/export";
import { localDate } from "@/lib/ads/schedule";
import { fail, type CampaignRow } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";

const num = (v: unknown) => Number(v ?? 0);

export async function campaignExport(c: CampaignRow): Promise<{ filename: string; csv: string }> {
  const db = adminClient();
  const [sets, ads, daily] = await Promise.all([
    db.from("ad_sets").select("id, name, position, status, meta_adset_id, daily_budget").eq("campaign_id", c.id),
    db.from("ads").select("id, adset_id, name, status, meta_ad_id").eq("campaign_id", c.id).order("created_at"),
    db.from("ad_insights_daily").select("unit_id, date, spend, impressions, reach, clicks, purchases, purchase_value, initiated_checkouts").eq("campaign_id", c.id),
  ]);
  fail("Leer los conjuntos", sets.error);
  fail("Leer los anuncios", ads.error);
  fail("Leer las métricas", daily.error);

  const setRows: ExportSet[] = (sets.data ?? []).map((s) => ({ ...s, daily_budget: s.daily_budget == null ? null : num(s.daily_budget) }) as ExportSet);
  const dailyRows: ExportDaily[] = (daily.data ?? []).map((r) => ({
    unit_id: r.unit_id as string,
    date: r.date as string,
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    purchases: num(r.purchases),
    purchase_value: num(r.purchase_value),
    initiated_checkouts: num(r.initiated_checkouts),
  }));
  const campaign = { ...c, daily_budget: c.daily_budget == null ? null : num(c.daily_budget) };
  const rows = exportRows(campaign, setRows, (ads.data ?? []) as ExportAd[], dailyRows);
  return { filename: exportFilename(c.name, localDate(new Date(), c.timezone)), csv: exportCsv(rows, c.currency) };
}
