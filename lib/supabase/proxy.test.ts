import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ claims: null as null | Record<string, unknown>, getClaims: vi.fn() }));
vi.mock("../utils", () => ({ hasEnvVars: true }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: mocks.getClaims } }) }));
import { updateSession } from "./proxy";

describe("proxy · excepción MCP exacta", () => {
  beforeEach(() => { mocks.claims = null; mocks.getClaims.mockReset().mockImplementation(async () => ({ data: { claims: mocks.claims } })); });
  it.each(["/api/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"])("deja llegar %s al verificador propio", async (path) => {
    const result = await updateSession(new NextRequest(`https://app.dropflex.test${path}`));
    expect(result.status).toBe(200); expect(result.headers.has("location")).toBe(false);
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });
  it.each(["/api/mcp/other", "/api/mcp/oauth/consent", "/api/mcp/oauth/connections/client", "/api/products/one", "/api/mcpevil"])("conserva el 401 JSON de %s sin sesión", async (path) => {
    const result = await updateSession(new NextRequest(`https://app.dropflex.test${path}`));
    expect(result.status).toBe(401); expect(await result.json()).toHaveProperty("error");
  });
  it("mantiene next y las rutas privadas, incluso otros well-known", async () => {
    for (const path of ["/oauth/consent?authorization_id=one", "/today", "/.well-known/other"]) {
      const result = await updateSession(new NextRequest(`https://app.dropflex.test${path}`));
      const url = new URL(result.headers.get("location")!);
      expect(url.pathname).toBe("/auth/login"); expect(url.searchParams.get("next")).toBe(path);
    }
    mocks.claims = { sub: "00000000-0000-4000-8000-000000000001", role: "authenticated", aud: "authenticated", is_anonymous: false };
    expect((await updateSession(new NextRequest("https://app.dropflex.test/today"))).status).toBe(200);
  });
  it("un JWT MCP metido en una cookie no autoriza el SaaS", async () => {
    mocks.claims = { sub: "00000000-0000-4000-8000-000000000001", role: "pi_mcp", aud: "https://app.dropflex.test/api/mcp", client_id: "00000000-0000-4000-8000-000000000002", is_anonymous: false };
    expect((await updateSession(new NextRequest("https://app.dropflex.test/api/products/one"))).status).toBe(401);
    expect((await updateSession(new NextRequest("https://app.dropflex.test/today"))).status).toBe(307);
  });
});
