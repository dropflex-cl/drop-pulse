import { describe, expect, it } from "vitest";
import { EMPTY_METRICS } from "./meta/insights";
import { csvNumber, csvText, exportCsv, exportFilename, exportRows, type ExportDaily } from "./export";

const campaign = { id: "c", name: "Deep Collagen | ABO | Imagen | 26-09-2026", status: "active", meta_campaign_id: "120", daily_budget: null, currency: "CLP" };
const sets = [
  { id: "s2", name: "Conjunto 2", position: 2, status: "PAUSED", meta_adset_id: "122", daily_budget: 5000 },
  { id: "s1", name: "Conjunto 1", position: 1, status: "ACTIVE", meta_adset_id: "121", daily_budget: 5000 },
];
const ads = [
  { id: "a1", adset_id: "s1", name: "Anuncio 1", status: "ACTIVE", meta_ad_id: "131" },
  { id: "a2", adset_id: "s2", name: "Anuncio 2", status: "ADSET_PAUSED", meta_ad_id: "132" },
  { id: "a3", adset_id: "s1", name: "Anuncio 3", status: "ACTIVE", meta_ad_id: null },
];
const day = (unit_id: string, date: string, m: Partial<ExportDaily>): ExportDaily => ({ ...EMPTY_METRICS, unit_id, date, ...m });
const daily = [
  day("c", "2026-09-25", { spend: 6000, impressions: 3000, clicks: 45, purchases: 1, purchase_value: 29990, initiated_checkouts: 3 }),
  day("c", "2026-09-26", { spend: 4000, impressions: 2000, clicks: 30, purchases: 1, purchase_value: 44990, initiated_checkouts: 2 }),
  day("s1", "2026-09-25", { spend: 3000, impressions: 1500, clicks: 30, purchases: 1, purchase_value: 29990 }),
  day("s1", "2026-09-26", { spend: 2000, impressions: 1000, clicks: 20, purchases: 1, purchase_value: 44990 }),
  day("a1", "2026-09-25", { spend: 3000, impressions: 1500, clicks: 30, purchases: 1, purchase_value: 29990 }),
];

describe("exportar la campaña a CSV", () => {
  it("la campaña primero y cada conjunto, por posición, seguido de sus anuncios", () => {
    const rows = exportRows(campaign, sets, ads, daily);
    expect(rows.map((r) => [r.level, r.adset, r.ad])).toEqual([
      ["campaign", "", ""],
      ["adset", "Conjunto 1", ""],
      ["ad", "Conjunto 1", "Anuncio 1"],
      ["ad", "Conjunto 1", "Anuncio 3"],
      ["adset", "Conjunto 2", ""],
      ["ad", "Conjunto 2", "Anuncio 2"],
    ]);
  });

  it("suma todos los días de cada unidad; una unidad sin lecturas queda en cero", () => {
    const rows = exportRows(campaign, sets, ads, daily);
    expect(rows[0].metrics).toMatchObject({ spend: 10000, purchases: 2, initiated_checkouts: 5 });
    expect(rows[1].metrics).toMatchObject({ spend: 5000, clicks: 50, purchases: 2 });
    expect(rows[3].metrics).toEqual(EMPTY_METRICS);
  });

  it("un anuncio sin su conjunto no se pierde: va al final", () => {
    const rows = exportRows(campaign, sets, [...ads, { id: "a9", adset_id: "gone", name: "Suelto", status: "ACTIVE", meta_ad_id: "139" }], []);
    expect(rows.at(-1)).toMatchObject({ level: "ad", adset: "", ad: "Suelto" });
  });

  it("los estados van en español", () => {
    const rows = exportRows(campaign, sets, ads, []);
    expect(rows.map((r) => r.status)).toEqual(["Activa", "Activo", "Activo", "Activo", "En pausa", "En pausa por el conjunto"]);
  });

  it("separador «;», coma decimal, sin miles, BOM y las cifras calculadas", () => {
    const csv = exportCsv(exportRows(campaign, sets, ads, daily), "CLP");
    expect(csv.startsWith("﻿Nivel;Campaña;Conjunto;Anuncio;ID en Meta;Estado;Presupuesto diario (CLP);Gasto (CLP)")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(7);
    // Conjunto 1: gasto 5.000, 2.500 impresiones, 50 clics → CTR 2 %, CPC 100, CPM 2.000, CPA 2.500, ROAS 14,996.
    expect(lines[2]).toBe("Conjunto;Deep Collagen | ABO | Imagen | 26-09-2026;Conjunto 1;;121;Activo;5000;5000;2500;50;2;100;2000;0;2;74980;2500;15");
    // Sin ventas ni impresiones: CTR, CPC, CPM, CPA y ROAS vacíos.
    expect(lines[4]).toBe("Anuncio;Deep Collagen | ABO | Imagen | 26-09-2026;Conjunto 1;Anuncio 3;;Activo;;0;0;0;;;;0;0;0;;");
  });

  it("en una moneda con centavos, dos decimales con coma", () => {
    expect(csvNumber(12.345, 2)).toBe("12,35");
    expect(csvNumber(1234567.5, 2)).toBe("1234567,5");
    expect(csvNumber(null, 2)).toBe("");
    expect(csvNumber(Number.NaN, 0)).toBe("");
  });

  it("los textos con «;» o comillas van entre comillas y una fórmula no se ejecuta", () => {
    expect(csvText("Conjunto 1 · La crema sella")).toBe("Conjunto 1 · La crema sella");
    expect(csvText('Crema; "día"')).toBe('"Crema; ""día"""');
    expect(csvText("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvText("-10 %")).toBe("'-10 %");
  });

  it("el nombre del archivo, sin acentos ni símbolos", () => {
    expect(exportFilename("Crema día | ABO | Video UGC + Imagen | 26-09-2026", "2026-09-26")).toBe("crema-dia-abo-video-ugc-imagen-26-09-2026-2026-09-26.csv");
    expect(exportFilename("|||", "2026-09-26")).toBe("campana-2026-09-26.csv");
  });
});
