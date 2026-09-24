// Tope de gasto en IA por producto (Ajustes › Costo de IA; design-system/arquitectura.md › 11).
// En la moneda de la tienda. Avisa desde el 80% y, sobre el tope, regenerar pide confirmación.
import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { ProductApiError } from "@/lib/products/http";

export async function getAiCostCap(userId: string): Promise<{ cap: number | null; currency: string } | null> {
  const { data, error } = await adminClient().from("merchant_settings").select("ai_cost_cap, currency").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Leer el tope de IA: ${error.message}`);
  const row = data as { ai_cost_cap: number | string | null; currency: string } | null;
  return row ? { cap: row.ai_cost_cap == null ? null : Number(row.ai_cost_cap), currency: row.currency } : null;
}

/** `null` quita el tope. */
export async function saveAiCostCap(userId: string, amount: number | null): Promise<void> {
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new ProductApiError("Escribe un monto mayor que cero, o déjalo vacío para no tener tope.", 400, "amount");
  const db = adminClient();
  const { data } = await db.from("merchant_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new ProductApiError("Confirma tu mercado en Ajustes antes de definir el tope.", 409);
  const { error } = await db.from("merchant_settings").update({ ai_cost_cap: amount, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new Error(`Guardar el tope de IA: ${error.message}`);
}
