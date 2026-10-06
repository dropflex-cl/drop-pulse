/** Prueba destructiva solo sobre sus propios fixtures, obligatoriamente en Supabase local. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { createMcpAuthenticator, type DelegatedIdentity, type McpConfiguration } from "../lib/product-intelligence/oauth";
import { PI_SCOPES } from "../lib/product-intelligence/policy";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, "http://127.0.0.1:55321", "Esta prueba solo puede escribir en Supabase local (puerto 55321).");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(serviceKey && publicKey, "Carga las variables locales sin imprimir sus claves.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const resourceUrl = "http://localhost:3000/api/mcp";
const config: McpConfiguration = { resourceUrl, issuer: `${url}/auth/v1`, jwksUrl: `${url}/auth/v1/.well-known/jwks.json`, allowedOrigins: ["http://localhost:3000"] };
const users: string[] = [], clients: string[] = [];
let checks = 0;
const checked = () => { checks++; };
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  assert(!error, `${name} falló (${error?.code ?? "unknown"}).`);
  return data;
}
async function liveGrant(identity: DelegatedIdentity) {
  return rpc("pi_check_oauth_grant", { p_user_id: identity.userId, p_client_id: identity.clientId, p_session_id: identity.sessionId, p_token_session_id: identity.tokenSessionId, p_version: identity.grantVersion, p_resource_url: identity.resourceUrl });
}
const authenticate = createMcpAuthenticator(config, liveGrant);
async function user() {
  const email = `pi-oauth-${randomBytes(8).toString("hex")}@example.test`, password = randomBytes(32).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, `Crear fixture falló (${created.error?.code}).`);
  users.push(created.data.user.id);
  const client = createClient(url!, publicKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert(!login.error && login.data.session, `Login local falló (${login.error?.code}).`);
  const claims = decodeJwt(login.data.session.access_token);
  assert.equal(claims.role, "authenticated"); assert(claims.aud === "authenticated" || Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === "authenticated"); assert(!claims.client_id); checked();
  return { id: created.data.user.id, client, session: login.data.session };
}
async function register() {
  const result = await admin.auth.admin.oauth.createClient({ client_name: "PI fixture local", redirect_uris: ["http://localhost:3000/pi-test-callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "email offline_access" });
  assert(!result.error && result.data, `Registrar cliente falló (${result.error?.code}).`);
  clients.push(result.data.client_id);
  assert.equal(result.data.client_type, "public"); checked();
  return result.data.client_id;
}
async function authorize(clientId: string, session: string, scopes = "email offline_access") {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "http://localhost:3000/pi-test-callback", scope: scopes, code_challenge: challenge, code_challenge_method: "S256", resource: resourceUrl, state: randomBytes(16).toString("hex"), prompt: "consent" });
  const response = await fetch(`${url}/auth/v1/oauth/authorize?${params}`, { redirect: "manual", headers: { Authorization: `Bearer ${session}` } });
  assert.equal(response.status, 302, `Authorize falló (HTTP ${response.status}).`);
  const target = new URL(response.headers.get("location")!);
  const authorizationId = target.searchParams.get("authorization_id");
  assert(authorizationId, "Supabase no devolvió una solicitud de consentimiento.");
  return { authorizationId, verifier, state: params.get("state")! };
}
async function consent(merchant: { id: string; client: SupabaseClient }, clientId: string, authorizationId: string, scopes = [...PI_SCOPES]) {
  const details = await merchant.client.auth.oauth.getAuthorizationDetails(authorizationId);
  assert(!details.error && details.data && !("redirect_url" in details.data), `Details falló (${details.error?.code}).`);
  assert.equal(details.data.user.id, merchant.id);
  const context = await rpc("pi_oauth_authorization_context", { p_user_id: merchant.id, p_authorization_id: authorizationId, p_resource_url: resourceUrl });
  assert.equal(context?.client_id, clientId); checked();
  await rpc("pi_prepare_oauth_grant", { p_user_id: merchant.id, p_client_id: clientId, p_authorization_id: authorizationId, p_resource_url: resourceUrl, p_scopes: scopes });
  const approved = await merchant.client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  assert(!approved.error && approved.data, `Consent falló (${approved.error?.code}).`);
  await rpc("pi_activate_oauth_grant", { p_user_id: merchant.id, p_client_id: clientId, p_authorization_id: authorizationId });
  return new URL(approved.data.redirect_url);
}
async function exchange(clientId: string, code: string, verifier: string) {
  const response = await fetch(`${url}/auth/v1/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: "http://localhost:3000/pi-test-callback", resource: resourceUrl }) });
  const data = await response.json();
  assert(response.ok, `Exchange falló (HTTP ${response.status}, ${data.error ?? "unknown"}).`);
  return data as { access_token: string; refresh_token: string };
}
async function verify(token: string) {
  const result = await authenticate(new Request(resourceUrl, { headers: { Authorization: `Bearer ${token}` } }));
  checked(); return result;
}
async function main() {
try {
  const metadata = await discoverAuthorizationServerMetadata(new URL(config.issuer));
  assert.equal(metadata?.issuer, config.issuer); checked();
  const first = await user(), second = await user(), clientId = await register();
  const request = await authorize(clientId, first.session.access_token);
  const redirect = await consent(first, clientId, request.authorizationId);
  assert.equal(redirect.searchParams.get("state"), request.state);
  const badPkce = await fetch(`${url}/auth/v1/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: redirect.searchParams.get("code")!, code_verifier: "x".repeat(43), redirect_uri: "http://localhost:3000/pi-test-callback", resource: resourceUrl }) });
  assert(!badPkce.ok, "Supabase aceptó un verifier PKCE ajeno."); checked();
  const tokens = await exchange(clientId, redirect.searchParams.get("code")!, request.verifier);
  assert(tokens.refresh_token, "El proveedor no devolvió refresh token.");
  const auth = await verify(tokens.access_token);
  assert.equal(auth.principal.userId, first.id); assert.deepEqual(auth.principal.scopes, PI_SCOPES);
  assert.equal(await liveGrant({ ...auth.identity, userId: second.id }), null); checked();
  await assert.rejects(verify(first.session.access_token), { status: 401 }); checked();
  const forbiddenAuthUpdate = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers: { Authorization: `Bearer ${tokens.access_token}`, apikey: publicKey!, "Content-Type": "application/json" }, body: JSON.stringify({ data: { pi_fixture_unauthorized_update: true } }) });
  assert(forbiddenAuthUpdate.status === 401 || forbiddenAuthUpdate.status === 403, `Supabase Auth aceptó escritura con bearer MCP (HTTP ${forbiddenAuthUpdate.status}).`); checked();
  const genericApis = [
    { path: "/rest/v1/products?select=id", body: null },
    { path: "/rest/v1/rpc/set_base_reference_image", body: { p_user_id: first.id, p_product_id: "00000000-0000-4000-8000-000000000090", p_image_id: "00000000-0000-4000-8000-000000000091" } },
    { path: "/storage/v1/object/list/product-references", body: { prefix: first.id, limit: 1 } },
  ];
  for (const { path, body } of genericApis) {
    const response = await fetch(`${url}${path}`, { method: body === null ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens.access_token}`, apikey: publicKey!, "Content-Type": "application/json" }, ...(body === null ? {} : { body: JSON.stringify(body) }) });
    const failure = await response.json();
    const invalidJwt = path.startsWith("/storage/") && response.status === 400 && /JWT|audience|aud claim/i.test(String(failure.error) + String(failure.message));
    const forbiddenRole = path.startsWith("/storage/") && response.status === 400 && /permission denied to set role|must be able to set role/i.test(String(failure.message)) && /pi_mcp/i.test(String(failure.message));
    assert(response.status === 401 || response.status === 403 || invalidJwt || forbiddenRole, `El bearer MCP alcanzó una API genérica (${path}, HTTP ${response.status}).`); checked();
  }
  const refreshed = await fetch(`${url}/auth/v1/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource: resourceUrl }) });
  const renewed = await refreshed.json(); assert(refreshed.ok, `Refresh falló (HTTP ${refreshed.status}, ${renewed.error ?? "unknown"}).`);
  const refreshAuth = await verify(renewed.access_token); assert.equal(refreshAuth.principal.userId, first.id);
  const regularRefresh = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: publicKey!, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: renewed.refresh_token }) });
  if (regularRefresh.ok) {
    const regular = await regularRefresh.json();
    assert.equal(decodeJwt(regular.access_token).role, "pi_mcp", "El refresh genérico convirtió una sesión delegada en sesión SaaS.");
    await verify(regular.access_token);
  }
  checked();
  await rpc("pi_revoke_oauth_grant", { p_user_id: first.id, p_client_id: clientId });
  await assert.rejects(verify(tokens.access_token), { status: 401 }); checked();
  await assert.rejects(verify(renewed.access_token), { status: 401 }); checked();
  const revoked = await first.client.auth.oauth.revokeGrant({ clientId }); assert(!revoked.error); checked();
  const afterRevoke = await fetch(`${url}/auth/v1/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: renewed.refresh_token, resource: resourceUrl }) });
  assert(!afterRevoke.ok, "El proveedor renovó una sesión revocada."); checked();
  const stillMerchant = await first.client.auth.refreshSession(); assert(!stillMerchant.error && stillMerchant.data.session);
  assert.equal(decodeJwt(stillMerchant.data.session.access_token).role, "authenticated"); checked();
  console.log(JSON.stringify({ environment: "local", checks, pkce: true, refresh: true, revocation: true, isolated_api_role: true }));
} finally {
  for (const clientId of clients) { const { error } = await admin.auth.admin.oauth.deleteClient(clientId); assert(!error, "No pudimos retirar el cliente fixture local."); }
  for (const userId of users) { const { error } = await admin.auth.admin.deleteUser(userId); assert(!error, "No pudimos retirar el usuario fixture local."); }
}
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falló la prueba OAuth local."); process.exitCode = 1; });
