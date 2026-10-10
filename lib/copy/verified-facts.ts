import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { fail } from "@/lib/products/database";
/** Opciones de respaldo de la hoja: el mismo criterio de uso que aplica el MCP. */
export async function verifiedPageFacts(userId: string, productId: string) {
  const db = adminClient();
  const [facts, evidence] = await Promise.all([
    db
      .from("pi_facts")
      .select("id,statement")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("verification_status", "verified")
      .eq("usage_status", "approved")
      .order("statement")
      .limit(100),
    db
      .from("pi_fact_evidence")
      .select("fact_id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("relation", "contradicts")
      .limit(500),
  ]);
  fail("Leer los hechos verificados", facts.error);
  fail("Leer el respaldo de los hechos", evidence.error);
  const restricted = new Set((evidence.data ?? []).map((e) => e.fact_id));
  return (facts.data ?? []).filter((f) => !restricted.has(f.id));
}
