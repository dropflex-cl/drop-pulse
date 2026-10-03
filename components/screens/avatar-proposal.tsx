"use client";

import { useState } from "react";
import { Button, Icon, StatusBadge } from "@/components/df";
import { AVATAR_SECTIONS, AWARENESS_LABEL, GENDER_LABEL, type CustomerAvatar } from "@/lib/ai/schemas";
import type { AvatarProposal } from "@/lib/types";
import { cn } from "@/lib/utils";

type Section = Record<string, string | string[]>;

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

/** Edición campo por campo. Las listas se escriben una por línea. */
function AvatarEditor({ initial, saving, onSave, onCancel }: { initial: CustomerAvatar; saving: boolean; onSave: (a: CustomerAvatar) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<CustomerAvatar>(initial);
  const set = <K extends keyof CustomerAvatar>(k: K, v: CustomerAvatar[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setIn = (section: keyof CustomerAvatar, field: string, v: string | string[]) =>
    setDraft((d) => ({ ...d, [section]: { ...(d[section] as unknown as Section), [field]: v } }));
  const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
      className="flex flex-col gap-4"
    >
      <EditField label="Nombre" rows={1} value={draft.name} onChange={(v) => set("name", v)} />
      <EditField label="Quién es" value={draft.summary} onChange={(v) => set("summary", v)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <EditField label="Edad" rows={1} value={draft.demographics.age_range} onChange={(v) => setIn("demographics", "age_range", v)} />
        <EditField label="Dónde vive" rows={1} value={draft.demographics.location} onChange={(v) => setIn("demographics", "location", v)} />
        <EditField label="Ocupación" rows={1} value={draft.demographics.occupation_or_role} onChange={(v) => setIn("demographics", "occupation_or_role", v)} />
      </div>
      <EditField label="Fórmula del cliente ideal" rows={6} value={draft.formula} onChange={(v) => set("formula", v)} />
      <EditField
        label="Momentos en que lo siente (uno por línea)"
        rows={4}
        value={draft.problems.trigger_moments.join("\n")}
        onChange={(v) => setIn("problems", "trigger_moments", lines(v))}
      />
      <EditField label="Cómo lo dice (una frase por línea)" rows={4} value={draft.voice_of_customer.join("\n")} onChange={(v) => set("voice_of_customer", lines(v))} />
      {AVATAR_SECTIONS.map((s) => (
        <fieldset key={s.key} className="flex flex-col gap-3 border-t pt-4">
          <legend className="text-label font-semibold text-muted-foreground">{s.title}</legend>
          {s.fields.map(([field, label]) => (
            <EditField key={field} label={label} value={String((draft[s.key] as unknown as Section)[field] ?? "")} onChange={(v) => setIn(s.key, field, v)} />
          ))}
        </fieldset>
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
 * textos, imágenes). Se lee de arriba abajo: quién es, la fórmula, cómo lo dice y el detalle.
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
  const facts: [string, string][] = [
    ["Edad", a.demographics.age_range],
    ["Género", GENDER_LABEL[a.demographics.gender]],
    ["Dónde vive", a.demographics.location],
    ["Ocupación", a.demographics.occupation_or_role],
    ["Nivel socioeconómico", a.demographics.socioeconomic_level],
    ["Sofisticación del mercado", `${Math.min(5, Math.max(1, a.market_sophistication))} de 5`],
  ];

  return (
    <section aria-labelledby="cliente-ideal" className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="cliente-ideal" className="flex items-center gap-1.5 text-heading">
            <Icon name="sparkle" size="sm" />
            Tu cliente ideal
          </h2>
          <p className="mt-0.5 text-label font-normal text-muted-foreground">
            {approved ? "Los textos, imágenes y anuncios se escriben para esta persona." : "Revísalo antes de seguir: todo lo demás se escribe para esta persona."}
          </p>
        </div>
        <StatusBadge status={proposal.status} size="sm" />
      </div>

      {editing ? (
        <AvatarEditor initial={a} saving={saving} onSave={onSave} onCancel={onCancelEdit} />
      ) : (
        <>
          <div>
            <p className="text-title">{a.name}</p>
            <p className="mt-1 text-body text-muted-foreground">{a.summary}</p>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0 bg-card p-3">
                <dt className="text-caption text-muted-foreground">{k}</dt>
                <dd className="text-small font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-md bg-muted p-3">
            <p className="text-caption font-medium tracking-label text-muted-foreground uppercase">Fórmula del cliente ideal</p>
            <p className="mt-1 text-body whitespace-pre-line">{a.formula}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-label font-semibold">Momentos en que lo siente</h3>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-small">
                {a.problems.trigger_moments.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-label font-semibold">Cómo lo dice</h3>
              <ul className="mt-1.5 flex flex-col gap-1.5 text-small">
                {a.voice_of_customer.map((q) => (
                  <li key={q} className="rounded-md border-l-0 bg-muted px-3 py-2 italic">
                    “{q}”
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-md border">
            <p className="flex flex-col border-b px-3 py-2">
              <span className="text-caption text-muted-foreground">Nivel de consciencia</span>
              <span className="text-small font-medium">{AWARENESS_LABEL[a.awareness_level]}</span>
            </p>
            {AVATAR_SECTIONS.map((s) => (
              <details key={s.key} className="group border-b last:border-b-0">
                <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-2 px-3 text-row [&::-webkit-details-marker]:hidden">
                  {s.title}
                  <Icon name="chevron-right" size="sm" className="text-muted-foreground transition-transform duration-fast group-open:rotate-90" />
                </summary>
                <dl className="flex flex-col gap-3 px-3 pb-3">
                  {s.fields.map(([field, label]) => (
                    <div key={field}>
                      <dt className="text-caption text-muted-foreground">{label}</dt>
                      <dd className="text-small">{String((a[s.key] as unknown as Section)[field] ?? "")}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
            <details className="group">
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-2 px-3 text-row [&::-webkit-details-marker]:hidden">
                Por qué este perfil
                <Icon name="chevron-right" size="sm" className="text-muted-foreground transition-transform duration-fast group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-2 px-3 pb-3 text-small">
                {a.demographics.gender_reason ? <p>{a.demographics.gender_reason}</p> : null}
                <p>{a.awareness_reason}</p>
                <p>{a.sophistication_reason}</p>
              </div>
            </details>
          </div>

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
