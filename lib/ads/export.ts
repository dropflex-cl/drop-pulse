// «Exportar CSV» del detalle de una campaña: una fila por la campaña, luego cada conjunto seguido de
// sus anuncios, con lo acumulado desde el inicio. Puro: recibe las filas ya leídas y devuelve el texto.
//
// Pensado para abrirse con doble clic en Excel en español (Chile y LATAM): separador «;», coma
// decimal, sin separador de miles y BOM UTF-8 para que los acentos se vean bien. Google Sheets lo
// importa igual. El alcance no se exporta: Meta lo da por día y sumar días no da personas únicas.

import { derive, sumMetrics, type Metrics } from "./meta/insights";

export interface ExportCampaign {
  id: string;
  name: string;
  status: string;
  meta_campaign_id: string | null;
  daily_budget: number | null;
  currency: string;
}
export interface ExportSet {
  id: string;
  name: string;
  position: number;
  status: string;
  meta_adset_id: string | null;
  daily_budget: number | null;
}
export interface ExportAd {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  meta_ad_id: string | null;
}
export type ExportDaily = Metrics & { unit_id: string; date: string };

export type ExportLevel = "campaign" | "adset" | "ad";

export interface ExportRow {
  level: ExportLevel;
  campaign: string;
  adset: string;
  ad: string;
  metaId: string;
  status: string;
  budget: number | null;
  metrics: Metrics;
}

const LEVEL_LABEL: Record<ExportLevel, string> = { campaign: "Campaña", adset: "Conjunto", ad: "Anuncio" };

const CAMPAIGN_STATUS: Record<string, string> = { active: "Activa", paused: "En pausa", archived: "Archivada" };
/** `effective_status` de Meta en conjuntos y anuncios. */
const META_STATUS: Record<string, string> = {
  ACTIVE: "Activo",
  PAUSED: "En pausa",
  CAMPAIGN_PAUSED: "En pausa por la campaña",
  ADSET_PAUSED: "En pausa por el conjunto",
  DELETED: "Eliminado",
  ARCHIVED: "Archivado",
  IN_PROCESS: "En proceso",
  WITH_ISSUES: "Con problemas",
  PENDING_REVIEW: "En revisión",
  DISAPPROVED: "Rechazado",
};

export function statusLabel(level: ExportLevel, status: string): string {
  return (level === "campaign" ? CAMPAIGN_STATUS : META_STATUS)[status] ?? status;
}

/** Las filas en orden: la campaña, y cada conjunto (por posición) seguido de sus anuncios. */
export function exportRows(c: ExportCampaign, sets: ExportSet[], ads: ExportAd[], daily: ExportDaily[]): ExportRow[] {
  const byUnit = new Map<string, Metrics[]>();
  for (const d of daily) byUnit.set(d.unit_id, [...(byUnit.get(d.unit_id) ?? []), d]);
  const total = (id: string) => sumMetrics(byUnit.get(id) ?? []);

  const setName = new Map(sets.map((s) => [s.id, s.name]));
  const adRow = (a: ExportAd): ExportRow => ({ level: "ad", campaign: c.name, adset: setName.get(a.adset_id) ?? "", ad: a.name, metaId: a.meta_ad_id ?? "", status: statusLabel("ad", a.status), budget: null, metrics: total(a.id) });

  const rows: ExportRow[] = [
    { level: "campaign", campaign: c.name, adset: "", ad: "", metaId: c.meta_campaign_id ?? "", status: statusLabel("campaign", c.status), budget: c.daily_budget, metrics: total(c.id) },
  ];
  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    rows.push({ level: "adset", campaign: c.name, adset: s.name, ad: "", metaId: s.meta_adset_id ?? "", status: statusLabel("adset", s.status), budget: s.daily_budget, metrics: total(s.id) });
    for (const a of ads) if (a.adset_id === s.id) rows.push(adRow(a));
  }
  // Un anuncio cuyo conjunto ya no está queda al final, sin perderlo.
  for (const a of ads) if (!setName.has(a.adset_id)) rows.push(adRow(a));
  return rows;
}

/** Decimales de la moneda (CLP 0, USD 2…). */
function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Número para la planilla: coma decimal, sin miles, vacío si no hay base (CPA sin ventas…). */
export function csvNumber(v: number | null, digits: number): string {
  if (v == null || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat("es-CL", { useGrouping: false, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}

/**
 * Un campo de texto: entre comillas si lleva «;», comillas o saltos de línea. Si empieza como una
 * fórmula (=, +, -, @), va con un apóstrofo delante para que la planilla no la ejecute.
 */
export function csvText(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportCsv(rows: ExportRow[], currency: string): string {
  const money = currencyDigits(currency);
  const header = [
    "Nivel",
    "Campaña",
    "Conjunto",
    "Anuncio",
    "ID en Meta",
    "Estado",
    `Presupuesto diario (${currency})`,
    `Gasto (${currency})`,
    "Impresiones",
    "Clics en el enlace",
    "CTR (%)",
    `CPC (${currency})`,
    `CPM (${currency})`,
    "Pagos iniciados",
    "Compras",
    `Valor de las compras (${currency})`,
    `CPA (${currency})`,
    "ROAS",
  ];
  const lines = rows.map((r) => {
    const m = derive(r.metrics);
    return [
      csvText(LEVEL_LABEL[r.level]),
      csvText(r.campaign),
      csvText(r.adset),
      csvText(r.ad),
      csvText(r.metaId),
      csvText(r.status),
      csvNumber(r.budget, money),
      csvNumber(m.spend, money),
      csvNumber(m.impressions, 0),
      csvNumber(m.clicks, 0),
      csvNumber(m.ctr, 2),
      csvNumber(m.cpc, money),
      csvNumber(m.cpm, money),
      csvNumber(m.initiated_checkouts, 0),
      csvNumber(m.purchases, 0),
      csvNumber(m.purchase_value, money),
      csvNumber(m.cpa, money),
      csvNumber(m.roas, 2),
    ].join(";");
  });
  return `﻿${[header.map(csvText).join(";"), ...lines].join("\r\n")}\r\n`;
}

/** Nombre del archivo: la campaña sin acentos ni símbolos, más la fecha de la exportación. */
export function exportFilename(campaignName: string, date: string): string {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "campana"}-${date}.csv`;
}
