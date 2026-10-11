import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { VisualRepository } from "./repository";
import type { visualTransferEventSchema } from "./visual-schemas";

export type VisualTransferEvent = z.infer<typeof visualTransferEventSchema>;
/** Telemetría sin URLs, tokens ni mensajes arbitrarios del proveedor. No cambia CAS. */
export async function recordServerVisualEvent(repository: VisualRepository, access: Record<string, unknown>, productId: string,
  event: Omit<VisualTransferEvent, "event_id">) {
  const payload = { ...event, event_id: randomUUID(), reported_by: "server" };
  console.info("[visual-transfer]", JSON.stringify({ product_id: productId, ...payload }));
  if (!repository.visualTransfer) return;
  const persist = async () => {
    const started = performance.now();
    try {
      await repository.visualTransfer!({ p_access: access, p_product_id: productId, p_event: payload }, AbortSignal.timeout(3000));
      console.info("[visual-transfer/persistence]", JSON.stringify({ event_id: payload.event_id, persisted: true, telemetry_ms: performance.now() - started }));
    } catch {
      // El evento completo ya está en el log del runtime; no registrar tokens o errores del proveedor.
      console.warn("[visual-transfer/persistence]", JSON.stringify({ event_id: payload.event_id, persisted: false, telemetry_ms: performance.now() - started }));
    }
  };
  if (repository.deferVisualTelemetry) {
    try { repository.deferVisualTelemetry(persist); return; }
    catch { /* Fuera de un runtime con after: esperar garantiza que no quede una promesa huérfana. */ }
  }
  await persist();
}
