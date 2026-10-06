"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/df";
import { FormError } from "./auth-card";
import type { McpConnection } from "@/lib/data/oauth";
import { consentPermissions } from "@/lib/product-intelligence/consent-copy";

export function McpConnections({ connections }: { connections: McpConnection[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function revoke(clientId: string) {
    setBusy(clientId); setError("");
    try {
      const response = await fetch(`/api/mcp/oauth/connections/${clientId}`, { method: "DELETE" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "No pudimos revocar la conexión. Reintenta."); }
    } catch (error) { setError(error instanceof Error ? error.message : "No pudimos revocar la conexión. Reintenta."); }
    finally { router.refresh(); setBusy(null); }
  }
  return <div className="flex flex-col gap-4">
    <FormError>{error}</FormError>
    {connections.length === 0 ? <p className="text-body text-muted-foreground">Todavía no tienes conexiones MCP.</p> : connections.map((connection) => <section key={connection.client_id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 className="text-heading">{connection.client_name}</h2>
      <p className="text-caption text-muted-foreground">{connection.available ? `Vence el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(connection.expires_at))}` : "Acceso inactivo"}</p>
      <ul className="list-inside list-disc text-small text-muted-foreground">{consentPermissions.filter(({ scope }) => connection.scopes.includes(scope)).map(({ scope, label }) => <li key={scope}>{label}</li>)}</ul>
      <Button loading={busy === connection.client_id} disabled={busy !== null} onClick={() => void revoke(connection.client_id)}>Revoca la conexión</Button>
    </section>)}
  </div>;
}
