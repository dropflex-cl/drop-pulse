import { cn } from "@/lib/utils";

export interface ScoreBarProps {
  value: number;
  size?: "lg";
  hideBand?: boolean;
  className?: string;
}

/**
 * Puntaje de 0 a 100 de un ángulo, calculado en código. Número + barra + banda en palabras (Alto ≥70,
 * Medio ≥45, Bajo <45): la banda da el sentido sin depender del color. Sin verde ni rojo: un puntaje
 * bajo no es un error, es información.
 */
export function ScoreBar({ value, size, hideBand, className }: ScoreBarProps) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  const band = v >= 70 ? "Alto" : v >= 45 ? "Medio" : "Bajo";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={`Puntaje ${v} de 100, ${band.toLowerCase()}`}
      className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-3", className)}
    >
      <span className={cn("min-w-16 font-semibold tabular-nums", size === "lg" ? "text-metric-lg" : "text-title leading-6")}>
        {v}
        <small className="ml-px text-caption font-normal text-muted-foreground">/100</small>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border">
        <span className={cn("block h-full rounded-full", band === "Bajo" ? "bg-chart-2" : "bg-foreground")} style={{ width: `${v}%` }} />
      </span>
      {hideBand ? null : <span className="min-w-10 text-right text-caption text-muted-foreground">{band}</span>}
    </div>
  );
}
