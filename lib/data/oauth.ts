import "server-only";
import { z } from "zod";
import { loadConsent, directMerchantSession, requireConsentConfiguration } from "@/lib/product-intelligence/consent";
import { oauthRpc } from "@/lib/product-intelligence/oauth-store";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { mcpConfiguration } from "@/lib/product-intelligence/oauth";

export const getMcpConsent = loadConsent;
export function getMcpAvailability(): boolean {
  try { return mcpConfiguration() !== null; } catch { return false; }
}
const connectionSchema = z.object({ client_id: z.uuid(), client_name: z.string().nullable(), scopes: z.array(z.enum(PI_SCOPES)), expires_at: z.iso.datetime({ offset: true }), active: z.boolean(), revoked_at: z.iso.datetime({ offset: true }).nullable() }).strict();
export async function getMcpConnections() {
  requireConsentConfiguration();
  const { client, userId } = await directMerchantSession();
  const [local, native] = await Promise.all([
    oauthRpc("pi_list_oauth_grants", { p_user_id: userId }),
    client.auth.oauth.listGrants(),
  ]);
  if (native.error || !native.data) throw new Error("No pudimos consultar las conexiones. Reintenta.");
  const rows = z.array(connectionSchema).max(100).parse(local);
  const nativeClients = new Map(native.data.map((grant) => [grant.client.id, grant.client]));
  const localClients = new Set(rows.map((row) => row.client_id));
  // El consentimiento nativo puede existir sin permisos de DropFlex. Mostrarlo permite
  // revocarlo con la sesión del dueño, sin conceder permisos ni reactivar grants al leer.
  return [
    ...rows.map((row) => ({ ...row, client_name: row.client_name?.slice(0, 160) || "Cliente MCP", available: nativeClients.has(row.client_id) && row.active && row.revoked_at === null && Date.parse(row.expires_at) > Date.now(), incomplete: nativeClients.has(row.client_id) && (!row.active || row.revoked_at !== null || Date.parse(row.expires_at) <= Date.now()) })),
    ...[...nativeClients.values()].filter((client) => !localClients.has(client.id)).map((client) => ({ client_id: client.id, client_name: client.name?.slice(0, 160) || "Cliente MCP", scopes: [] as typeof rows[number]["scopes"], expires_at: null, active: false, revoked_at: null, available: false, incomplete: true })),
  ];
}
export type McpConnection = Awaited<ReturnType<typeof getMcpConnections>>[number];
