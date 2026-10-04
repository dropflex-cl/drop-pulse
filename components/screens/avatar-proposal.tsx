"use client";

import { useState } from "react";
import { Button, Icon, StatusBadge } from "@/components/df";
import type { CustomerAvatar } from "@/lib/ai/schemas";
import type { AvatarProposal } from "@/lib/types";
import { cn } from "@/lib/utils";

const fieldArea =
  "min-h-20 w-full resize-y rounded-md border border-input bg-background p-3 text-heading leading-6 font-normal text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";

function EditField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label">{label}</span>
      <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={fieldArea} />
    </label>
  );
}

type TextField = [Exclude<keyof CustomerAvatar, "summary" | "doubts">, string];
/** Los campos de texto antes y después de las dudas, en el orden en que se leen y se editan. */
const WHO_FIELDS: TextField[] = [
  ["buyer", "Quién compra"],
  ["user", "Quién lo usa"],
  ["age_range", "Edad de quien compra"],
  ["why_buy", "Por qué lo compra"],
];
const OFFER_FIELDS: TextField[] = [
  ["cash_on_delivery", "Pago contra entrega"],
  ["more_than_one", "Por qué llevaría más de uno"],
];

/** Edición campo por campo. Las dudas se escriben una por línea. */
function AvatarEditor({ initial, saving, onSave, onCancel }: { initial: CustomerAvatar; saving: boolean; onSave: (a: CustomerAvatar) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<CustomerAvatar>(initial);
  // Las dudas se editan como texto y se separan al guardar: así una línea nueva no desaparece al escribirla.
  const [doubts, setDoubts] = useState(initial.doubts.join("\n"));
  const set = <K extends keyof CustomerAvatar>(k: K, v: CustomerAvatar[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, doubts: doubts.split("\n").map((l) => l.trim()).filter(Boolean) });
      }}
      className="flex flex-col gap-4"
    >
      <EditField label="En una frase" value={draft.summary} onChange={(v) => set("summary", v)} />
      {WHO_FIELDS.map(([k, label]) => (
        <EditField key={k} label={label} rows={k === "age_range" ? 1 : 3} value={draft[k]} onChange={(v) => set(k, v)} />
      ))}
      <EditField label="Qué lo frena (una duda por línea)" rows={4} value={doubts} onChange={setDoubts} />
      {OFFER_FIELDS.map(([k, label]) => (
        <EditField key={k} label={label} value={draft[k]} onChange={(v) => set(k, v)} />
      ))}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" icon="check" loading={saving}>
          Guardar y aceptar
        </Button>
      </div>
    </form>
  );
}

/**
 * Propuesta de cliente ideal: lo primero que la IA define y lo que ordena todo lo demás (ángulos,
 * textos, imágenes). Desde la versión 6 es la respuesta de un experto (docs/spec-prompts-simples.md
 * §14): quién compra, quién lo usa, por qué y qué lo frena. Sin nombre, escenas ni frases inventadas.
 */
export function AvatarProposalCard({
  proposal,
  editing,
  saving,
  onEdit,
  onCancelEdit,
  onSave,
  onRegenerate,
  regenerating,
}: {
  proposal: AvatarProposal;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (a: CustomerAvatar) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const a = proposal.avatar;
  const approved = proposal.status === "aprobado";
  const filled = (fields: TextField[]) => fields.filter(([k]) => a[k].trim());

  return (
    <section aria-labelledby="cliente-ideal" className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="cliente-ideal" className="flex items-center gap-1.5 text-heading">
            <Icon name="sparkle" size="sm" />
            Tu cliente ideal
          </h2>
          <p className="mt-0.5 text-label font-normal text-muted-foreground">
            {approved ? "Los ángulos, textos y anuncios se escriben para esta persona." : "Revísalo antes de seguir: los ángulos, textos y anuncios se escriben para esta persona."}
          </p>
        </div>
        <StatusBadge status={proposal.status} size="sm" />
      </div>

      {editing ? (
        <AvatarEditor initial={a} saving={saving} onSave={onSave} onCancel={onCancelEdit} />
      ) : (
        <>
          <p className="text-body">{a.summary}</p>

          <dl className="flex flex-col divide-y rounded-md border">
            {filled(WHO_FIELDS).map(([k, label]) => (
              <div key={k} className="px-3 py-2">
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-small">{a[k]}</dd>
              </div>
            ))}
            {a.doubts.length ? (
              <div className="px-3 py-2">
                <dt className="text-caption text-muted-foreground">Qué lo frena</dt>
                <dd>
                  <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small">
                    {a.doubts.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            {filled(OFFER_FIELDS).map(([k, label]) => (
              <div key={k} className="px-3 py-2">
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-small">{a[k]}</dd>
              </div>
            ))}
          </dl>

          <div className={cn("flex flex-wrap gap-2", approved ? "justify-start" : "justify-end")}>
            <Button size="sm" icon="edit" onClick={onEdit}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" icon="undo" loading={regenerating} onClick={onRegenerate}>
              Volver a generar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
