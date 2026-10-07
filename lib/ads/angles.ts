// Los ángulos del borrador de campaña (docs/spec-angulos-testeo.md): el borrador guarda con qué
// desarrollos se armaron sus textos (`angles_stamp`); si los ángulos cambian, la pantalla ofrece
// rehacerlo con los de hoy. Puro.
import { stampChanged, type BriefStampEntry } from "@/lib/angles/stamps";

export interface AngleMedia {
  id: string;
  angle_slot?: number | null;
  created_at: string;
  status: string;
  content_provenance?: Record<string, unknown>;
  ugc_provenance?: Record<string, unknown>;
}

export interface DraftAngles {
  /** Los textos o los creativos del borrador son de otros ángulos. */
  stale: boolean;
  /** Creativos elegidos que salieron de un ángulo anterior (su texto sería el del ángulo nuevo del mismo número). */
  oldCreatives: string[];
  /** Creativos listos de los ángulos de hoy que el borrador no tiene. */
  newCreatives: string[];
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.trim() === b[i]?.trim());

/** Compara identidades canónicas; no deduce el origen de piezas históricas por fechas. */
export function draftAngles(
  draft: { stamp: unknown; primaryTexts: string[]; creatives: string[] } | null,
  current: { stamp: BriefStampEntry[]; primaryTexts: string[]; strategyId: string | null },
  media: AngleMedia[],
): DraftAngles | null {
  if (!draft || !current.stamp.length) return null;
  const provenance = (m: AngleMedia) => m.content_provenance?.strategy_id ? m.content_provenance : m.ugc_provenance;
  const isOld = (m: AngleMedia) => {
    const p = provenance(m);
    if (!p?.strategy_id) return false; // No atribuir medios históricos por slot o fecha.
    return p.strategy_id !== current.strategyId || !current.stamp.some((angle) => angle.id === p.angle_id);
  };
  const isCurrent = (m: AngleMedia) => Boolean(provenance(m)?.strategy_id) && !isOld(m);
  const chosen = new Set(draft.creatives);
  const oldCreatives = media.filter((m) => chosen.has(m.id) && isOld(m)).map((m) => m.id);
  const newCreatives = media.filter((m) => isCurrent(m) && m.status === "ready" && !chosen.has(m.id)).map((m) => m.id);
  // Sin huella (borrador de antes): se compara por los textos.
  const changed = draft.stamp == null ? !sameList(draft.primaryTexts, current.primaryTexts) : stampChanged(draft.stamp, current.stamp);
  const differs = !sameList(draft.primaryTexts, current.primaryTexts) || oldCreatives.length > 0;
  return { stale: (changed && differs) || oldCreatives.length > 0, oldCreatives, newCreatives };
}
