// Los ángulos aprobados como los leen los pasos siguientes (Imágenes, Página, Creativos, Eventos) y
// la huella con que cada corrida recuerda con qué desarrollos se hizo. Puro.

import { ANGLES, slotLabel, testAngleName, type AngleSlot, type TestAngle } from "./catalog";
import type { AngleBriefPayload } from "./schemas";

/** Un ángulo aprobado, listo para un prompt. */
export interface AngleForPrompt {
  slot: AngleSlot;
  /** El nombre del ángulo (título o, en los de antes, la forma). */
  name: string;
  /** La forma con que se cuenta. */
  frameName: string;
  angle: TestAngle;
  payload: AngleBriefPayload;
}

export function angleForPrompt(angle: TestAngle, payload: AngleBriefPayload, frame = angle.frame): AngleForPrompt {
  return { slot: angle.slot, name: testAngleName({ ...angle, frame }), frameName: ANGLES[frame].name, angle: { ...angle, frame }, payload };
}

/** El encabezado de un ángulo en un prompt: «Ángulo 1: La crema sella (forma: Mecanismo único)». */
export const angleHeading = (a: AngleForPrompt) => `${slotLabel(a.slot)}: ${a.name} (forma: ${a.frameName})`;

/** El mensaje del ángulo (dolor, segmento, promesa, momento), sin los vacíos de los ángulos de antes. */
export function angleMessage(a: TestAngle): Record<string, string> {
  const out: Record<string, string> = {};
  if (a.pain_or_desire) out.pain_or_desire = a.pain_or_desire;
  if (a.segment) out.segment = a.segment;
  if (a.promise) out.promise = a.promise;
  if (a.trigger_moment) out.trigger_moment = a.trigger_moment;
  return out;
}

// ---------------------------------------------------------------- Huellas de las corridas

export interface BriefStampEntry {
  id: string;
  edited_at: string | null;
}

/**
 * Los desarrollos con que se hizo una corrida, en orden de slot. Acepta lo que guardaban las corridas
 * de antes: `{ primary: id, secondary: id }` (Imágenes) o `{ primary: { id, edited_at }, … }` (Página).
 */
export function stampEntries(v: unknown): BriefStampEntry[] {
  if (!v) return [];
  const entry = (x: unknown): BriefStampEntry | null =>
    typeof x === "string" ? { id: x, edited_at: null } : x && typeof x === "object" && typeof (x as BriefStampEntry).id === "string" ? { id: (x as BriefStampEntry).id, edited_at: (x as BriefStampEntry).edited_at ?? null } : null;
  if (Array.isArray(v)) return v.map(entry).filter((e): e is BriefStampEntry => e !== null);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [entry(o.primary), entry(o.secondary)].filter((e): e is BriefStampEntry => e !== null);
  }
  return [];
}

/** «id1,id2,id3»: si cambia, lo que se hizo con los ángulos quedó desactualizado. */
export const stampKey = (v: unknown): string | null => {
  const e = stampEntries(v);
  return e.length ? e.map((x) => x.id).join(",") : null;
};

/** ¿Cambió algún desarrollo (otro id o una edición) desde la corrida? */
export function stampChanged(used: unknown, current: BriefStampEntry[]): boolean {
  const before = stampEntries(used);
  if (!before.length) return false;
  if (before.length !== current.length) return true;
  return before.some((b, i) => b.id !== current[i].id || (b.edited_at ?? null) !== (current[i].edited_at ?? null));
}
