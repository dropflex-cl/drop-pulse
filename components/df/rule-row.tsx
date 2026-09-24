"use client";

import { useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

/** Un valor editable en línea: un menú (multiplicador, ventana) o un número. */
export type RulePart =
  | string
  | { kind: "select"; label: string; value: string; options: { value: string; label: string }[]; onChange?: (value: string) => void }
  | { kind: "number"; label: string; value: number; onChange?: (value: number) => void; min?: number; max?: number; prefix?: string; suffix?: string; format?: (v: number) => string };

export interface RuleRowProps {
  parts: RulePart[];
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
  /** Menú ⋯ (duplicar, eliminar). Sin acciones no se muestra. */
  actions?: { label: string; onSelect: () => void; destructive?: boolean }[];
  /** La frase completa, para el nombre del interruptor y los lectores. */
  sentence: string;
  disabled?: boolean;
}

const chip = "inline-flex h-6.5 items-center gap-0.75 rounded-sm bg-background px-2 align-middle leading-6.5 tabular-nums inset-ring inset-ring-input";

function NumberPart({ part, off, disabled }: { part: Extract<RulePart, { kind: "number" }>; off: boolean; disabled?: boolean }) {
  const shown = part.format ? part.format(part.value) : part.value.toLocaleString("es-CL");
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const n = Number(draft.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || draft.trim() === "") return setDraft(shown);
    const clamped = Math.min(part.max ?? Infinity, Math.max(part.min ?? -Infinity, n));
    part.onChange?.(clamped);
    setDraft(part.format ? part.format(clamped) : clamped.toLocaleString("es-CL"));
  };
  return (
    <span className={cn(chip, "mx-px focus-within:inset-ring-2 focus-within:inset-ring-ring", off && "inset-ring-border")}>
      {part.prefix ? <small className="text-caption text-muted-foreground">{part.prefix}</small> : null}
      <input
        aria-label={part.label}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        size={Math.max(2, draft.length)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="w-auto border-0 bg-transparent p-0 font-semibold text-foreground outline-none"
      />
      {part.suffix ? <small className="text-caption text-muted-foreground">{part.suffix}</small> : null}
    </span>
  );
}

function SelectPart({ part, off, disabled }: { part: Extract<RulePart, { kind: "select" }>; off: boolean; disabled?: boolean }) {
  return (
    <span className={cn(chip, "relative mx-px pr-1.5 focus-within:inset-ring-2 focus-within:inset-ring-ring", off && "inset-ring-border")}>
      <b className="font-semibold">{part.options.find((o) => o.value === part.value)?.label ?? part.value}</b>
      <span aria-hidden className="ml-0.5 border-x-3 border-t-4 border-x-transparent border-t-muted-foreground" />
      <select
        aria-label={part.label}
        value={part.value}
        disabled={disabled}
        onChange={(e) => part.onChange?.(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {part.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Una regla del motor escrita como frase, con los valores editables en línea y su interruptor. */
export function RuleRow({ parts, enabled, onToggle, actions, sentence, disabled }: RuleRowProps) {
  const off = !enabled;
  return (
    <li className="grid grid-cols-[--spacing(10)_1fr_--spacing(11)] items-center gap-2 py-2 pr-2 pl-4 not-first:border-t">
      <label className="relative grid min-h-touch cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={disabled}
          aria-label={`Activar regla: ${sentence}`}
          onChange={(e) => onToggle?.(e.target.checked)}
          className="peer absolute size-px opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "relative h-6 w-10 rounded-full bg-muted inset-ring-(length:--stroke-strong) inset-ring-input transition-colors duration-fast ease-standard",
            "after:absolute after:top-0.75 after:left-0.75 after:size-4.5 after:rounded-full after:bg-card after:ring-1 after:ring-input after:transition-transform after:duration-fast after:ease-standard",
            "peer-checked:bg-primary peer-checked:inset-ring-0 peer-checked:after:translate-x-4 peer-checked:after:ring-0",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          )}
        />
      </label>
      <span className={cn("text-small leading-7", off && "text-muted-foreground")}>
        {parts.map((p, i) =>
          typeof p === "string" ? <span key={i}>{p}</span> : p.kind === "select" ? <SelectPart key={i} part={p} off={off} disabled={disabled} /> : <NumberPart key={i} part={p} off={off} disabled={disabled} />,
        )}
      </span>
      {actions?.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button type="button" aria-label="Opciones de la regla" title="Opciones de la regla" className="grid size-touch cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Icon name="more" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onSelect} className={cn("min-h-touch", a.destructive && "text-destructive")}>
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span />
      )}
    </li>
  );
}
