import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/product-intelligence/consent", () => ({
  loadConsent: vi.fn(), directMerchantSession: mocks.session, requireConsentConfiguration: vi.fn(),
}));
vi.mock("@/lib/product-intelligence/oauth-store", () => ({ oauthRpc: mocks.rpc }));
import { getMcpConnections } from "./oauth";

const userId = "00000000-0000-4000-8000-000000000001";
const clientId = "00000000-0000-4000-8000-000000000002";
const native = { client: { id: clientId, name: "Cliente de prueba" }, scopes: ["email", "offline_access"], granted_at: "2026-10-07T10:00:00Z" };
const local = { client_id: clientId, client_name: "Cliente de prueba", scopes: ["product_intelligence:read"], expires_at: "2026-11-06T10:00:00Z", active: true, revoked_at: null };

describe("conexiones MCP · recuperación del consentimiento nativo", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    mocks.session.mockReset().mockResolvedValue({ userId, client: { auth: { oauth: { listGrants: mocks.list } } } });
    mocks.list.mockReset().mockResolvedValue({ data: [native], error: null });
    mocks.rpc.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("muestra el consentimiento sin grant como incompleto, sin inventar permisos ni vencimiento", async () => {
    expect(await getMcpConnections()).toEqual([{ client_id: clientId, client_name: native.client.name, scopes: [], expires_at: null, active: false, revoked_at: null, available: false, incomplete: true }]);
    expect(mocks.rpc.mock.calls).toEqual([["pi_list_oauth_grants", { p_user_id: userId }]]);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
  it("combina las dos autorizaciones del mismo cliente sin duplicarlo", async () => {
    mocks.rpc.mockResolvedValue([local]);
    expect(await getMcpConnections()).toEqual([{ ...local, available: true, incomplete: false }]);
  });
  it.each([
    { active: false },
    { revoked_at: "2026-10-07T11:00:00Z" },
    { expires_at: "2026-10-07T11:00:00Z" },
  ])("no reactiva permisos inactivos, revocados ni vencidos: %j", async (change) => {
    mocks.rpc.mockResolvedValue([{ ...local, ...change }]);
    expect(await getMcpConnections()).toEqual([{ ...local, ...change, available: false, incomplete: true }]);
  });
  it("sin consentimiento nativo no anuncia acceso aunque el grant local siga activo", async () => {
    mocks.rpc.mockResolvedValue([local]); mocks.list.mockResolvedValue({ data: [], error: null });
    expect(await getMcpConnections()).toEqual([{ ...local, available: false, incomplete: false }]);
  });
  it("si falla la lectura nativa no oculta la conexión ni anuncia acceso", async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: "fixture" } });
    await expect(getMcpConnections()).rejects.toThrow("Reintenta");
  });
  it("una sesión rechazada no puede listar grants de otro dueño", async () => {
    mocks.session.mockRejectedValue(new Error("Inicia sesión"));
    await expect(getMcpConnections()).rejects.toThrow("Inicia sesión");
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
