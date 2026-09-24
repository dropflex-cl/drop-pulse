"use client";

import { useId } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface PresetOption {
  value: string;
  label: string;
}

export interface PresetSelectProps {
  value: string;
  /** Grupos del selector: las plantillas del sistema y las propias, ya filtradas por estructura. */
  groups: { label: string; options: PresetOption[] }[];
  onChange?: (value: string) => void;
  /** Qué carga la plantilla. */
  source?: string;
  /** Cuántos valores cambiaron sobre la plantilla. */
  modified?: number;
  onReset?: () => void;
  onSaveAs?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const linkClass = "cursor-pointer py-0.5 text-label text-primary underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-60";

/** Plantillas que precargan toda la configuración; todo sigue editable y los cambios se cuentan. */
export function PresetSelect({ value, groups, onChange, source, modified, onReset, onSaveAs, label = "Plantilla", disabled, className }: PresetSelectProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-label">
          {label}
        </label>
        <div className="relative flex h-control items-center rounded-md border border-input bg-background focus-within:border-primary focus-within:ring-3 focus-within:ring-primary-soft">
          <select
            id={id}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
            className="size-full cursor-pointer appearance-none border-0 bg-transparent pr-9 pl-3 text-body text-foreground outline-none"
          >
            {groups
              .filter((g) => g.options.length)
              .map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <Icon name="chevron-right" size="sm" className="pointer-events-none absolute right-3 rotate-90 text-muted-foreground" />
        </div>
      </div>
      {source ? <p className="m-0 text-caption text-muted-foreground">{source}</p> : null}
      {modified ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-1.5 text-caption text-muted-foreground">
          <span className="inline-flex min-w-36 flex-1 items-center gap-1">
            <Icon name="edit" size="sm" />
            {modified === 1 ? "1 cambio sobre la plantilla" : `${modified} cambios sobre la plantilla`}
          </span>
          {onReset ? (
            <button type="button" className={linkClass} onClick={onReset} disabled={disabled}>
              Restablecer
            </button>
          ) : null}
          {onSaveAs ? (
            <button type="button" className={linkClass} onClick={onSaveAs} disabled={disabled}>
              Guardar como plantilla
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
