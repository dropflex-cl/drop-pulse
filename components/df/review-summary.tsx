import { ratingLabel } from "@/lib/reviews/copy";
import { Stars } from "./stars";

export interface ReviewSummaryProps {
  average: number;
  total: number;
  /** Cuántas hay de cada calificación: [1★, 2★, 3★, 4★, 5★]. */
  distribution: [number, number, number, number, number];
}

/** Promedio y distribución por estrellas. Barras en `foreground`: la calificación es un dato, no un estado. */
export function ReviewSummary({ average, total, distribution }: ReviewSummaryProps) {
  const max = Math.max(...distribution) || 1;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-4">
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-metric-lg tabular-nums">{ratingLabel(average)}</span>
        <Stars value={average} />
        <span className="text-caption text-muted-foreground">{total === 1 ? "1 importada" : `${total} importadas`}</span>
      </div>
      <ul aria-label="Distribución por estrellas" className="flex flex-col gap-1">
        {[5, 4, 3, 2, 1].map((s) => {
          const n = distribution[s - 1] ?? 0;
          return (
            <li key={s} className="grid grid-cols-[--spacing(6)_1fr_--spacing(6)] items-center gap-2 text-caption text-muted-foreground tabular-nums">
              <span>{s}★</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-foreground" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right">
                <span className="sr-only">{s} estrellas: </span>
                {n}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
