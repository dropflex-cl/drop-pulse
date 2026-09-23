import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

export type BlockState = "accepted" | "edited" | "pending" | "current" | "discarded" | "missing" | "omitted";

export interface OutlineItem {
  id?: string;
  label: string;
  state?: BlockState;
  required?: boolean;
}

export interface PageOutlineProps {
  groups: { title: string; items: OutlineItem[] }[];
  /** Saltar a un bloque (los que no se incluyen no se pueden abrir). */
  onPick?: (id: string) => void;
  className?: string;
}

const BLOCK: Record<BlockState, { icon: IconName | null; className: string; text: string }> = {
  accepted: { icon: "check", className: "is-ok", text: "Aceptado" },
  edited: { icon: "check", className: "is-ok", text: "Tu versión" },
  pending: { icon: null, className: "", text: "Por revisar" },
  current: { icon: null, className: "is-cur", text: "Revisando" },
  discarded: { icon: "x", className: "is-off", text: "Descartado" },
  missing: { icon: "alert", className: "is-miss", text: "Falta aprobar" },
  omitted: { icon: "minus", className: "is-omit", text: "No se incluye" },
};

/** Los bloques de la página en su orden real, con su estado; permite saltar entre ellos (.df-outline). */
export function PageOutline({ groups, onPick, className }: PageOutlineProps) {
  return (
    <nav aria-label="Bloques de la página" className={cn("flex flex-col gap-3", className)}>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="px-2 pb-1 text-micro font-semibold tracking-label text-muted-foreground uppercase">{g.title}</div>
          <ul>
            {g.items.map((it, i) => {
              const state = it.state ?? "pending";
              const b = BLOCK[state];
              const c = b.className;
              return (
                <li key={it.id ?? `${g.title}-${i}`}>
                  <button
                    type="button"
                    disabled={!it.id || !onPick}
                    aria-current={state === "current" ? "true" : undefined}
                    onClick={() => it.id && onPick?.(it.id)}
                    className={cn(
                      "grid min-h-8 w-full cursor-pointer grid-cols-[--spacing(4.5)_1fr] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-label font-normal text-foreground hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent",
                      c === "is-cur" && "bg-primary-soft font-semibold text-primary hover:bg-primary-soft",
                      (c === "is-off" || c === "is-omit") && "text-muted-foreground",
                      c === "is-miss" && "text-warning",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-4.5 place-items-center rounded-full inset-ring-(length:--stroke-strong) inset-ring-input [&_svg]:size-3",
                        c === "is-ok" && "bg-foreground text-background inset-ring-0",
                        c === "is-cur" && "inset-ring-(length:--stroke-current) inset-ring-primary",
                        (c === "is-off" || c === "is-omit") && "text-muted-foreground inset-ring-border",
                        c === "is-miss" && "bg-warning-soft inset-ring-warning",
                      )}
                    >
                      {b.icon ? <Icon name={b.icon} size="sm" strokeWidth={2.5} /> : null}
                    </span>
                    <span className={cn(c === "is-off" && "line-through decoration-input")}>
                      {it.label}
                      {it.required ? <small className="text-micro font-normal text-muted-foreground"> · obligatorio</small> : null}
                      <span className="sr-only"> · {b.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
