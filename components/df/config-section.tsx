"use client";

import { useId } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface ConfigSectionProps {
  index: number;
  title: string;
  /** Resumen de una línea cuando está cerrada. */
  summary?: string;
  open?: boolean;
  onToggle?: () => void;
  done?: boolean;
  edited?: boolean;
  /** Reemplaza el resumen por el problema y bloquea «Revisar y lanzar». */
  error?: string;
  children?: React.ReactNode;
  /** Suelta (escritorio) o agrupada dentro de ConfigSections (móvil). */
  standalone?: boolean;
  id?: string;
  className?: string;
}

/** Sección plegable del configurador con su resumen: se revisa todo sin abrir nada. */
export function ConfigSection({ index, title, summary, open, onToggle, done, edited, error, children, standalone, id, className }: ConfigSectionProps) {
  const bodyId = useId();
  return (
    <section id={id} className={cn("scroll-mt-4 bg-card", standalone && "rounded-lg border", standalone && open && "border-input", standalone && error && "border-destructive", className)}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={!!open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="grid min-h-15 w-full cursor-pointer grid-cols-[--spacing(6)_1fr_auto_--spacing(4)] items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:inset-ring-2 focus-visible:inset-ring-ring focus-visible:outline-none"
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full bg-muted text-caption font-semibold text-muted-foreground",
              error ? "bg-destructive-soft text-destructive" : done && "bg-success-soft text-success",
            )}
          >
            {error ? <Icon name="alert" size="sm" strokeWidth={2} /> : done ? <Icon name="check" size="sm" strokeWidth={2.25} /> : index}
            {error ? <span className="sr-only">Con un problema: </span> : done ? <span className="sr-only">Listo: </span> : null}
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="text-row font-semibold">{title}</b>
            {!open && (error || summary) ? <span className="sr-only">. </span> : null}
            {!open && (error || summary) ? <small className={cn("truncate text-caption text-muted-foreground", error && "text-destructive")}>{error ?? summary}</small> : null}
          </span>
          {edited ? <span className="rounded-sm bg-muted px-1.5 py-px text-micro text-muted-foreground">Editado</span> : <span />}
          <Icon name="chevron-right" size="sm" className={cn("text-muted-foreground transition-transform duration-fast ease-standard", open && "rotate-90")} />
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 px-4 pb-4">
          {error ? (
            <p role="alert" className="m-0 flex items-start gap-1.5 text-label font-normal text-destructive">
              <Icon name="alert" size="sm" strokeWidth={2} className="mt-px" />
              {error}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Las secciones agrupadas en una sola tarjeta con divisores (móvil). */
export function ConfigSections({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col divide-y overflow-hidden rounded-lg border bg-card", className)}>{children}</div>;
}
