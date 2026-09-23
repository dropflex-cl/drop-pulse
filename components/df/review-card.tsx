"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { CharCount } from "./char-count";
import { Icon } from "./icon";
import { RoleChip } from "./role-chip";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export type ReviewState = "pending" | "editing" | "accepted" | "discarded";

export interface ReviewCardProps {
  field: string;
  /** Texto original; puede faltar si no había. */
  original?: React.ReactNode;
  proposal?: React.ReactNode;
  /** Texto plano de la propuesta, para editarla. */
  proposalText?: string;
  index?: number;
  total?: number;
  state?: ReviewState;
  /** Muestra los atajos A / D / E (escritorio). */
  keys?: boolean;
  /** Las acciones viven en la barra fija (móvil). */
  hideActions?: boolean;
  /** Escritorio: original y propuesta lado a lado. */
  layout?: "stacked" | "side";
  onAccept?: () => void;
  onDiscard?: () => void;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  /** "Guardar y aceptar" es una sola acción. En una pregunta frecuente, el texto es «pregunta\nrespuesta». */
  onSaveEdit?: (text: string) => void;
  // ---- Bloques de la página (etapa Textos, design-system/textos.md)
  /** Grupo de la página («Arriba del precio»). */
  section?: string;
  /** Chip «Obligatorio». */
  required?: boolean;
  /** De qué ángulo sale el bloque. */
  angle?: "primary" | "secondary";
  /** Por qué lo propone la IA, en una frase. */
  note?: string;
  /** Límite del bloque: el contador avisa y «Guardar y aceptar» se deshabilita pasado el límite. */
  limit?: number;
  unit?: "caracteres" | "palabras";
  /** Pregunta y respuesta en la misma tarjeta (en lugar de `proposal`). */
  faq?: { q: string; a: string };
  /** «Hoy en Shopify». */
  originalLabel?: string;
  /** Qué pasa si se descarta: «se mantiene el título actual de Shopify.» */
  discardHint?: string;
  /** Dato que la IA no tiene: se completa al editar. */
  missing?: string;
  /** Aprobado con tu versión. */
  edited?: boolean;
  /** Filas del área de texto al editar. */
  rows?: number;
  /** Si abre ya editando (por ejemplo, desde «Escribir»), el foco va al área de texto. */
  autoFocus?: boolean;
  className?: string;
}

function measureText(text: string, unit: "caracteres" | "palabras" = "caracteres") {
  const t = text.trim();
  return unit === "palabras" ? (t ? t.split(/\s+/).length : 0) : [...t].length;
}

