"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface ChipValue {
  id: string;
  label: string;
  /** Segunda línea en la sugerencia (tamaño del público). */
  meta?: string;
}

export interface ChipInputProps {
  label: string;
  values: ChipValue[];
  onAdd?: (value: ChipValue) => void;
  onRemove?: (id: string) => void;
  /** Sugerencias para lo escrito (catálogo de Meta, con debounce). */
  search?: (q: string) => Promise<ChipValue[]> | ChipValue[];
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Cuántos valores como máximo. */
  max?: number;
  className?: string;
}

const DEBOUNCE_MS = 250;

/** Valores múltiples (países, regiones excluidas, intereses). Escribir sugiere; Enter o coma agrega. */
export function ChipInput({ label, values, onAdd, onRemove, search, placeholder = "Agregar…", hint, error, disabled, max, className }: ChipInputProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const hintId = `${id}-ayuda`;
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ChipValue[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const full = max != null && values.length >= max;

  useEffect(() => {
    if (!search || !q.trim()) {
      setOptions([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const found = await Promise.resolve(search(q.trim())).catch(() => []);
      if (n !== seq.current) return;
      setOptions(found.filter((o) => !values.some((v) => v.id === o.id)).slice(0, 8));
      setActive(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, search, values]);

  const add = (v: ChipValue | undefined) => {
    if (!v || full || values.some((x) => x.id === v.id)) return;
    onAdd?.(v);
    setQ("");
    setOptions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === ",") {
      if (!q.trim()) return;
      e.preventDefault();
      add(options[active]);
    } else if (e.key === "Backspace" && !q && values.length) {
      onRemove?.(values[values.length - 1].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && options.length > 0 && !disabled;

  return (
    <div className={cn("relative flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-control flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.25",
          "focus-within:border-primary focus-within:ring-3 focus-within:ring-primary-soft",
          error && "border-destructive",
          disabled && "border-border bg-muted",
        )}
      >
        {values.map((v) => (
          <span key={v.id} className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-muted pl-2.5 text-label font-normal">
            <span className="truncate">{v.label}</span>
            {disabled ? (
              <span className="w-1.5" />
            ) : (
              <button
                type="button"
                aria-label={`Quitar ${v.label}`}
                onClick={() => onRemove?.(v.id)}
                className="relative grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground before:absolute before:-inset-2.5 hover:text-foreground"
              >
                <Icon name="x" size="sm" strokeWidth={2.25} />
              </button>
            )}
          </span>
        ))}
        {disabled ? null : (
          <input
            id={id}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            aria-describedby={hint || error ? hintId : undefined}
            value={q}
            disabled={full}
            placeholder={full ? "" : placeholder}
            onChange={(e) => {
              setQ(e.target.value.replace(/,/g, ""));
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            className="h-7 min-w-20 flex-1 border-0 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
      {showList ? (
        <ul id={listId} role="listbox" aria-label={label} className="absolute top-full right-0 left-0 z-nav mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-touch cursor-pointer flex-col justify-center rounded-sm px-3 py-1.5", i === active && "bg-accent")}
            >
              <span className="text-small">{o.label}</span>
              {o.meta ? <span className="text-caption text-muted-foreground">{o.meta}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error || hint ? (
        <span id={hintId} className={cn("text-caption text-muted-foreground", error && "text-destructive")}>
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
}
