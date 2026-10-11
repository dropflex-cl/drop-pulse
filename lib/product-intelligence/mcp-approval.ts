import { prepareVisualReview, vHash, type VisualState } from "./visual-domain";
import type { VisualRecord } from "./visual-schemas";

/** Alias compatible: guardar deja disponible; publicar es otra acción. Conserva descartes anteriores. */
export function approveMcpVisual(record: VisualRecord, previous?: VisualRecord): VisualRecord {
  if (previous && ["rejected", "archived"].includes(previous.status)) {
    const payload = { ...record.payload, ...(previous.payload.archived_at ? { archived_at: previous.payload.archived_at } : {}) };
    return { ...record, status: previous.status, payload, etag: vHash({ kind: record.kind, status: previous.status, payload, version: record.version }) };
  }
  const status = record.kind === "binding" ? "selected" : ["identity", "plan", "asset"].includes(record.kind) ? "approved" : record.status;
  const payload = { ...record.payload, ...(record.kind === "binding" ? { selected: true } : {}) };
  return { ...record, status, payload, etag: vHash({ kind: record.kind, status, payload, version: record.version }) };
}

/** Selecciona con los mismos controles de archivo, destino y formato que la revisión manual. */
export function selectMcpBindings(state: VisualState, bindings: VisualRecord[]): VisualRecord[] {
  const staged = { ...state, records: [...state.records] };
  const changes = new Map<string, VisualRecord>();
  for (const binding of bindings) {
    staged.records = [...staged.records.filter(r => r.id !== binding.id), binding];
    const reviewed = prepareVisualReview(staged, { record_id: binding.id, decision: "select", reason: "Guardado desde el MCP", tags: [] });
    for (const record of reviewed.filter(r => r.kind === "binding")) {
      const next = record.id === binding.id ? approveMcpVisual({ ...record, version: binding.version }) : record;
      changes.set(next.id, next);
      staged.records = [...staged.records.filter(r => r.id !== next.id), next];
    }
  }
  return [...changes.values()];
}
