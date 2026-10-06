import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { PI_SCOPES, type DelegatedGrant, type Principal } from "./policy";

const scopeSchema = z.enum(PI_SCOPES);
const scopesSchema = z.array(scopeSchema).min(1).max(6).refine((scopes) => new Set(scopes).size === scopes.length && scopes.includes("product_intelligence:read"));
const identitySchema = z.object({
  sub: z.uuid(), client_id: z.uuid(), session_id: z.uuid(), pi_auth_session_id: z.uuid(), role: z.literal("pi_mcp"),
  pi_scopes: scopesSchema, pi_grant_version: z.number().int().positive().max(2147483647),
  exp: z.number().int().positive(), iat: z.number().int().positive(), is_anonymous: z.literal(false),
});
const liveGrantSchema = z.object({
  user_id: z.uuid(), client_id: z.uuid(), scopes: scopesSchema, expires_at: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
}).strict();

export class McpAuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, message = "Conecta de nuevo el cliente MCP para autorizar el acceso.") { super(message); }
}
export interface McpConfiguration {
  resourceUrl: string;
  issuer: string;
  jwksUrl: string;
  allowedOrigins: readonly string[];
}

function trustedUrl(value: string | undefined): URL {
  if (!value) throw new McpAuthError(503, "La conexión MCP aún no está configurada.");
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return url;
  } catch { throw new McpAuthError(503, "La conexión MCP aún no está configurada."); }
}

/** Configuración explícita; nunca confiar en Host/X-Forwarded-* para construir audience. */
export function mcpConfiguration(env: Record<string, string | undefined> = process.env): McpConfiguration | null {
  if (env.MCP_ENABLED !== "true") return null;
  const app = trustedUrl(env.APP_URL);
  const resource = trustedUrl(env.MCP_RESOURCE_URL);
  const supabase = trustedUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (app.pathname !== "/" || resource.origin !== app.origin || resource.pathname !== "/api/mcp" || supabase.pathname !== "/") throw new McpAuthError(503, "La conexión MCP aún no está configurada.");
  const origins = [app.origin, ...(env.MCP_ALLOWED_ORIGINS?.split(",").filter(Boolean).map((value) => {
    const url = trustedUrl(value.trim());
    if (url.pathname !== "/") throw new McpAuthError(503);
    return url.origin;
  }) ?? [])];
  return { resourceUrl: resource.href, issuer: `${supabase.origin}/auth/v1`, jwksUrl: `${supabase.origin}/auth/v1/.well-known/jwks.json`, allowedOrigins: [...new Set(origins)] };
}

export interface DelegatedIdentity {
  userId: string; clientId: string; sessionId: string; tokenSessionId: string; grantVersion: number; resourceUrl: string;
  /** Exp del JWT firmado, para volver a comprobarlo tras esperar un lock en PostgreSQL. */
  tokenExpiresAt?: number;
}
export type CheckLiveGrant = (identity: DelegatedIdentity, signal?: AbortSignal) => Promise<unknown>;
export interface McpAuthentication {
  principal: Principal; grant: DelegatedGrant; identity: DelegatedIdentity; expiresAt: number;
}

export function createMcpAuthenticator(config: McpConfiguration, checkLiveGrant: CheckLiveGrant, options: { key?: JWTVerifyGetKey; now?: () => Date } = {}) {
  const key = options.key ?? createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5000 });
  return async (request: Request): Promise<McpAuthentication> => {
    const authorization = request.headers.get("authorization");
    if (!authorization || authorization.length > 16384 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(authorization)) throw new McpAuthError(401);
    const now = options.now?.() ?? new Date();
    let identity: z.infer<typeof identitySchema>;
    try {
      const verified = await jwtVerify(authorization.slice(7), key, { issuer: config.issuer, audience: config.resourceUrl, algorithms: ["ES256", "RS256"], currentDate: now, requiredClaims: ["iss", "aud", "exp", "iat", "sub"] });
      // JWT multi-audience también se rechaza: MCP no comparte el token con otro recurso.
      const audience = verified.payload.aud;
      if (audience !== config.resourceUrl && !(Array.isArray(audience) && audience.length === 1 && audience[0] === config.resourceUrl)) throw new Error();
      identity = identitySchema.parse(verified.payload);
      if (identity.iat > now.getTime() / 1000 + 5 || identity.iat >= identity.exp || identity.session_id === identity.pi_auth_session_id) throw new Error();
    } catch { throw new McpAuthError(401); }
    const delegated: DelegatedIdentity = { userId: identity.sub, clientId: identity.client_id, sessionId: identity.pi_auth_session_id, tokenSessionId: identity.session_id, grantVersion: identity.pi_grant_version, resourceUrl: config.resourceUrl, tokenExpiresAt: identity.exp };
    let raw: unknown;
    try { raw = await checkLiveGrant(delegated, request.signal); }
    catch { throw new McpAuthError(503, "No pudimos comprobar la autorización. Reintenta en unos momentos."); }
    const live = liveGrantSchema.safeParse(raw);
    if (!live.success || live.data.user_id !== identity.sub || live.data.client_id !== identity.client_id || live.data.version !== identity.pi_grant_version || Date.parse(live.data.expires_at) <= now.getTime()) throw new McpAuthError(401);
    const scopes = identity.pi_scopes.filter((scope) => live.data.scopes.includes(scope));
    if (!scopes.includes("product_intelligence:read")) throw new McpAuthError(403);
    const principal: Principal = Object.freeze({ userId: identity.sub, actorId: identity.client_id, actorKind: "delegated", clientId: identity.client_id, scopes: Object.freeze(scopes) });
    return { principal, identity: delegated, expiresAt: Math.min(identity.exp, Math.floor(Date.parse(live.data.expires_at) / 1000)), grant: { userId: identity.sub, actorId: identity.client_id, clientId: identity.client_id, productId: null, scopes, expiresAt: live.data.expires_at, revoked: false } };
  };
}

export function protectedResourceMetadata(config: McpConfiguration) {
  // scopes OAuth nativos de identidad; PI_SCOPES se eligen en nuestra pantalla y viven en grants.
  return { resource: config.resourceUrl, authorization_servers: [config.issuer], scopes_supported: ["email", "offline_access"], bearer_methods_supported: ["header"], resource_name: "DropFlex Product Intelligence" };
}

export function assertMcpRequestOrigin(request: Request, config: McpConfiguration): void {
  const url = new URL(request.url);
  const resource = new URL(config.resourceUrl);
  if (url.origin !== resource.origin || request.headers.has("host") && request.headers.get("host") !== resource.host) throw new McpAuthError(403, "El dominio de la solicitud no está autorizado.");
  const origin = request.headers.get("origin");
  if (origin && !config.allowedOrigins.includes(origin)) throw new McpAuthError(403, "El origen de la solicitud no está autorizado.");
}
