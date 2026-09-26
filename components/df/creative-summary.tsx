"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface CreativeCounts {
  review?: number;
  pending?: number;
  approved?: number;
}

export interface CreativeSummaryProps {
  counts: CreativeCounts;
  /** «Proponer otros», en el menú ⋯ (acción poco frecuente y que borra lo aprobado). */
  onProposeOther?: () => void;
  proposeDisabled?: boolean;
  className?: string;
}

/**
 * Qué hay que hacer en la pestaña (.df-crsum): por revisar, sin generar y aprobadas. «Por revisar» es el
 * único número con fondo de aviso cuando es mayor que cero.
 */
export function CreativeSummary({ counts, onProposeOther, proposeDisabled, className }: CreativeSummaryProps) {
  const item = (value: number | undefined, label: string, tone?: "review" | "ok") => {
    const v = value ?? 0;
    return (
      <div className={cn("flex min-w-0 flex-1 flex-col rounded-md px-2.5 py-2", v && tone === "review" ? "bg-warning-soft" : "bg-muted")}>
        <b className={cn("text-title tracking-normal tabular-nums", v && tone === "review" ? "text-warning" : v && tone === "ok" ? "text-success" : "text-muted-foreground")}>{v}</b>
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    );
  };
  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      {item(counts.review, "Por revisar", "review")}
      {item(counts.pending, "Sin generar")}
      {item(counts.approved, "Aprobadas", "ok")}
      {onProposeOther ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Más opciones: proponer otros conceptos" title="Más opciones" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "grid place-items-center self-center")}>
              <Icon name="more" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onProposeOther} disabled={proposeDisabled} className="min-h-touch">
              <Icon name="undo" size="sm" />
              Proponer otros conceptos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
