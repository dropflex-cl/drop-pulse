"use client";

import { useState } from "react";
import { Button, Field, notify, notifyUndo, StatusBadge } from "@/components/df";
import type { PackLabel } from "@/lib/pricing/labels-schemas";
import { BADGE_CHARS, LABEL_CHARS, SUPPORT_CHARS, labelsStale } from "@/lib/pricing/labels";
import { cn } from "@/lib/utils";
import type { PackPrice } from "@/lib/pricing/plan";
import { productsApi } from "@/lib/products/client";
import type { PackLabelsProposal } from "@/lib/types";

// Las etiquetas se escriben en el chat; el comerciante las revisa, edita y acepta aquí.

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Estado de la propuesta vigente, sincronizado con lo que llega del servidor (router.refresh). */
export function usePackLabels(fromServer: PackLabelsProposal | undefined) {
  const [labels, setLabels] = useState(fromServer);
  const serverKey = fromServer ? `${fromServer.id}:${fromServer.etag ?? ""}` : undefined;
  const [seen, setSeen] = useState(serverKey);
  // Un cambio de propuesta, estado o precio del servidor reemplaza la versión local.
  if (serverKey !== seen) {
    setSeen(serverKey);
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
  const [busy, setBusy] = useState<"approve" | null>(null);
  const stale = proposal.stale || labelsStale(proposal.prices, { packs });
  const approved = proposal.status === "aprobado";

  const decide = async (action: "approve" | "reopen", expectedEtag = proposal.etag) => {
    setBusy(action === "approve" ? "approve" : null);
    try {
      const { packLabels } = await productsApi.decidePackLabels(productId, action, expectedEtag);
      onChange(packLabels ?? undefined);
      if (action === "approve") notifyUndo("Etiquetas aceptadas", () => decide("reopen", packLabels?.etag));
    } catch (e) {
      notify(errorText(e, "No pudimos guardar tu decisión. Intenta de nuevo."));
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
          Cambió el precio o el respaldo de estas etiquetas. Revísalas antes de aceptarlas.
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
        <p className="text-caption text-muted-foreground">Pide otras etiquetas en el chat y guárdalas desde el MCP.</p>
      </div>
    </div>
  );
}

/** Caracteres usados frente a lo recomendado; pasarse avisa, no bloquea. */
function Counter({ value, limit }: { value: string; limit: { recommended: number } }) {
  const n = value.trim().length;
  if (!n) return null;
  const over = n > limit.recommended;
  return (
    <span className={cn("text-caption tabular-nums", over ? "text-warning" : "text-muted-foreground")} title={over ? "Más larga de lo recomendado: en el móvil puede ocupar dos líneas" : undefined}>
      {n}/{limit.recommended}
      {over ? <span className="sr-only">: más larga de lo recomendado</span> : null}
    </span>
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
  // Conservar la versión con que se abrió el editor, aunque router.refresh traiga otra propuesta.
  const [editingEtag] = useState(proposal.etag);
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
      const { packLabels } = await productsApi.editPackLabels(productId, draft, true, editingEtag);
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
          <Field
            label="Etiqueta"
            value={l.label}
            maxLength={LABEL_CHARS.max}
            labelEnd={<Counter value={l.label} limit={LABEL_CHARS} />}
            onValueChange={(v) => set(l.units, { label: v })}
            hint={l.reason}
          />
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Field
              label="Apoyo"
              value={l.support ?? ""}
              maxLength={SUPPORT_CHARS.max}
              labelEnd={<Counter value={l.support ?? ""} limit={SUPPORT_CHARS} />}
              onValueChange={(v) => set(l.units, { support: v || null })}
              hint="Opcional"
            />
            <Field label="Distintivo" value={l.badge ?? ""} maxLength={BADGE_CHARS.max} onValueChange={(v) => set(l.units, { badge: v || null })} hint="Solo en un pack" />
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
