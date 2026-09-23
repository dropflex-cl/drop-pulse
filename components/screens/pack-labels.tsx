"use client";

import { useState } from "react";
import { Button, Field, notify, notifyUndo, StatusBadge } from "@/components/df";
import type { PackLabel } from "@/lib/ai/schemas";
import { MAX_BADGE_CHARS, MAX_LABEL_CHARS, MAX_SUPPORT_CHARS, labelsStale } from "@/lib/pricing/labels";
import type { PackPrice } from "@/lib/pricing/plan";
import { productsApi } from "@/lib/products/client";
import type { PackLabelsProposal } from "@/lib/types";

// Etiquetas de los packs (“2 meses de uso”): la IA las propone con el cliente ideal y el comerciante
// las decide aquí, aparte. Aceptar, editar u “Otras etiquetas” (una llamada chica a la IA).

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Estado de la propuesta vigente, sincronizado con lo que llega del servidor (router.refresh). */
export function usePackLabels(fromServer: PackLabelsProposal | undefined) {
  const [labels, setLabels] = useState(fromServer);
  const [seen, setSeen] = useState(fromServer?.id);
  // Una propuesta nueva del servidor (terminó una optimización) reemplaza a la local.
  if (fromServer?.id !== seen) {
    setSeen(fromServer?.id);
    setLabels(fromServer);
  }
  return [labels, setLabels] as const;
}

/** Encabezado del bloque: estado y acciones. */
export function PackLabelsBar({
  productId,
  proposal,
  packs,
  onChange,
  onEdit,
}: {
  productId: string;
  proposal: PackLabelsProposal;
  packs: PackPrice[];
  onChange: (p: PackLabelsProposal | undefined) => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState<"approve" | "regenerate" | null>(null);
  const stale = labelsStale(proposal.prices, { packs });
  const approved = proposal.status === "aprobado";

  const decide = async (action: "approve" | "reopen") => {
    setBusy(action === "approve" ? "approve" : null);
    try {
      const { packLabels } = await productsApi.decidePackLabels(productId, action);
      onChange(packLabels ?? undefined);
      if (action === "approve") notifyUndo("Etiquetas aceptadas", () => decide("reopen"));
    } catch (e) {
      notify(errorText(e, "No pudimos guardar tu decisión. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy("regenerate");
    try {
      const { packLabels } = await productsApi.regeneratePackLabels(productId);
      onChange(packLabels ?? undefined);
      notify("Etiquetas nuevas listas para revisar");
    } catch (e) {
      notify(errorText(e, "No pudimos generar otras etiquetas. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label">Etiquetas de los packs</span>
        <StatusBadge status={proposal.status} size="sm" />
      </div>
      {stale ? (
        <p role="status" className="text-caption text-warning">
          Cambiaste los precios después de estas etiquetas. Revísalas: una como “3 al precio de 2” puede haber dejado de ser cierta.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!approved || stale ? (
          <Button size="sm" icon="check" loading={busy === "approve"} disabled={busy !== null} onClick={() => decide("approve")}>
            Aceptar etiquetas
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon="edit" disabled={busy !== null} onClick={onEdit}>
          Editar
        </Button>
        <Button size="sm" variant="ghost" icon="sparkle" loading={busy === "regenerate"} disabled={busy !== null} onClick={regenerate}>
          Otras etiquetas
        </Button>
      </div>
    </div>
  );
}

/** Edición: una etiqueta, un apoyo y un distintivo por pack. */
export function PackLabelsEditor({
  productId,
  proposal,
  packs,
  onSaved,
  onCancel,
}: {
  productId: string;
  proposal: PackLabelsProposal;
  packs: PackPrice[];
  onSaved: (p: PackLabelsProposal | undefined) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PackLabel[]>(() =>
    packs.map(
      (p) =>
        proposal.labels.find((l) => l.units === p.units) ?? {
          units: p.units,
          label: p.units === 1 ? "1 unidad" : `Pack ${p.units} unidades`,
          support: null,
          badge: null,
          basis: "other",
          reason: "Escrita por el comerciante.",
        },
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const set = (units: number, patch: Partial<PackLabel>) => setDraft((d) => d.map((l) => (l.units === units ? { ...l, ...patch } : l)));

  const save = async () => {
    if (draft.some((l) => !l.label.trim())) return setError("Cada pack necesita su etiqueta.");
    setSaving(true);
    setError(undefined);
    try {
      const { packLabels } = await productsApi.editPackLabels(productId, draft, true);
      onSaved(packLabels ?? undefined);
      notify("Etiquetas guardadas y aceptadas");
    } catch (e) {
      setError(errorText(e, "No pudimos guardar las etiquetas. Intenta de nuevo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-3 flex flex-col gap-4"
    >
      {draft.map((l) => (
        <fieldset key={l.units} className="flex flex-col gap-3 rounded-md border p-3">
          <legend className="px-1 text-label text-muted-foreground">{l.units === 1 ? "1 unidad" : `Pack ${l.units} unidades`}</legend>
          <Field label="Etiqueta" value={l.label} maxLength={MAX_LABEL_CHARS} onValueChange={(v) => set(l.units, { label: v })} hint={l.reason} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Apoyo" value={l.support ?? ""} maxLength={MAX_SUPPORT_CHARS} onValueChange={(v) => set(l.units, { support: v || null })} hint="Opcional" />
            <Field label="Distintivo" value={l.badge ?? ""} maxLength={MAX_BADGE_CHARS} onValueChange={(v) => set(l.units, { badge: v || null })} hint="Solo en un pack" />
          </div>
        </fieldset>
      ))}
      {error ? (
        <p role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" icon="check" loading={saving}>
          Guardar y aceptar
        </Button>
      </div>
    </form>
  );
}
