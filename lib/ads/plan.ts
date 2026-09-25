// Qué se crea en Meta a partir de la configuración (docs/spec-anuncios.md §3, §7.3 y §7.4): los
// conjuntos, sus públicos y presupuestos, y los anuncios con su creativo y su texto. Puro: lo usan el
// lanzador y los tests.
//
// - ABO: un conjunto por creativo (y por público); un anuncio por conjunto con UN medio y UN texto.
//   Cada creativo toma un texto principal distinto, en orden (Impulso: «cambiando video y copy»).
// - CBO `one_per_creative`: cada conjunto (uno por público) lleva un anuncio por creativo.
// - CBO `dco`: cada conjunto lleva UN anuncio dinámico con todos los medios y textos.

import { adsetCount, type Audience, type LaunchConfig, type Structure } from "./schemas";

export interface PlannedAd {
  name: string;
  mediaIds: string[];
  /** Un anuncio normal lleva un texto y un título; el dinámico, todos. */
  primaryTexts: string[];
  headlines: string[];
}

export interface PlannedAdset {
  name: string;
  audience: Audience;
  /** ABO: el presupuesto del conjunto. CBO: null (vive en la campaña). */
  dailyBudget: number | null;
  ads: PlannedAd[];
}

export interface LaunchPlan {
  campaignBudget: number | null;
  adsets: PlannedAdset[];
}

const baseName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Creativo";
const pick = <T,>(list: T[], i: number) => list[i % list.length];
const audienceLabel = (a: Audience) => (a.kind === "open" ? "Abierto" : `Intereses: ${a.interests.map((i) => i.name).slice(0, 2).join(", ")}`);

type PlanMedia = { id: string; name: string; angle_slot?: number | null };

/**
 * El texto principal de un creativo: el de SU ángulo (primary_texts va en orden de slot, lib/ads/texts.ts)
 * o, en los subidos a mano, por turno.
 */
export function textFor(texts: string[], m: PlanMedia, i: number): string {
  const slot = m.angle_slot ?? 0;
  return slot >= 1 && slot <= texts.length ? texts[slot - 1] : pick(texts, i);
}

export function planLaunch(structure: Structure, launch: LaunchConfig, media: PlanMedia[]): LaunchPlan {
  const byId = new Map(media.map((m) => [m.id, m]));
  const creatives = launch.creatives.map((id) => byId.get(id)).filter((m): m is PlanMedia => !!m);
  const single = (m: PlanMedia, i: number): PlannedAd => ({
    name: baseName(m.name),
    mediaIds: [m.id],
    primaryTexts: [textFor(launch.primary_texts, m, i)],
    headlines: [pick(launch.headlines, i)],
  });

  if (structure === "abo") {
    const adsets: PlannedAdset[] = [];
    creatives.forEach((m, i) =>
      launch.audiences.forEach((a) => {
        const n = adsets.length + 1;
        adsets.push({
          name: `Conjunto ${n}${m.angle_slot ? ` · Ángulo ${m.angle_slot}` : ""} · ${baseName(m.name)}${launch.audiences.length > 1 ? ` · ${a.kind === "open" ? "abierto" : "intereses"}` : ""}`,
          audience: a,
          dailyBudget: launch.budget,
          ads: [single(m, i)],
        });
      }),
    );
    return { campaignBudget: null, adsets };
  }

  const ads: PlannedAd[] =
    launch.cbo_ads === "dco"
      ? [{ name: `Dinámico · ${creatives.length} creativos`, mediaIds: creatives.map((m) => m.id), primaryTexts: [...launch.primary_texts], headlines: [...launch.headlines] }]
      : creatives.map(single);
  return {
    campaignBudget: launch.budget,
    adsets: launch.audiences.map((a, i) => ({ name: `Conjunto ${i + 1} · ${audienceLabel(a)}`, audience: a, dailyBudget: null, ads: ads.map((ad) => ({ ...ad, mediaIds: [...ad.mediaIds] })) })),
  };
}

/** Cuántos objetos crea (para el avance): campaña + medios + por conjunto (1 + 2 por anuncio). */
export function planSteps(plan: LaunchPlan, mediaCount: number): number {
  return 1 + mediaCount + plan.adsets.reduce((n, s) => n + 1 + s.ads.length * 2, 0);
}

export { adsetCount };
