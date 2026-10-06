import { describe, expect, it, vi } from "vitest";
import { assertMcpRequestOrigin, createMcpAuthenticator, McpAuthError, mcpConfiguration, protectedResourceMetadata } from "./oauth";
import { createConsentTicket, verifyConsentTicket } from "./consent-ticket";
import { PI_SCOPES } from "./policy";
import { oauthFixture, oauthTestConfig, oauthTestIds } from "./oauth-test-fixtures";


describe("PI · bearer OAuth", () => {
  it("deriva el principal solo del JWT firmado y del grant vivo", async () => {
    const fixture = await oauthFixture();
    const check = vi.fn(async () => fixture.grant);
    const result = await createMcpAuthenticator(oauthTestConfig, check, fixture)(await fixture.request());
    expect(result.principal).toEqual({ userId: oauthTestIds.user, actorId: oauthTestIds.client, clientId: oauthTestIds.client, actorKind: "delegated", scopes: PI_SCOPES });
    expect(check.mock.calls[0]).toBeDefined();
    expect(Object.isFrozen(result.principal.scopes)).toBe(true);
  });
  it.each([
    { aud: "authenticated" }, { aud: [oauthTestConfig.resourceUrl, "other"] }, { role: "authenticated" },
    { iss: "https://evil.test/auth/v1" }, { exp: 1 }, { iat: 1800000000 }, { client_id: undefined },
    { session_id: undefined }, { pi_auth_session_id: undefined }, { pi_auth_session_id: oauthTestIds.session }, { pi_grant_version: 0 }, { is_anonymous: true }, { pi_scopes: ["admin"] },
  ])("rechaza claims fuera del recurso antes de leer la base: %j", async (override) => {
    const fixture = await oauthFixture();
    const check = vi.fn(async () => fixture.grant);
    await expect(createMcpAuthenticator(oauthTestConfig, check, fixture)(await fixture.request(override))).rejects.toMatchObject({ status: 401 });
    expect(check).not.toHaveBeenCalled();
  });
  it("una cookie no es bearer y una firma alterada no consulta grants", async () => {
    const fixture = await oauthFixture(); const check = vi.fn(async () => fixture.grant);
    const authenticate = createMcpAuthenticator(oauthTestConfig, check, fixture);
    await expect(authenticate(new Request(oauthTestConfig.resourceUrl, { headers: { Cookie: "session=merchant" } }))).rejects.toMatchObject({ status: 401 });
    const token = await fixture.token(); const [head, body, signature] = token.split(".");
    await expect(authenticate(new Request(oauthTestConfig.resourceUrl, { headers: { Authorization: `Bearer ${head}.${body}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}` } }))).rejects.toMatchObject({ status: 401 });
    expect(check).not.toHaveBeenCalled();
  });
  it.each([null, { version: 2 }, { user_id: oauthTestIds.client }, { expires_at: "2026-10-01T00:00:00Z" }])("vencimiento, revocación y reemplazo niegan el JWT todavía vigente: %j", async (change) => {
    const fixture = await oauthFixture();
    const check = async () => change === null ? null : { ...fixture.grant, ...change };
    await expect(createMcpAuthenticator(oauthTestConfig, check, fixture)(await fixture.request())).rejects.toMatchObject({ status: 401 });
  });
  it("nunca amplía los permisos firmados aunque el grant actual tenga más", async () => {
    const fixture = await oauthFixture();
    const authenticate = createMcpAuthenticator(oauthTestConfig, async () => ({ ...fixture.grant, scopes: ["product_intelligence:read", "ugc:generate"] }), fixture);
    const result = await authenticate(await fixture.request({ pi_scopes: ["product_intelligence:read", "product_intelligence:write"] }));
    expect(result.principal.scopes).toEqual(["product_intelligence:read"]);
  });
  it("falla cerrado con mensaje seguro cuando la base no responde", async () => {
    const fixture = await oauthFixture();
    const authenticate = createMcpAuthenticator(oauthTestConfig, async () => { throw new Error("secret database internals"); }, fixture);
    await expect(authenticate(await fixture.request())).rejects.toMatchObject({ status: 503 });
    await expect(authenticate(await fixture.request())).rejects.not.toThrow("secret");
  });
});

describe("PI · configuración y consentimiento", () => {
  it("permanece deshabilitado sin flag y exige un recurso canónico explícito", () => {
    expect(mcpConfiguration({})).toBeNull();
    const env = { MCP_ENABLED: "true", APP_URL: "https://app.dropflex.test", MCP_RESOURCE_URL: oauthTestConfig.resourceUrl, NEXT_PUBLIC_SUPABASE_URL: "https://supabase.dropflex.test" };
    expect(mcpConfiguration(env)).toEqual(oauthTestConfig);
    for (const resource of ["https://evil.test/api/mcp", "https://app.dropflex.test/api/mcp?secret=x", "https://user:password@app.dropflex.test/api/mcp", "http://app.dropflex.test/api/mcp", "https://app.dropflex.test/api/mcp/other"]) expect(() => mcpConfiguration({ ...env, MCP_RESOURCE_URL: resource })).toThrow(McpAuthError);
    expect(protectedResourceMetadata(oauthTestConfig).scopes_supported).toEqual(["email", "offline_access"]);
  });
  it("admite clientes servidor sin Origin y bloquea DNS rebinding/orígenes externos", () => {
    expect(() => assertMcpRequestOrigin(new Request(oauthTestConfig.resourceUrl), oauthTestConfig)).not.toThrow();
    const invalidHeaders: Record<string, string>[] = [{ Origin: "https://evil.test" }, { Host: "evil.test" }, { Origin: "null" }];
    for (const headers of invalidHeaders) expect(() => assertMcpRequestOrigin(new Request(oauthTestConfig.resourceUrl, { headers }), oauthTestConfig)).toThrow();
  });
  it("firma un ticket acotado a usuario, cliente, solicitud y recurso, con vencimiento", () => {
    const now = new Date("2026-10-06T12:00:00Z"), secret = "x".repeat(40);
    const input = { userId: oauthTestIds.user, clientId: oauthTestIds.client, authorizationId: "authorization-test", resourceUrl: oauthTestConfig.resourceUrl };
    const ticket = createConsentTicket(input, secret, now);
    expect(verifyConsentTicket(ticket, secret, now)).toMatchObject(input);
    expect(() => verifyConsentTicket(ticket, "z".repeat(40), now)).toThrow("venció");
    expect(() => verifyConsentTicket(ticket, secret, new Date(now.getTime() + 600000))).toThrow("venció");
    expect(() => verifyConsentTicket(`${ticket.slice(0, -10)}tampered`, secret, now)).toThrow("venció");
  });
});
