import { Icon } from "./icon";
import { money } from "@/lib/format";
import type { AiRun } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AiRunListProps {
  /** Más reciente primero. */
  runs: AiRun[];
  /** `admin` agrega modelo y tokens en la línea de detalle. */
  audience?: "merchant" | "admin";
  currency?: string;
  className?: string;
}

const KIND = {
  gen: { word: "Generó", icon: "sparkle", dot: "bg-muted text-muted-foreground" },
  regen: { word: "Regeneró", icon: "sparkle", dot: "bg-muted text-muted-foreground" },
  retry: { word: "Reintento", icon: "undo", dot: "bg-warning-soft text-warning" },
  fail: { word: "Falló", icon: "alert", dot: "bg-destructive-soft text-destructive" },
} as const;

/**
 * Historial de llamadas a la IA de un producto: qué se hizo, en qué etapa, cuándo y cuánto costó.
 * Los fallos muestran su costo si se cobró: el historial explica el total, no lo maquilla.
 */
export function AiRunList({ runs, audience = "merchant", currency = "CLP", className }: AiRunListProps) {
  const admin = audience === "admin";
  return (
    <ol aria-label="Historial de generaciones" className={cn("m-0 list-none overflow-hidden rounded-lg border bg-card p-0", className)}>
      {runs.map((r, i) => {
        const k = KIND[r.kind];
        return (
          <li key={i} className="grid min-h-13 grid-cols-[--spacing(7)_1fr_auto] items-center gap-3 px-3 py-2 not-first:border-t">
            <span aria-hidden className={cn("grid size-7 place-items-center rounded-sm", k.dot)}>
              <Icon name={k.icon} size="sm" strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-small">
                {k.word} · {r.what}
              </span>
              <span className="truncate text-caption text-muted-foreground tabular-nums">
                {r.stage} · {r.when}
                {admin && r.model ? ` · ${r.model} · ${r.tokens}` : ""}
              </span>
            </span>
            <span className="text-small font-medium tabular-nums">{money(r.cost ?? 0, currency)}</span>
          </li>
        );
      })}
    </ol>
  );
}
