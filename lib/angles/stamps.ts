// Comparación de las huellas persistidas de campañas y contenido. Puro.

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

/** ¿Cambió algún desarrollo (otro id o una edición) desde la corrida? */
export function stampChanged(used: unknown, current: BriefStampEntry[]): boolean {
  const before = stampEntries(used);
  if (!before.length) return false;
  if (before.length !== current.length) return true;
  return before.some((b, i) => b.id !== current[i].id || (b.edited_at ?? null) !== (current[i].edited_at ?? null));
}
