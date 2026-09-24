// Envíos y políticas de la tienda en merchant_settings (migración 20261009000000_store_policies.sql).
import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { ProductApiError } from "@/lib/products/http";
import { fromRow, marketLocale, policyProblems, POLICY_COLUMNS, toRow, type StorePolicies } from "./policies";

export interface PolicySettings {
  policies: StorePolicies;
  currency: string;
  timezone: string | null;
  /** Idioma del mercado para fechas de la tienda («es-CL»). */
  locale: string | null;
}

export async function getStorePolicies(userId: string): Promise<PolicySettings | null> {
  const { data, error } = await adminClient().from("merchant_settings").select(POLICY_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Leer envíos y políticas: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    policies: fromRow(row),
    currency: String(row.currency ?? "CLP").trim(),
    timezone: (row.timezone as string | null) ?? null,
    locale: marketLocale(row.language as string | null, row.country_code as string | null),
  };
}

export async function saveStorePolicies(userId: string, policies: StorePolicies): Promise<StorePolicies> {
  const problems = policyProblems(policies);
  const first = Object.entries(problems)[0];
  if (first) throw new ProductApiError(first[1]!, 400, first[0]);
  const db = adminClient();
  const { data } = await db.from("merchant_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new ProductApiError("Confirma tu mercado en Ajustes antes de guardar envíos y políticas.", 409);
  const { error } = await db
    .from("merchant_settings")
    .update({ ...toRow(policies), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`Guardar envíos y políticas: ${error.message}`);
  return policies;
}
