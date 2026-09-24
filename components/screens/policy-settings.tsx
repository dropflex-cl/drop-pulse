"use client";

import { useMemo, useState } from "react";
import { Button, Field, Switch, notify } from "@/components/df";
import { amount, currencySymbol, parseAmount } from "@/lib/format";
import { cleanWhatsapp, deliveryDays, policyProblems, type PolicyField, type StorePolicies } from "@/lib/settings/policies";

// Ajustes › Envíos y políticas: los hechos que la tienda muestra en la página del producto (plazos,
// cambios, garantía, WhatsApp, envío gratis). Un campo vacío es «no lo ofrezco»: lo que lo menciona
// no aparece en la tienda. Se publican con cada producto.

type Draft = Record<Exclude<PolicyField, "freeShipping" | "businessDaysOnly" | "saturdayDelivery">, string>;

const text = (v: number | string | null) => (v == null ? "" : String(v));
const int = (v: string) => (v.trim() === "" ? null : Number(v.trim()));

function toDraft(p: StorePolicies, currency: string): Draft {
  return {
    freeShippingThreshold: p.freeShippingThreshold ? amount(p.freeShippingThreshold, currency) : "",
    returnDays: text(p.returnDays),
    warrantyMonths: text(p.warrantyMonths),
    whatsapp: text(p.whatsapp),
    handlingDays: text(p.handlingDays),
    transitDaysMin: text(p.transitDaysMin),
    transitDaysMax: text(p.transitDaysMax),
    cutoffHour: text(p.cutoffHour),
  };
}

export function PolicySettings({ initial, currency }: { initial: StorePolicies; currency: string }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, currency));
  const [flags, setFlags] = useState({ freeShipping: initial.freeShipping, businessDaysOnly: initial.businessDaysOnly, saturdayDelivery: initial.saturdayDelivery });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const value: StorePolicies = useMemo(
    () => ({
      ...flags,
      freeShippingThreshold: draft.freeShippingThreshold.trim() ? parseAmount(draft.freeShippingThreshold, currency) : null,
      returnDays: int(draft.returnDays),
      warrantyMonths: int(draft.warrantyMonths),
      whatsapp: cleanWhatsapp(draft.whatsapp),
      handlingDays: int(draft.handlingDays),
      transitDaysMin: int(draft.transitDaysMin),
      transitDaysMax: int(draft.transitDaysMax),
      cutoffHour: int(draft.cutoffHour),
    }),
    [draft, flags, currency],
  );
  const problems = policyProblems(value);
  const days = deliveryDays(value);
  const set = (field: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [field]: v }));

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/settings/policies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No pudimos guardar envíos y políticas. Intenta de nuevo.");
      notify("Envíos y políticas guardados. Se publican con cada producto.");
    } catch (e) {
      setError(e instanceof TypeError ? "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo." : e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-label">Plazos de entrega</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Preparación" suffix="días" inputMode="numeric" value={draft.handlingDays} onValueChange={set("handlingDays")} error={problems.handlingDays} />
          <Field label="Tránsito mínimo" suffix="días" inputMode="numeric" value={draft.transitDaysMin} onValueChange={set("transitDaysMin")} error={problems.transitDaysMin} />
          <Field label="Tránsito máximo" suffix="días" inputMode="numeric" value={draft.transitDaysMax} onValueChange={set("transitDaysMax")} error={problems.transitDaysMax} />
          <Field label="Hora de corte" suffix="h" inputMode="numeric" value={draft.cutoffHour} onValueChange={set("cutoffHour")} error={problems.cutoffHour} hint="Despacha hoy si piden antes." />
        </div>
        <p className="text-caption text-muted-foreground">
          {days ? `La tienda dirá: llega en ${days.min} a ${days.max} días${flags.businessDaysOnly ? " hábiles" : ""}.` : "Sin plazos, la tienda no promete fechas de entrega."}
        </p>
        <Switch label="Solo días hábiles" hint="Sin contar fines de semana." checked={flags.businessDaysOnly} onChange={(v) => setFlags((f) => ({ ...f, businessDaysOnly: v }))} />
        <Switch label="Entrega los sábados" checked={flags.saturdayDelivery} onChange={(v) => setFlags((f) => ({ ...f, saturdayDelivery: v }))} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-5">
        <legend className="mb-2 text-label">Políticas</legend>
        <Switch label="Envío gratis" hint="Si lo apagas, la tienda nunca dice «envío gratis»." checked={flags.freeShipping} onChange={(v) => setFlags((f) => ({ ...f, freeShipping: v }))} />
        {flags.freeShipping ? (
          <Field
            label="Envío gratis desde (opcional)"
            prefix={currencySymbol(currency)}
            inputMode="decimal"
            value={draft.freeShippingThreshold}
            onValueChange={set("freeShippingThreshold")}
            error={problems.freeShippingThreshold}
            hint="Vacío: gratis en todos los pedidos."
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cambios y devoluciones" suffix="días" inputMode="numeric" value={draft.returnDays} onValueChange={set("returnDays")} error={problems.returnDays} hint="Vacío: no ofreces." />
          <Field label="Garantía" suffix="meses" inputMode="numeric" value={draft.warrantyMonths} onValueChange={set("warrantyMonths")} error={problems.warrantyMonths} hint="Vacío: no ofreces." />
        </div>
        <Field label="WhatsApp de atención (opcional)" inputMode="tel" value={draft.whatsapp} onValueChange={set("whatsapp")} error={problems.whatsapp} hint="Con el código del país, ej.: 56912345678." />
      </fieldset>

      {error ? <p role="alert" className="text-label font-normal text-destructive">{error}</p> : null}
      <div>
        <Button variant="primary" icon="check" loading={busy} disabled={Object.keys(problems).length > 0} onClick={save}>
          Guardar envíos y políticas
        </Button>
      </div>
    </div>
  );
}
