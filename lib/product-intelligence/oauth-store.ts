import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import type { DelegatedIdentity } from "./oauth";

export async function checkLiveMcpGrant(identity: DelegatedIdentity, signal?: AbortSignal): Promise<unknown> {
  let query = adminClient().rpc("pi_check_oauth_grant", { p_user_id: identity.userId, p_client_id: identity.clientId, p_session_id: identity.sessionId, p_token_session_id: identity.tokenSessionId, p_version: identity.grantVersion, p_resource_url: identity.resourceUrl });
  const deadline = AbortSignal.timeout(5000);
  query = query.abortSignal(signal ? AbortSignal.any([signal, deadline]) : deadline);
  const { data, error } = await query;
  if (error) throw new Error("No pudimos comprobar la autorización MCP.");
  return data;
}

export async function oauthRpc(name: "pi_prepare_oauth_grant" | "pi_activate_oauth_grant" | "pi_revoke_oauth_grant" | "pi_oauth_authorization_context" | "pi_list_oauth_grants", args: Record<string, unknown>) {
  const { data, error } = await adminClient().rpc(name, args);
  if (error) throw new Error("No pudimos guardar la autorización. Conecta de nuevo el cliente MCP.");
  return data as unknown;
}
