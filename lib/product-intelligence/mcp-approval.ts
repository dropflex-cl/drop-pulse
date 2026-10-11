import { prepareVisualReview, vHash, type VisualState } from "./visual-domain";
import type { VisualRecord } from "./visual-schemas";

/** Guardar desde el MCP es la decisión de aprobación; publicar sigue siendo otra acción. */
export function approveMcpVisual(record: VisualRecord): VisualRecord {
  const status = record.kind === "binding" ? "selected" : ["identity", "plan", "asset"].includes(record.kind) ? "approved" : record.status;
  const payload = { ...record.payload, approval_source: "mcp" };
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
