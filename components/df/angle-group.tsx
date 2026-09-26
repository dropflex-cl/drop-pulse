import { useId } from "react";
import { Icon } from "./icon";
import { RoleChip } from "./role-chip";
import type { CreativeCounts } from "./creative-summary";
import { cn } from "@/lib/utils";

export interface AngleGroupProps {
  /** El ángulo de testeo (1, 2 o 3): «Ángulo N». No hay ángulo principal. */
  slot: number;
  name: string;
  counts?: CreativeCounts;
  /** Plegado; sin `onToggle`, no se puede plegar. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** El ChatModule del ángulo, al pie. */
  chat?: React.ReactNode;
  /** Solo la cabecera (Videos), con `action` a la derecha. */
  headerOnly?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** Sin divisor arriba (la primera sección). */
  first?: boolean;
  className?: string;
}

/**
 * Sección de un ángulo (.df-agroup): el nivel más alto de la lista de creativos. Cabecera con
 * RoleChip, el nombre en 18 px y un contador donde «por revisar» va en color de aviso.
 */
export function AngleGroup({ slot, name, counts = {}, collapsed, onToggle, chat, headerOnly, action, children, first, className }: AngleGroupProps) {
  const id = useId();
  const parts = [
    counts.review ? { key: "r", text: `${counts.review} por revisar`, cls: "font-semibold text-warning" } : null,
    counts.pending ? { key: "p", text: `${counts.pending} sin generar`, cls: "" } : null,
    counts.approved ? { key: "a", text: `${counts.approved} ${counts.approved === 1 ? "aprobada" : "aprobadas"}`, cls: "font-medium text-success" } : null,
  ].filter((x): x is { key: string; text: string; cls: string } => Boolean(x));
  const open = !collapsed;
  return (
    <section aria-labelledby={`${id}-t`} className={cn("flex flex-col gap-3", !first && !headerOnly && "border-t pt-4", className)}>
      <header className={cn("flex gap-2", headerOnly ? "items-end" : "items-start")}>
        <div className="min-w-0 flex-1">
          <RoleChip slot={slot} short />
          <h2 id={`${id}-t`} className={cn("font-semibold tracking-tight", headerOnly ? "mt-1 text-topbar" : "mt-1.5 text-title")}>
            {name}
          </h2>
          {parts.length ? (
            <p className="mt-0.5 text-label font-normal text-muted-foreground">
              {parts.map((x, i) => (
                <span key={x.key}>
                  {i ? <span aria-hidden> · </span> : null}
                  <span className={x.cls}>{x.text}</span>
                </span>
              ))}
            </p>
          ) : null}
        </div>
        {action ??
          (onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={`${open ? "Plegar" : "Desplegar"} el ángulo ${slot}`}
              className="grid size-control shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <Icon name="chevron-right" className={cn("transition-transform duration-fast ease-standard", open && "rotate-90")} />
            </button>
          ) : null)}
      </header>
      {open && !headerOnly ? (
        <div className="flex flex-col gap-2.5">
          {children}
          {chat}
        </div>
      ) : null}
    </section>
  );
}
