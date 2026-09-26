import "server-only";
import { adminClient } from "./admin";

// Tokens de acceso en Supabase Vault, a través de RPCs SECURITY DEFINER que solo puede ejecutar
// `service_role` (supabase/migrations/…_integrations.sql). Portado del patrón de dropflex
// (set_store_token / get_store_token), con nombre por proveedor y borrado real (falla 9 del spec).
// Nunca se loguea un token.

export type TokenKind = "shopify" | "shopify_refresh" | "meta" | "higgsfield" | "gemini";

export async function setToken(kind: TokenKind, userId: string, token: string) {
  const { error } = await adminClient().rpc("set_integration_token", { p_kind: kind, p_user_id: userId, p_token: token });
  if (error) throw new Error(`No se pudo guardar el token (${kind}): ${error.message}`);
}

export async function getToken(kind: TokenKind, userId: string): Promise<string | null> {
  const { data, error } = await adminClient().rpc("get_integration_token", { p_kind: kind, p_user_id: userId });
  if (error) throw new Error(`No se pudo leer el token (${kind}): ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function deleteToken(kind: TokenKind, userId: string) {
  const { error } = await adminClient().rpc("delete_integration_token", { p_kind: kind, p_user_id: userId });
  if (error) throw new Error(`No se pudo borrar el token (${kind}): ${error.message}`);
}
