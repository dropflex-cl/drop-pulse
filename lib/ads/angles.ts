// Los ángulos del borrador de campaña (docs/spec-angulos-testeo.md): el borrador guarda con qué
// desarrollos se armaron sus textos (`angles_stamp`); si los ángulos cambian, la pantalla ofrece
// rehacerlo con los de hoy. Puro.
import { stampChanged, type BriefStampEntry } from "@/lib/angles/approved";

export interface AngleMedia {
  id: string;
  angle_slot?: number | null;
  created_at: string;
  status: string;
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

/**
 * `since`: cuándo se creó el desarrollo vigente de cada slot. Un creativo con ángulo es de un ángulo
 * anterior si su slot ya no existe o si se creó antes que ese desarrollo (al cambiar el ángulo, el
 * desarrollo se escribe de nuevo; editarlo no cambia su fecha).
 */
export function draftAngles(
  draft: { stamp: unknown; primaryTexts: string[]; creatives: string[] } | null,
  current: { stamp: BriefStampEntry[]; primaryTexts: string[]; since: Map<number, string> },
  media: AngleMedia[],
): DraftAngles | null {
  if (!draft || !current.stamp.length) return null;
  const isOld = (m: AngleMedia) => {
    if (!m.angle_slot) return false;
    const since = current.since.get(m.angle_slot);
    return !since || m.created_at < since;
  };
  const chosen = new Set(draft.creatives);
  const oldCreatives = media.filter((m) => chosen.has(m.id) && isOld(m)).map((m) => m.id);
  const newCreatives = media.filter((m) => m.angle_slot && !isOld(m) && m.status === "ready" && !chosen.has(m.id)).map((m) => m.id);
  // Sin huella (borrador de antes): se compara por los textos.
  const changed = draft.stamp == null ? !sameList(draft.primaryTexts, current.primaryTexts) : stampChanged(draft.stamp, current.stamp);
  const differs = !sameList(draft.primaryTexts, current.primaryTexts) || oldCreatives.length > 0;
  return { stale: (changed && differs) || oldCreatives.length > 0, oldCreatives, newCreatives };
}
