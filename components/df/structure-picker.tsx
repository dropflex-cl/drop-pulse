"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type Structure = "abo" | "cbo";

export interface StructurePickerProps {
  value: Structure;
  onChange?: (value: Structure) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const STRUCT: Record<Structure, { title: string; desc: string }> = {
  abo: { title: "ABO · presupuesto por conjunto", desc: "Para testear. Un conjunto por creativo: apagas el que no funciona sin tocar al resto." },
  cbo: { title: "CBO · presupuesto de campaña", desc: "Para escalar ganadores. Meta reparte el presupuesto entre los conjuntos." },
};

/** ABO o CBO, las dos únicas estructuras. El mini diagrama marca en azul dónde vive el presupuesto. */
export function StructurePicker({ value, onChange, label = "Estructura", disabled, className }: StructurePickerProps) {
  const name = useId();
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)} disabled={disabled}>
      <legend className="mb-2 p-0 text-label font-semibold">{label}</legend>
      <div className="flex flex-col gap-2">
        {(["abo", "cbo"] as const).map((k) => {
          const selected = value === k;
          const budget = (on: boolean) => cn("block h-2 rounded-xs", on ? "bg-primary" : "bg-input");
          return (
            <label
              key={k}
              className={cn(
                "relative grid cursor-pointer grid-cols-[--spacing(5)_1fr_--spacing(14)] items-center gap-3 rounded-lg border bg-card px-4 py-3",
                selected && "border-primary bg-primary-soft",
                disabled && "cursor-default opacity-60",
              )}
            >
              <input type="radio" name={name} value={k} checked={selected} onChange={() => onChange?.(k)} className="peer absolute size-px opacity-0" />
              <span
                aria-hidden
                className={cn(
                  "size-5 rounded-full bg-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                  selected ? "inset-ring-6 inset-ring-primary" : "inset-ring-(length:--stroke-strong) inset-ring-input",
                )}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-row">{STRUCT[k].title}</span>
                <span className="text-label font-normal text-muted-foreground">{STRUCT[k].desc}</span>
              </span>
              <span aria-hidden className="flex flex-col items-center gap-1">
                <i className={cn(budget(k === "cbo"), "w-5")} />
                <span className="flex gap-0.75">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className={cn(budget(k === "abo"), "w-3.5")} />
                  ))}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
