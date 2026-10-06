import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stateSecret } from "@/lib/integrations/env";
import { createConsentTicket, verifyConsentTicket } from "./consent-ticket";
import { McpAuthError, mcpConfiguration } from "./oauth";
import { oauthRpc } from "./oauth-store";
import { PI_SCOPES } from "./policy";
import { isMerchantSessionClaims } from "@/lib/supabase/merchant-claims";

export const authorizationIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
const contextSchema = z.object({ client_id: z.uuid(), redirect_uri: z.url(), status: z.enum(["pending", "approved", "denied", "expired"]), has_active_grant: z.boolean() }).strict();
export const consentDecisionSchema = z.object({ ticket: z.string().min(1).max(4096), decision: z.enum(["approve", "deny"]), scopes: z.array(z.enum(PI_SCOPES)).min(1).max(6).refine((scopes) => new Set(scopes).size === scopes.length && scopes.includes("product_intelligence:read")) }).strict();

/** Una sesión delegada no puede ampliar permisos, consentir ni revocar otra conexión. */
export async function directMerchantSession() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !isMerchantSessionClaims(claims)) throw new McpAuthError(401, "Inicia sesión en DropFlex para decidir esta conexión.");
  return { client, userId: claims.sub };
}

export function requireConsentConfiguration() {
  const config = mcpConfiguration();
  if (!config) throw new McpAuthError(503, "La conexión MCP todavía no está habilitada.");
  return config;
}

function safeRedirect(url: string, registeredUri: string): string {
  const redirect = new URL(url);
  const registered = new URL(registeredUri);
  const allowedProtocol = redirect.protocol === "https:" || redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if (!allowedProtocol || redirect.username || redirect.password || redirect.origin !== registered.origin || redirect.pathname !== registered.pathname || [...registered.searchParams].some(([key, value]) => redirect.searchParams.get(key) !== value)) throw new Error("El destino del cliente no es válido. Conéctalo de nuevo.");
  return redirect.href;
}

export async function loadConsent(authorizationId: string) {
  authorizationIdSchema.parse(authorizationId);
  const config = requireConsentConfiguration();
  const { client, userId } = await directMerchantSession();
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) throw new Error("La solicitud de conexión venció. Conecta de nuevo el cliente MCP.");
  const context = contextSchema.parse(await oauthRpc("pi_oauth_authorization_context", { p_user_id: userId, p_authorization_id: authorizationId, p_resource_url: config.resourceUrl }));
  if ("redirect_url" in data) {
    if (!context.has_active_grant || context.status !== "approved") throw new Error("El permiso de este cliente venció. Revoca su conexión y vuelve a conectarlo.");
    return { redirectUrl: safeRedirect(data.redirect_url, context.redirect_uri) };
  }
  if (data.user.id !== userId || data.client.id !== context.client_id || data.authorization_id !== authorizationId || context.status !== "pending") throw new Error("La solicitud de conexión no es válida. Conecta de nuevo el cliente MCP.");
  if (data.scope.split(/\s+/).some((scope) => !["email", "offline_access"].includes(scope))) throw new Error("El cliente solicita permisos de identidad que MCP no admite. Conéctalo usando email y offline_access.");
  return { clientName: data.client.name?.slice(0, 160) || "Cliente MCP", identityScopes: data.scope, ticket: createConsentTicket({ userId, clientId: context.client_id, authorizationId, resourceUrl: config.resourceUrl }, stateSecret()) };
}

export async function decideConsent(input: z.infer<typeof consentDecisionSchema>): Promise<string> {
  const config = requireConsentConfiguration();
  const { client, userId } = await directMerchantSession();
  const ticket = verifyConsentTicket(input.ticket, stateSecret());
  if (ticket.userId !== userId || ticket.resourceUrl !== config.resourceUrl) throw new McpAuthError(403);
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(ticket.authorizationId);
  if (error || !data || "redirect_url" in data || data.user.id !== userId || data.client.id !== ticket.clientId || data.authorization_id !== ticket.authorizationId) throw new Error("La solicitud de conexión cambió. Conecta de nuevo el cliente MCP.");
  if (data.scope.split(/\s+/).some((scope) => !["email", "offline_access"].includes(scope))) throw new Error("El cliente solicita permisos de identidad que MCP no admite.");
  const context = contextSchema.parse(await oauthRpc("pi_oauth_authorization_context", { p_user_id: userId, p_authorization_id: ticket.authorizationId, p_resource_url: config.resourceUrl }));
  if (context.client_id !== ticket.clientId || context.status !== "pending") throw new Error("La solicitud de conexión cambió. Conecta de nuevo el cliente MCP.");
  if (input.decision === "deny") {
    const denied = await client.auth.oauth.denyAuthorization(ticket.authorizationId, { skipBrowserRedirect: true });
    if (denied.error || !denied.data) throw new Error("No pudimos rechazar la conexión. Reintenta.");
    return safeRedirect(denied.data.redirect_url, context.redirect_uri);
  }
  await oauthRpc("pi_prepare_oauth_grant", { p_user_id: userId, p_client_id: ticket.clientId, p_authorization_id: ticket.authorizationId, p_resource_url: config.resourceUrl, p_scopes: input.scopes });
  // La fila sigue inactiva hasta que Supabase confirme consentimiento. Un fallo entre pasos no da acceso.
  const approved = await client.auth.oauth.approveAuthorization(ticket.authorizationId, { skipBrowserRedirect: true });
  if (approved.error || !approved.data) throw new Error("No pudimos autorizar la conexión. Conecta de nuevo el cliente MCP.");
  const destination = safeRedirect(approved.data.redirect_url, context.redirect_uri);
  await oauthRpc("pi_activate_oauth_grant", { p_user_id: userId, p_client_id: ticket.clientId, p_authorization_id: ticket.authorizationId });
  return destination;
}

export async function revokeMcpConnection(clientId: string): Promise<void> {
  z.uuid().parse(clientId);
  requireConsentConfiguration();
  const { client, userId } = await directMerchantSession();
  // La revocación local es inmediata incluso si falla la limpieza de refresh tokens en Supabase.
  await oauthRpc("pi_revoke_oauth_grant", { p_user_id: userId, p_client_id: clientId });
  const { error } = await client.auth.oauth.revokeGrant({ clientId });
  if (error) throw new Error("El acceso MCP quedó revocado. Reintenta para cerrar también las sesiones del proveedor.");
}

export function assertConsentOrigin(request: Request): void {
  const config = requireConsentConfiguration();
  const origin = new URL(config.resourceUrl).origin;
  if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new McpAuthError(403, "Abre la autorización desde DropFlex y vuelve a intentarlo.");
}
