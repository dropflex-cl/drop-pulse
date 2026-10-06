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
  const { userId } = await directMerchantSession();
  const rows = z.array(connectionSchema).max(100).parse(await oauthRpc("pi_list_oauth_grants", { p_user_id: userId }));
  return rows.map((row) => ({ ...row, client_name: row.client_name?.slice(0, 160) || "Cliente MCP", available: row.active && row.revoked_at === null && Date.parse(row.expires_at) > Date.now() }));
}
export type McpConnection = Awaited<ReturnType<typeof getMcpConnections>>[number];
