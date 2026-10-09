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
  try { await repository.visualTransfer({ p_access: access, p_product_id: productId, p_event: payload }, AbortSignal.timeout(3000)); }
  catch { console.warn("[visual-transfer]", "No pudimos persistir el evento técnico."); }
}
