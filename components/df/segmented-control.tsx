"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label?: string;
  count?: number;
}

export interface SegmentedControlProps {
  /** Máximo tres opciones en móvil. */
  options: (SegmentedOption | string)[];
  value: string;
  onChange?: (value: string) => void;
  /** Nombre accesible del grupo. */
  label: string;
  /** Ocupa el ancho en móvil. */
  block?: boolean;
  className?: string;
}

/** Filtra una misma lista entre vistas hermanas. No es navegación: nunca cambia de pantalla. */
export function SegmentedControl({ options, value, onChange, label, block, className }: SegmentedControlProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Siempre hay una opción activa: no se puede deseleccionar.
      onValueChange={(v) => v && onChange?.(v)}
      aria-label={label}
      className={cn("gap-0.5 rounded-md bg-secondary p-0.75", block ? "flex w-full" : "inline-flex", className)}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o } : o;
        return (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className={cn(
              "relative h-8 min-w-0 flex-1 cursor-pointer gap-1.5 rounded-segment bg-transparent px-3 text-label text-muted-foreground",
              "before:absolute before:inset-x-0 before:-inset-y-1.5",
              "hover:bg-transparent hover:text-foreground",
              "data-[spacing=0]:rounded-segment data-[spacing=0]:first:rounded-segment data-[spacing=0]:last:rounded-segment",
              "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:inset-ring data-[state=on]:inset-ring-border",
            )}
          >
            {/* Si no cabe, se corta con «…» en vez de salirse del control. */}
            <span className="min-w-0 truncate">{opt.label ?? opt.value}</span>
            {opt.count != null ? <span className="text-micro font-normal text-muted-foreground">{opt.count}</span> : null}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
