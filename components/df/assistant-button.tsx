import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface AssistantButtonProps {
  /** Etapa a la que se limita; se lee en el nombre accesible. */
  scope?: string;
  /** Texto visible (en escritorio, «Asistente»). */
  label?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Abre el asistente del producto limitado a una etapa (.df-asstbtn). Va en la barra superior junto a
 * AiCostChip. Sin etiqueta es un botón redondo con el destello en el color de acento.
 */
export function AssistantButton({ scope, label, onClick, className }: AssistantButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Asistente${scope ? `, sobre ${scope}` : ""}`}
      title={label ? undefined : "Asistente"}
      className={cn(
        "relative inline-flex h-control min-w-control shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-background text-primary hover:bg-accent",
        "before:absolute before:-inset-0.5",
        label ? "px-3.5 text-small font-medium text-foreground [&>svg]:text-primary" : "px-2.5",
        className,
      )}
    >
      <Icon name="sparkle" size="sm" />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
