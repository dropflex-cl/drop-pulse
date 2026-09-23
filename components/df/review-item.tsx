"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { Stars } from "./stars";
import { StatusBadge, type ContentStatus } from "./status-badge";
import { cn } from "@/lib/utils";

export type ReviewItemState = "pending" | "approved" | "rejected" | "published";

export interface ReviewItemProps {
  /** Anonimizado: “M***a”. */
  author: string;
  country?: string;
  date?: string;
  rating: number;
  variant?: string;
  text: string;
  /** URLs de las fotos del cliente. */
  photos?: string[];
  translated?: boolean;
  original?: string;
  /** Idioma del original, si se conoce (“inglés”). */
  lang?: string;
  /** Alertas de la IA, en ámbar. Sugerencias: nunca rechazan solas. */
  flags?: string[];
  state?: ReviewItemState;
  editing?: boolean;
  edited?: boolean;
  hideActions?: boolean;
  /** Muestra los atajos A / D / E (escritorio, la primera por revisar). */
  keys?: boolean;
  /** Guardando una edición. */
  saving?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  /** “Guardar y aprobar” es una sola acción. */
  onSave?: (text: string) => void;
  onUndo?: () => void;
  className?: string;
}

const BADGE: Record<Exclude<ReviewItemState, "pending">, { status: ContentStatus; label: string }> = {
  approved: { status: "aprobado", label: "Aprobada" },
  rejected: { status: "rechazado", label: "Rechazada" },
  published: { status: "publicado", label: "Publicada" },
};

/**
 * Una reseña importada para aprobar, rechazar o editar (reference/ReviewItem/README.md). Acciones fijas:
 * Rechazar · Editar · Aprobar. Editar solo cambia el texto, nunca la calificación, el autor ni la
 * fecha; el original queda a la vista.
 */
export function ReviewItem({
  author,
  country,
  date,
  rating,
  variant,
  text,
  photos = [],
  translated,
  original,
  lang,
  flags = [],
  state = "pending",
  editing,
  edited,
  hideActions,
  keys,
  saving,
  onApprove,
  onReject,
  onEdit,
  onCancelEdit,
  onSave,
  onUndo,
  className,
}: ReviewItemProps) {
  const badge = state === "pending" ? null : BADGE[state];
  const [draft, setDraft] = useState(text);
  const [showOriginal, setShowOriginal] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const [editingFor, setEditingFor] = useState(editing);
  // Al entrar a editar: el texto vigente y el foco en el campo.
  if (editingFor !== editing) {
    setEditingFor(editing);
    if (editing) setDraft(text);
  }
  useEffect(() => {
    if (editing) textarea.current?.focus();
  }, [editing]);

  const who = [author, country, date].filter(Boolean).join(" · ");
  return (
    <article
      aria-label={`Reseña de ${author}`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground transition-[border-color,box-shadow,opacity] duration-base ease-standard",
        state === "rejected" && "opacity-70",
        editing && "border-primary ring-3 ring-primary-soft",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Stars value={rating} />
        <span className="text-caption text-muted-foreground tabular-nums">{who}</span>
        {badge ? <StatusBadge status={badge.status} label={badge.label} size="sm" className="ml-auto" /> : null}
      </header>
      {variant ? <div className="text-caption text-muted-foreground">{variant}</div> : null}

      {editing ? (
        <div>
          <textarea
            ref={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Editar texto de la reseña"
            aria-describedby={noteId}
            rows={3}
            data-focus="within"
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-heading font-normal text-foreground outline-none focus:border-primary"
          />
          <p id={noteId} className="mt-1.5 flex items-start gap-1.5 text-caption text-muted-foreground">
            <Icon name="shield" size="sm" className="shrink-0" />
            Corrige traducción u ortografía sin cambiar lo que opinó el cliente.
          </p>
        </div>
      ) : (
        <p className={cn("text-body", state === "rejected" && "text-muted-foreground line-through decoration-input")}>{text || "Sin texto, solo fotos."}</p>
      )}

      {photos.length ? (
        <div className="flex gap-1.5">
          {photos.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={`Foto ${i + 1} del cliente`}
              width={56}
              height={56}
              unoptimized
              className="size-14 rounded-sm object-cover inset-ring inset-ring-border"
            />
          ))}
        </div>
      ) : null}

      {original || edited || flags.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {original && !editing ? (
            <button
              type="button"
              aria-expanded={showOriginal}
              onClick={() => setShowOriginal((v) => !v)}
              className="relative inline-flex cursor-pointer items-center gap-1 py-1 text-caption text-primary underline underline-offset-3 before:absolute before:-inset-y-2.5 before:inset-x-0"
            >
              <Icon name="text" size="sm" />
              {translated ? `Traducida · ${showOriginal ? "ocultar" : "ver"} original` : showOriginal ? "Ocultar original" : "Ver original"}
            </button>
          ) : null}
          {edited ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-px text-micro text-muted-foreground">
              <Icon name="edit" size="sm" />
              Editada por ti
            </span>
          ) : null}
          {flags.map((f) => (
            <span key={f} className="rounded-sm bg-warning-soft px-1.5 py-px text-micro text-warning">
              {f}
            </span>
          ))}
        </div>
      ) : null}

      {original && (editing || showOriginal) ? (
        <div className="rounded-md bg-muted p-3">
          <div className="text-micro font-semibold tracking-label text-muted-foreground uppercase">{lang ? `Original (${lang})` : "Original"}</div>
          <div className="mt-1 text-small text-muted-foreground">{original}</div>
        </div>
      ) : null}

      {hideActions ? null : editing ? (
        <div className="mt-1 grid grid-cols-[1fr_1.4fr] gap-2">
          <Button variant="ghost" size="sm" className="h-control w-full min-w-0 px-2" onClick={onCancelEdit} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" icon="check" className="h-control w-full min-w-0 px-2" loading={saving} onClick={() => onSave?.(draft)} disabled={!draft.trim()}>
            Guardar y aprobar
          </Button>
        </div>
      ) : state === "pending" ? (
        <div className="mt-1 grid grid-cols-3 gap-2">
          <Button size="sm" icon="x" kbd={keys ? "D" : null} className="h-control w-full min-w-0 px-2" onClick={onReject}>
            Rechazar
          </Button>
          <Button size="sm" icon="edit" kbd={keys ? "E" : null} className="h-control w-full min-w-0 px-2" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="primary" size="sm" icon="check" kbd={keys ? "A" : null} className="h-control w-full min-w-0 px-2" onClick={onApprove}>
            Aprobar
          </Button>
        </div>
      ) : state !== "published" && onUndo ? (
        <div className="mt-1 flex justify-end">
          <Button variant="ghost" size="sm" icon="undo" onClick={onUndo}>
            Deshacer
          </Button>
        </div>
      ) : null}
    </article>
  );
}
