"use client";

import { cn } from "@/lib/utils";

export interface SwitchProps {
  label: string;
  /** Segunda línea: para qué sirve. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Interruptor con su etiqueta (reference/bundle.css → .df-switch). Toda la fila es el área táctil. */
export function Switch({ label, hint, checked, onChange, disabled, className }: SwitchProps) {
  return (
    <label className={cn("relative grid min-h-12 cursor-pointer grid-cols-[1fr_--spacing(10)] items-center gap-3 text-small", disabled && "cursor-default opacity-60", className)}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute size-px opacity-0"
      />
      <span className="col-start-1 row-start-1">
        {label}
        {hint ? <small className="block text-caption text-muted-foreground">{hint}</small> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative col-start-2 row-start-1 h-6 w-10 rounded-full bg-muted inset-ring-(length:--stroke-strong) inset-ring-input transition-colors duration-fast ease-standard",
          "after:absolute after:top-0.75 after:left-0.75 after:size-4.5 after:rounded-full after:bg-card after:ring-1 after:ring-input after:transition-transform after:duration-fast after:ease-standard",
          "peer-checked:bg-primary peer-checked:inset-ring-0 peer-checked:after:translate-x-4 peer-checked:after:ring-0",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
        )}
      />
    </label>
  );
}
