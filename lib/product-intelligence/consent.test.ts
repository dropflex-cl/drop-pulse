import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createConsentTicket } from "./consent-ticket";
const mocks = vi.hoisted(() => ({ claims: null as unknown, details: vi.fn(), approve: vi.fn(), deny: vi.fn(), revoke: vi.fn(), rpc: vi.fn(), events: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: mocks.claims } }), oauth: { getAuthorizationDetails: mocks.details, approveAuthorization: mocks.approve, denyAuthorization: mocks.deny, revokeGrant: mocks.revoke } } }) }));
vi.mock("./oauth-store", () => ({ oauthRpc: mocks.rpc }));
import { assertConsentOrigin, consentDecisionSchema, decideConsent, directMerchantSession, loadConsent, McpConsentRecoveryError, revokeMcpConnection } from "./consent";
const userId = "00000000-0000-4000-8000-000000000001", clientId = "00000000-0000-4000-8000-000000000002", authorizationId = "opaque-authorization";
const resourceUrl = "https://app.dropflex.test/api/mcp", redirectUri = "https://host.dropflex.test/callback";
const details = { authorization_id: authorizationId, client: { id: clientId, name: "Cliente" }, user: { id: userId, email: "fixture@example.test" }, redirect_uri: redirectUri, scope: "email offline_access" };
const context = { client_id: clientId, redirect_uri: redirectUri, status: "pending", has_active_grant: false };
const input = () => consentDecisionSchema.parse({ ticket: createConsentTicket({ userId, clientId, authorizationId, resourceUrl }, "x".repeat(40)), decision: "approve", scopes: ["product_intelligence:read"] });
describe("PI · consentimiento del dueño", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_ENABLED", "true"); vi.stubEnv("MCP_RESOURCE_URL", resourceUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.dropflex.test");
    mocks.claims = { sub: userId, role: "authenticated", aud: ["authenticated"], is_anonymous: false };
    mocks.events = []; mocks.details.mockReset().mockResolvedValue({ data: details, error: null });
    mocks.rpc.mockReset().mockImplementation(async (name: string) => { mocks.events.push(name); return name === "pi_oauth_authorization_context" ? context : null; });
    mocks.approve.mockReset().mockImplementation(async () => { mocks.events.push("approve"); return { data: { redirect_url: `${redirectUri}?code=fictitious` }, error: null }; });
    mocks.deny.mockReset().mockResolvedValue({ data: { redirect_url: `${redirectUri}?error=access_denied` }, error: null });
    mocks.revoke.mockReset().mockImplementation(async () => { mocks.events.push("revoke"); return { error: null }; });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("carga el consentimiento con los alcances OIDC que solicita ChatGPT", async () => {
    mocks.details.mockResolvedValue({ data: { ...details, scope: "openid email offline_access" }, error: null });
    const consent = await loadConsent(authorizationId);
    expect(consent).toMatchObject({ clientName: "Cliente", identityScopes: "openid email offline_access" });
    expect(consent.ticket).toEqual(expect.any(String));
    expect(mocks.events).toEqual(["pi_oauth_authorization_context"]);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it("aprobar con openid concede solo los permisos de dominio elegidos", async () => {
    mocks.details.mockResolvedValue({ data: { ...details, scope: "openid email offline_access" }, error: null });
    expect(await decideConsent(input())).toBe(`${redirectUri}?code=fictitious`);
    expect(mocks.events).toEqual(["pi_oauth_authorization_context", "pi_prepare_oauth_grant", "approve", "pi_activate_oauth_grant"]);
    expect(mocks.rpc.mock.calls[1][1].p_scopes).toEqual(["product_intelligence:read"]);
  });
  it("rechazar con openid no concede permisos de dominio", async () => {
    mocks.details.mockResolvedValue({ data: { ...details, scope: "openid email offline_access" }, error: null });
    expect(await decideConsent({ ...input(), decision: "deny" })).toContain("access_denied");
    expect(mocks.events).toEqual(["pi_oauth_authorization_context"]);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it.each(["profile", "phone", "admin"])("rechaza el alcance adicional %s al cargar y decidir", async (scope) => {
    mocks.details.mockResolvedValue({ data: { ...details, scope: `openid email offline_access ${scope}` }, error: null });
    await expect(loadConsent(authorizationId)).rejects.toThrow("no admite");
    await expect(decideConsent(input())).rejects.toThrow("no admite");
    expect(mocks.events).toEqual(["pi_oauth_authorization_context"]);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.deny).not.toHaveBeenCalled();
  });
  it("prepara y activa el grant solo alrededor del consentimiento nativo exitoso", async () => {
    expect(await decideConsent(input())).toBe(`${redirectUri}?code=fictitious`);
    expect(mocks.events).toEqual(["pi_oauth_authorization_context", "pi_prepare_oauth_grant", "approve", "pi_activate_oauth_grant"]);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_user_id: userId, p_client_id: clientId, p_scopes: ["product_intelligence:read"], p_resource_url: resourceUrl });
  });
  it("no activa el grant si falla Supabase después de prepararlo", async () => {
    mocks.approve.mockResolvedValue({ data: null, error: { message: "internal" } });
    await expect(decideConsent(input())).rejects.toThrow("Conecta de nuevo");
    expect(mocks.events).toEqual(["pi_oauth_authorization_context", "pi_prepare_oauth_grant"]);
  });
  it("rechazar no prepara, concede ni activa permisos de dominio", async () => {
    expect(await decideConsent({ ...input(), decision: "deny" })).toContain("access_denied");
    expect(mocks.events).toEqual(["pi_oauth_authorization_context"]);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it.each([{ sub: clientId }, { role: "pi_mcp", client_id: clientId }, { aud: resourceUrl }])("un token ajeno/delegado no aprueba otro grant: %j", async (change) => {
    mocks.claims = { ...mocks.claims as object, ...change };
    await expect(decideConsent(input())).rejects.toThrow();
    expect(mocks.approve).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no confía en usuario/cliente enviados por el proveedor si cambiaron desde el ticket", async () => {
    mocks.details.mockResolvedValue({ data: { ...details, client: { id: userId } }, error: null });
    await expect(decideConsent(input())).rejects.toThrow("cambió");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no redirige a un origen distinto", async () => {
    mocks.approve.mockResolvedValue({ data: { redirect_url: "https://evil.test/callback?code=fictitious" }, error: null });
    await expect(decideConsent(input())).rejects.toThrow("destino");
    expect(mocks.events).not.toContain("pi_activate_oauth_grant");
  });
  it("un consentimiento OAuth anterior no reactiva un grant de dominio revocado", async () => {
    mocks.details.mockResolvedValue({ data: { redirect_url: `${redirectUri}?code=fictitious` }, error: null });
    mocks.rpc.mockResolvedValue({ ...context, status: "approved" });
    await expect(loadConsent(authorizationId)).rejects.toThrow(McpConsentRecoveryError);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([]);
    mocks.rpc.mockResolvedValue({ ...context, status: "approved", has_active_grant: true });
    expect(await loadConsent(authorizationId)).toEqual({ redirectUrl: `${redirectUri}?code=fictitious` });
  });
  it("ofrece recuperación si el proveedor ya aprobó pero no devuelve otro código", async () => {
    mocks.details.mockResolvedValue({ data: null, error: { message: "authorization already approved" } });
    mocks.rpc.mockResolvedValue({ ...context, status: "approved" });
    await expect(loadConsent(authorizationId)).rejects.toThrow(McpConsentRecoveryError);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("una solicitud ajena o vencida no revela recuperación ni concede permisos", async () => {
    mocks.rpc.mockResolvedValue(null);
    await expect(loadConsent(authorizationId)).rejects.toThrow("venció");
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("revoca primero el acceso local aunque falle la limpieza de sesiones nativas", async () => {
    mocks.revoke.mockImplementation(async () => { mocks.events.push("revoke"); return { error: {} }; });
    await expect(revokeMcpConnection(clientId)).rejects.toThrow("quedó revocado");
    expect(mocks.events).toEqual(["pi_revoke_oauth_grant", "revoke"]);
  });
  it("protege POST/DELETE con Origin exacto y no admite tenant ni scopes desconocidos", async () => {
    expect(() => assertConsentOrigin(new Request("https://app.dropflex.test/api/mcp/oauth/consent", { headers: { Origin: "https://app.dropflex.test" } }))).not.toThrow();
    for (const origin of ["https://evil.test", "null", ""]) expect(() => assertConsentOrigin(new Request("https://app.dropflex.test/api/mcp/oauth/consent", { headers: { Origin: origin } }))).toThrow();
    expect(consentDecisionSchema.safeParse({ ...input(), user_id: clientId }).success).toBe(false);
    expect(consentDecisionSchema.safeParse({ ...input(), scopes: ["publish"] }).success).toBe(false);
    await expect(directMerchantSession()).resolves.toMatchObject({ userId });
  });
});
