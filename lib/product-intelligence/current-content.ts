/** Decisiones vigentes. Los estados de aprobación antiguos son compatibilidad, no permisos de uso. */
export function contentAvailable(record: { status?: string; payload?: unknown; discarded_at?: string | null }) {
  const payload = record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : undefined;
  return !record.discarded_at && !payload?.archived_at && !payload?.discarded_at && !["rejected", "archived"].includes(record.status ?? "");
}
export function selectedUse(record: { status?: string; payload?: Record<string, unknown> }) {
  return contentAvailable(record) && (typeof record.payload?.selected === "boolean" ? record.payload.selected : record.status === "selected");
}
/** Los clientes antiguos pueden enviar CAS. Los nuevos dejan que el servidor capture su lectura. */
export const serverRevision = (expected: number, current: number) => expected === Number.MAX_SAFE_INTEGER || expected < 0 ? current : expected;
export const serverToken = (expected: string, current: string) => expected || current;

export function imageSelected(record: { status?: string; is_selected?: boolean; discarded_at?: string | null }) {
  return contentAvailable(record) && (record.is_selected ?? record.status === "approved");
}
