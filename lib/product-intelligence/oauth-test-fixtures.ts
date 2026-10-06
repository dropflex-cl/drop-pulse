import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import type { McpConfiguration } from "./oauth";
import { PI_SCOPES } from "./policy";

export const oauthTestIds = { user: "00000000-0000-4000-8000-000000000001", client: "00000000-0000-4000-8000-000000000002", session: "00000000-0000-4000-8000-000000000003", authSession: "00000000-0000-4000-8000-000000000004" };
export const oauthTestConfig: McpConfiguration = { resourceUrl: "https://app.dropflex.test/api/mcp", issuer: "https://supabase.dropflex.test/auth/v1", jwksUrl: "https://supabase.dropflex.test/auth/v1/.well-known/jwks.json", allowedOrigins: ["https://app.dropflex.test"] };
export async function oauthFixture() {
  const now = new Date("2026-10-06T12:00:00Z");
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const key = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "local-test", alg: "ES256" }] });
  const grant = { user_id: oauthTestIds.user, client_id: oauthTestIds.client, scopes: [...PI_SCOPES], expires_at: "2026-10-07T12:00:00Z", version: 1 };
  const claims: JWTPayload = { sub: oauthTestIds.user, client_id: oauthTestIds.client, session_id: oauthTestIds.session, pi_auth_session_id: oauthTestIds.authSession, role: "pi_mcp", pi_scopes: [...PI_SCOPES], pi_grant_version: 1, is_anonymous: false, iat: now.getTime() / 1000, exp: now.getTime() / 1000 + 3600, iss: oauthTestConfig.issuer, aud: oauthTestConfig.resourceUrl };
  const token = async (override: JWTPayload = {}) => new SignJWT({ ...claims, ...override }).setProtectedHeader({ alg: "ES256", kid: "local-test" }).sign(privateKey);
  const request = async (override: JWTPayload = {}) => new Request(oauthTestConfig.resourceUrl, { headers: { Authorization: `Bearer ${await token(override)}` } });
  return { now: () => now, key, grant, token, request };
}
