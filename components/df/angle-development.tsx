"use client";

import { useState } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { AiChip, RoleChip, type AngleRoleUi } from "./role-chip";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export type AngleDevelopmentStatus = "generando" | "generado" | "revision" | "aprobado" | "error";

export interface AidaText {
  atencion: string;
  interes: string;
  deseo: string;
  accion: string;
}

export interface AngleDevelopmentValue {
  hooks: string[];
  pickedHook: number;
  aida: AidaText;
  objections: { q: string; a: string }[];
  offer: string;
}

export interface AngleDevelopmentProps extends Partial<AngleDevelopmentValue> {
  role: AngleRoleUi;
  angle: string;
  status?: AngleDevelopmentStatus;
  /** Qué pasó y qué hacer (status `error`). */
  error?: string;
  /** Las acciones viven en la barra fija (móvil). */
  hideActions?: boolean;
  editing?: boolean;
  busy?: "approve" | "regenerate" | "save" | "reopen" | null;
  onApprove?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onReopen?: () => void;
  onCancelEdit?: () => void;
  onSave?: (v: AngleDevelopmentValue) => void;
  className?: string;
}

const AIDA: [keyof AidaText, string][] = [
  ["atencion", "Atención"],
  ["interes", "Interés"],
  ["deseo", "Deseo"],
  ["accion", "Acción"],
];

/** Hasta 5 ganchos a la vista; el resto con “Ver N más”. */
const HOOKS_VISIBLE = 5;

const area =
  "min-h-11 w-full resize-y rounded-md border border-input bg-background p-3 text-heading leading-6 font-normal text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-caption font-semibold tracking-label text-muted-foreground uppercase">
      {children}
      {hint ? <small className="text-caption font-normal tracking-normal normal-case">{hint}</small> : null}
    </div>
  );
}

/** Aprobar, editar o regenerar: el mismo orden que la revisión de textos. */
export function AngleDevelopmentActions({ status, busy, onRegenerate, onEdit, onApprove, onReopen, className }: Pick<AngleDevelopmentProps, "status" | "busy" | "onRegenerate" | "onEdit" | "onApprove" | "onReopen" | "className">) {
  if (status === "generando") return null;
  if (status === "error") {
    return (
      <Button variant="primary" icon="sparkle" block loading={busy === "regenerate"} onClick={onRegenerate} className={className}>
        Regenerar
      </Button>
    );
  }
  if (status === "aprobado") {
    return (
      <div className={cn("flex", className)}>
        <Button variant="ghost" size="sm" icon="undo" loading={busy === "reopen"} onClick={onReopen}>
          Volver a revisar
        </Button>
      </div>
    );
  }
  return (
    <div className={cn("grid grid-cols-3 gap-2 [&>*]:min-w-0 [&>*]:px-2", className)}>
      <Button variant="secondary" icon="sparkle" loading={busy === "regenerate"} disabled={!!busy} onClick={onRegenerate}>
        Regenerar
      </Button>
      <Button variant="secondary" icon="edit" disabled={!!busy} onClick={onEdit}>
        Editar
      </Button>
      <Button variant="primary" icon="check" loading={busy === "approve"} disabled={!!busy} onClick={onApprove}>
        Aprobar
      </Button>
    </div>
  );
}

