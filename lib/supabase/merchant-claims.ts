interface MerchantClaims {
  sub: string;
  email?: unknown;
  app_metadata?: unknown;
}
/** Solo después de getClaims(): la firma verificada no convierte un token MCP en sesión UI. */
export function isMerchantSessionClaims(value: unknown): value is MerchantClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  const audience = claims.aud;
  const directAudience = audience === "authenticated" || Array.isArray(audience) && audience.length === 1 && audience[0] === "authenticated";
  return typeof claims.sub === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) && claims.role === "authenticated" && claims.is_anonymous === false && claims.client_id == null && claims.pi_auth_session_id == null && directAudience;
}