/** Compara el original con la propuesta de la IA. Orden fijo: Descartar · Editar · Aceptar. */
export function ReviewCard({
  field,
  original,
  proposal,
  proposalText = "",
  index,
  total,
  state = "pending",
  keys,
  hideActions,
  layout = "stacked",
  onAccept,
  onDiscard,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  section,
  required,
  angle,
  note,
  limit,
  unit = "caracteres",
  faq,
  originalLabel = "Original",
  discardHint,
  missing,
  edited,
  rows,
  autoFocus,
  className,
}: ReviewCardProps) {
  const editing = state === "editing";
  const [draft, setDraft] = useState(proposalText);
  const [question, setQuestion] = useState(faq?.q ?? "");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const wasEditing = useRef(editing && !autoFocus);
  // Al pasar a editar (no al montar), el foco va al área de texto.
  useEffect(() => {
    if (editing && !wasEditing.current) {
      // El cursor al final: casi siempre se edita para agregar (un dato que falta, un cierre).
      const ta = textarea.current;
      ta?.focus();
      ta?.setSelectionRange(ta.value.length, ta.value.length);
    }
    wasEditing.current = editing;
  }, [editing]);
  const [editingFor, setEditingFor] = useState(proposalText);
  // Al entrar a editar otra propuesta, el borrador parte de su texto.
  if (editingFor !== proposalText) {
    setEditingFor(proposalText);
    setDraft(faq ? faq.a : proposalText);
    setQuestion(faq?.q ?? "");
  }
  // En las preguntas el límite es de la respuesta.
  const count = measureText(editing ? draft : faq ? faq.a : proposalText, unit);
  const over = limit != null && count > limit;
  const empty = !draft.trim() || (faq != null && !question.trim());
  const save = () => onSaveEdit?.(faq ? `${question.trim()}\n${draft.trim()}` : draft);

  return (
    <section aria-label={`Revisar ${field}`} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-label text-muted-foreground">
          {section ? <span className="font-normal">{section} · </span> : null}
          <span className="text-foreground">{field}</span>
          {required ? <span className="ml-1.5 inline-block rounded-full px-1.5 text-micro font-medium text-muted-foreground inset-ring inset-ring-border">Obligatorio</span> : null}
        </h2>
        {total ? (
          <span className="flex-none text-caption whitespace-nowrap text-muted-foreground">
            {index} de {total}
          </span>
        ) : null}
      </div>

      <div className={cn("grid gap-3", layout === "side" && "lg:grid-cols-2 lg:gap-4")}>
        {original != null ? (
          <div className="rounded-md bg-muted p-3">
            <div className="flex items-center gap-1 text-micro font-semibold tracking-label text-muted-foreground uppercase">
              {originalLabel}
            </div>
            <div className="mt-1 text-small text-muted-foreground [&_del]:decoration-destructive">{original}</div>
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-md border-(length:--stroke-strong) border-foreground bg-card p-3 transition-[border-color,box-shadow] duration-base ease-standard",
            editing && "border-primary ring-3 ring-primary-soft",
            editing && over && "border-destructive ring-destructive-soft",
            state === "accepted" && "border-success",
            state === "discarded" && "border-dashed border-input text-muted-foreground",
          )}
        >
          <div className="flex items-center gap-1 text-micro font-semibold tracking-label text-muted-foreground uppercase">
            <Icon name="sparkle" size="sm" />
            {editing ? "Tu versión" : "Propuesta"}
            {angle ? <RoleChip role={angle === "primary" ? "principal" : "secundario"} short className="ml-1 tracking-normal normal-case" /> : null}
            {state === "accepted" ? <StatusBadge status="aprobado" size="sm" label={edited ? "Tu versión" : undefined} className="ml-auto" /> : null}
            {state === "discarded" ? <StatusBadge status="rechazado" size="sm" label="Descartada" className="ml-auto" /> : null}
          </div>
          {editing ? (
            <>
              {faq ? (
                <input
                  aria-label="Editar la pregunta"
                  data-focus="within"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="mt-1 w-full border-0 border-b bg-transparent pb-1 text-body font-semibold text-foreground outline-none"
                />
              ) : null}
              <textarea
                aria-label={faq ? "Editar la respuesta" : "Editar propuesta"}
                data-focus="within"
                ref={textarea}
                rows={rows}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-1 min-h-22 w-full resize-y border-0 bg-transparent p-0 text-body text-foreground outline-none"
              />
            </>
          ) : faq ? (
            <div className="mt-1 flex flex-col gap-1.5 text-body">
              <b className="font-semibold">{faq.q}</b>
              <span>{faq.a}</span>
            </div>
          ) : (
            <div className="mt-1 text-body whitespace-pre-line [&_ins]:rounded-swatch [&_ins]:bg-success-soft [&_ins]:px-0.5 [&_ins]:text-inherit [&_ins]:no-underline">
              {proposal}
            </div>
          )}
          {limit ? (
            <div className="mt-2 flex justify-end">
              <CharCount count={count} limit={limit} unit={unit} live={editing} />
            </div>
          ) : null}
        </div>
      </div>

      {missing ? (
        <p className="flex items-start gap-1.5 rounded-sm bg-warning-soft px-2 py-1.5 text-label font-normal text-warning">
          <Icon name="clock" size="sm" strokeWidth={2} className="mt-px" />
          <span>Falta {missing}: agrégalo al editar.</span>
        </p>
      ) : null}
      {note && !editing ? (
        <p className="flex items-start gap-1.5 text-label font-normal text-muted-foreground">
          <Icon name="sparkle" size="sm" className="mt-px" />
          {note}
        </p>
      ) : null}
      {discardHint && !editing && state === "pending" ? <p className="text-caption text-muted-foreground">Si descartas: {discardHint}</p> : null}

      {hideActions ? null : editing ? (
        <div className="grid grid-cols-5 gap-2">
          <Button variant="ghost" className="col-span-2 w-full min-w-0 px-2" onClick={onCancelEdit}>
            Cancelar
          </Button>
          <Button variant="primary" icon="check" className="col-span-3 w-full min-w-0 px-2" disabled={over || empty} onClick={save}>
            Guardar y aceptar
          </Button>
        </div>
      ) : (
        <ReviewActions keys={keys} onAccept={onAccept} onDiscard={onDiscard} onEdit={onEdit} />
      )}
    </section>
  );
}

/** Descartar · Editar · Aceptar. También se usa sola en la barra fija inferior. */
export function ReviewActions({
  keys,
  onAccept,
  onDiscard,
  onEdit,
  disabled,
  className,
}: {
  keys?: boolean;
  onAccept?: () => void;
  onDiscard?: () => void;
  onEdit?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const btn = "w-full min-w-0 gap-1.5 px-2 text-small font-medium";
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      <Button icon="x" kbd={keys ? "D" : null} className={btn} onClick={onDiscard} disabled={disabled}>
        Descartar
      </Button>
      <Button icon="edit" kbd={keys ? "E" : null} className={btn} onClick={onEdit} disabled={disabled}>
        Editar
      </Button>
      <Button variant="primary" icon="check" kbd={keys ? "A" : null} className={btn} onClick={onAccept} disabled={disabled}>
        Aceptar
      </Button>
    </div>
  );
}