function Editor({ initial, saving, onSave, onCancel }: { initial: AngleDevelopmentValue; saving: boolean; onSave: (v: AngleDevelopmentValue) => void; onCancel?: () => void }) {
  const [hooks, setHooks] = useState(initial.hooks.join("\n"));
  const [aida, setAida] = useState(initial.aida);
  const [objections, setObjections] = useState(initial.objections);
  const [offer, setOffer] = useState(initial.offer);
  const lines = hooks.split("\n").map((l) => l.trim()).filter(Boolean);
  const picked = initial.hooks[initial.pickedHook];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          hooks: lines,
          pickedHook: Math.max(0, lines.indexOf(picked ?? "")),
          aida,
          objections: objections.filter((o) => o.q.trim() && o.a.trim()),
          offer,
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-label">Ganchos (uno por línea)</span>
        <textarea value={hooks} rows={6} onChange={(e) => setHooks(e.target.value)} className={area} />
      </label>
      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-label font-semibold text-muted-foreground">Argumento por etapa</legend>
        {AIDA.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1.5">
            <span className="text-label">{label}</span>
            <textarea value={aida[k]} rows={2} onChange={(e) => setAida((a) => ({ ...a, [k]: e.target.value }))} className={area} />
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-label font-semibold text-muted-foreground">Objeciones</legend>
        {objections.map((o, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <input aria-label={`Objeción ${i + 1}`} value={o.q} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} className={cn(area, "min-h-11 font-semibold")} />
            <textarea aria-label={`Respuesta ${i + 1}`} value={o.a} rows={2} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} className={area} />
          </div>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 border-t pt-4">
        <span className="text-label">Oferta</span>
        <textarea value={offer} rows={2} onChange={(e) => setOffer(e.target.value)} className={area} />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" icon="check" loading={saving} disabled={!lines.length || !offer.trim() || AIDA.some(([k]) => !aida[k].trim())}>
          Guardar y aprobar
        </Button>
      </div>
    </form>
  );
}

/**
 * El desarrollo de un ángulo (ganchos, argumento por etapa, objeciones y oferta) para revisar y
 * aprobar. Los 2 se generan en paralelo: cada uno muestra su propio estado; mientras uno genera
 * (esqueleto), el otro ya se puede revisar.
 */
export function AngleDevelopment(props: AngleDevelopmentProps) {
  const { role, angle, status = "revision", error, hooks = [], pickedHook = 0, aida, objections, offer, hideActions, editing, busy, onSave, onCancelEdit, className } = props;
  const [allHooks, setAllHooks] = useState(false);

  if (status === "generando") {
    return (
      <section role="status" aria-label={`Generando el desarrollo de ${angle}`} className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <RoleChip role={role} />
          <b className="min-w-0 flex-1 text-heading">{angle}</b>
          <StatusBadge status="publicando" label="Generando" size="sm" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className={cn("block h-3.5 animate-pulse rounded-sm bg-muted", ["w-4/5", "w-2/3", "w-1/2", "w-1/3"][i])} />
        ))}
      </section>
    );
  }

  const shown = allHooks ? hooks : hooks.slice(0, HOOKS_VISIBLE);
  return (
    <section
      aria-label={`Desarrollo del ángulo ${angle}`}
      className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4", status === "aprobado" && "border-success", status === "error" && "border-destructive", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RoleChip role={role} />
        <b className="min-w-0 flex-1 text-heading">{angle}</b>
        <StatusBadge status={status === "error" ? "error" : status} size="sm" />
      </div>

      {status === "error" ? (
        <p role="alert" className="flex gap-2 text-small text-destructive">
          <Icon name="alert" size="sm" className="mt-0.5 shrink-0" />
          {error ?? "No pudimos terminar este desarrollo. Toca Regenerar."}
        </p>
      ) : editing && aida && objections && offer != null ? (
        <Editor initial={{ hooks, pickedHook, aida, objections, offer }} saving={busy === "save"} onSave={(v) => onSave?.(v)} onCancel={onCancelEdit} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <SectionTitle hint={role === "principal" ? "abren el anuncio" : "refuerzan el argumento"}>Ganchos</SectionTitle>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body">
              {shown.map((h, i) => (
                <li key={`${i}-${h}`} className={cn(i === pickedHook && "font-semibold")}>
                  <span>{h}</span>
                  {i === pickedHook ? (
                    <AiChip icon={false} className="ml-1.5 align-middle">
                      Recomendado
                    </AiChip>
                  ) : null}
                </li>
              ))}
            </ol>
            {hooks.length > HOOKS_VISIBLE ? (
              <button type="button" onClick={() => setAllHooks((v) => !v)} className="relative self-start py-1 text-caption text-primary underline underline-offset-3 before:absolute before:inset-x-0 before:-inset-y-2.5">
                {allHooks ? "Ver menos" : `Ver ${hooks.length - HOOKS_VISIBLE} más`}
              </button>
            ) : null}
          </div>
          {aida ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <SectionTitle>Argumento por etapa</SectionTitle>
              <dl className="flex flex-col gap-2">
                {AIDA.map(([k, label]) => (
                  <div key={k} className="grid grid-cols-[--spacing(18)_1fr] gap-2 text-small">
                    <dt className="font-semibold">{label}</dt>
                    <dd>{aida[k]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {objections?.length ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <SectionTitle>Objeciones</SectionTitle>
              <ul className="flex flex-col gap-2 text-small">
                {objections.map((o) => (
                  <li key={o.q}>
                    <b className="block font-semibold">“{o.q}”</b>
                    <span className="text-muted-foreground">{o.a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {offer ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <SectionTitle>Oferta</SectionTitle>
              <p className="text-body font-medium tabular-nums">{offer}</p>
            </div>
          ) : null}
        </>
      )}

      {hideActions || editing ? null : <AngleDevelopmentActions {...props} status={status} />}
    </section>
  );
}
