"use client";

import { useId } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  title: string;
  meta?: string;
  /** `warning`: aviso que no bloquea. `danger`: motivo de una opción deshabilitada. */
  tone?: "warning" | "danger";
  disabled?: boolean;
  /** “Sugerida”. */
  tag?: string;
  /** Identificador visible (ID de Meta) para distinguir opciones con el mismo nombre. */
  id?: string;
  /** Datos para reconocerla: negocio, zona horaria, gasto, último evento. Cada uno se corta entero. */
  details?: string[];
}

export interface OptionListProps {
  label: string;
  hint?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Option[];
  className?: string;
}

/** Elegir una sola cuenta publicitaria, página o píxel. Toda la fila es el objetivo táctil (≥56px). */
export function OptionList({ label, hint, name, value, onChange, options, className }: OptionListProps) {
  const auto = useId();
  const group = name ?? auto;
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="mb-2 flex gap-2 p-0 text-label font-semibold">
        {label}
        {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </legend>
      <div className="overflow-hidden rounded-lg border bg-card">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex min-h-14 items-center gap-3 px-4 py-3 not-first:border-t",
                o.disabled ? "cursor-not-allowed" : "cursor-pointer",
                selected && "bg-primary-soft",
              )}
            >
              <input
                type="radio"
                name={group}
                value={o.value}
                checked={selected}
                disabled={o.disabled}
                onChange={() => onChange?.(o.value)}
                data-focus="within"
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "size-5 shrink-0 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                  o.disabled
                    ? "bg-muted inset-ring-(length:--stroke-strong) inset-ring-border"
                    : selected
                      ? "bg-background inset-ring-6 inset-ring-primary"
                      : "bg-background inset-ring-(length:--stroke-strong) inset-ring-input",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("text-row", o.disabled && "text-muted-foreground")}>{o.title}</span>
                {o.meta ? (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-caption",
                      o.tone === "warning" ? "text-warning" : o.tone === "danger" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {o.tone === "warning" ? <Icon name="clock" size="sm" strokeWidth={2} /> : null}
                    {o.tone === "danger" ? <Icon name="alert" size="sm" strokeWidth={2} /> : null}
                    {o.meta}
                  </span>
                ) : null}
                {o.details?.length ? <span className="text-caption text-muted-foreground">{o.details.map((d) => d.replaceAll(" ", "\u00a0")).join(" · ")}</span> : null}
                {o.id ? <span className="font-mono text-caption text-muted-foreground tabular-nums">ID {o.id}</span> : null}
              </span>
              {o.tag ? (
                <span className="shrink-0 rounded-full bg-background px-1.5 py-px text-micro font-medium text-primary inset-ring inset-ring-primary">
                  {o.tag}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
