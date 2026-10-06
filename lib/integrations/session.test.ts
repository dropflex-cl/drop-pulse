import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMerchantSessionClaims } from "@/lib/supabase/merchant-claims";
const mocks = vi.hoisted(() => ({ claims: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: mocks.claims } }) } }) }));
import { sessionUser, requireUser } from "./session";
const merchant = { sub: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", is_anonymous: false, email: "fixture@example.test" };
describe("sesión propia del comerciante", () => {
  beforeEach(() => { mocks.claims = null; });
  it("conserva login propio, audiencia string/array y admin firmado", async () => {
    mocks.claims = { ...merchant, aud: ["authenticated"], app_metadata: { role: "admin" } };
    expect(await sessionUser()).toEqual({ id: merchant.sub, email: merchant.email, admin: true });
    expect(isMerchantSessionClaims(merchant)).toBe(true);
  });
  it.each([{ role: "pi_mcp" }, { client_id: merchant.sub }, { pi_auth_session_id: merchant.sub }, { is_anonymous: true }, { aud: "https://app.dropflex.test/api/mcp" }, { aud: ["authenticated", "other"] }, { sub: "invalid" }])("no convierte un token delegado o inválido en dueño UI: %j", async (change) => {
    mocks.claims = { ...merchant, ...change };
    expect(await sessionUser()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });
});
