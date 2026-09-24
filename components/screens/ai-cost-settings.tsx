"use client";

import { useState } from "react";
import { Button, Field, notify } from "@/components/df";
import { amount, currencySymbol, money, parseAmount } from "@/lib/format";

// Ajustes › Costo de IA: el tope opcional por producto. Desde el 80% el indicador avisa; sobre el
// tope, regenerar pide confirmación. Lo ya generado nunca se bloquea.

export function AiCostSettings({ cap, currency }: { cap: number | null; currency: string }) {
  const [value, setValue] = useState(cap ? amount(cap, currency) : "");
  const [saved, setSaved] = useState(cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const parsed = value.trim() ? parseAmount(value, currency) : null;
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0);

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/settings/ai-cost-cap", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parsed }), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No pudimos guardar el tope. Intenta de nuevo.");
      setSaved(parsed);
      notify(parsed ? `Tope de IA por producto: ${money(parsed, currency)}` : "Sin tope de IA por producto");
    } catch (e) {
      setError(e instanceof TypeError ? "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo." : e instanceof Error ? e.message : "No pudimos guardar el tope.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field
        label="Tope por producto (opcional)"
        prefix={currencySymbol(currency)}
        inputMode="decimal"
        value={value}
        onValueChange={setValue}
        error={error ?? (valid ? undefined : "Escribe un monto mayor que cero, o déjalo vacío.")}
        hint={saved ? `Hoy: ${money(saved, currency)}. Avisamos desde el 80%.` : "Sin tope. Avisamos desde el 80% si defines uno."}
        className="min-w-48 flex-1"
      />
      <Button variant="primary" icon="check" loading={busy} disabled={!valid || parsed === saved} onClick={save}>
        Guardar tope
      </Button>
    </div>
  );
}
