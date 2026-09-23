import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface CharCountProps {
  count: number;
  limit?: number;
  unit?: "caracteres" | "palabras";
  /** Anuncia los cambios mientras se edita. */
  live?: boolean;
  className?: string;
}

const integer = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** Contador contra el límite del bloque. Pasado el límite: `destructive` con ícono (el mismo límite que valida el código). */
export function CharCount({ count, limit, unit = "caracteres", live, className }: CharCountProps) {
  const over = limit != null && count > limit;
  return (
    <span
      aria-live={live ? "polite" : undefined}
      className={cn("inline-flex items-center gap-1 text-caption text-muted-foreground tabular-nums", over && "font-semibold text-destructive", className)}
    >
      {over ? <Icon name="alert" size="sm" strokeWidth={2} /> : null}
      {integer.format(count)}
      {limit != null ? ` / ${limit}` : ""} {unit}
    </span>
  );
}
