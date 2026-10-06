"use client";

import { useState } from "react";
import { Button, Switch } from "@/components/df";
import { FormError } from "./auth-card";
import { consentPermissions } from "@/lib/product-intelligence/consent-copy";
import type { PiScope } from "@/lib/product-intelligence/policy";

export function McpConsentForm({ ticket }: { ticket: string }) {
  const [scopes, setScopes] = useState<PiScope[]>(["product_intelligence:read"]);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");
  async function decide(decision: "approve" | "deny") {
    setBusy(decision); setError("");
    try {
      const response = await fetch("/api/mcp/oauth/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, decision, scopes }) });
      const result = await response.json();
      if (!response.ok || typeof result.redirect_url !== "string") throw new Error(typeof result.error === "string" ? result.error : "No pudimos autorizar la conexión. Reintenta.");
      window.location.assign(result.redirect_url);
    } catch (error) { setError(error instanceof Error ? error.message : "No pudimos autorizar la conexión. Reintenta."); setBusy(null); }
  }
  return <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void decide("approve"); }}>
    <div className="flex flex-col gap-2">
      {consentPermissions.map(({ scope, label, hint }) => <Switch key={scope} label={label} hint={hint} checked={scopes.includes(scope)} disabled={busy !== null || scope === "product_intelligence:read"} onChange={(checked) => setScopes((current) => checked ? [...current, scope] : current.filter((value) => value !== scope))} />)}
    </div>
    <p className="text-caption text-muted-foreground">Puedes revocar esta conexión en cualquier momento. Publicar en Shopify o Meta requiere una decisión aparte.</p>
    <p className="text-caption text-muted-foreground">El cliente recibirá tu correo y podrá renovar su acceso hasta que venza o lo revoques.</p>
    <FormError>{error}</FormError>
    <Button type="submit" variant="primary" loading={busy === "approve"} disabled={busy !== null} block>Autoriza la conexión</Button>
    <Button onClick={() => void decide("deny")} loading={busy === "deny"} disabled={busy !== null} block>Rechaza la conexión</Button>
  </form>;
}
