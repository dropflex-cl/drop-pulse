import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

export type DecisionKind = "esperar" | "mantener" | "pausar" | "pausado" | "escalar" | "escalado" | "ganadores";

export interface DecisionRowProps {
  decision: DecisionKind;
  /** Reemplaza la palabra del chip («Pausado por el motor · 14:05»). */
  label?: string;
  name: string;
  /** «Gasto $28.400 · 7 ventas · CPA $4.057» */
  metrics?: string;
  reason?: string;
  /** La regla que la disparó. */
  rule?: string;
  /** Solo esperar: cuánto se avanzó (0 a 1). */
  progress?: number | null;
  actions?: React.ReactNode;
  image?: string;
  className?: string;
}

const DEC: Record<DecisionKind, { title: string; icon: IconName; chip: string }> = {
  esperar: { title: "Esperando", icon: "clock", chip: "bg-muted text-foreground" },
  mantener: { title: "Mantener", icon: "check", chip: "bg-muted text-muted-foreground" },
  pausar: { title: "Pausar", icon: "pause", chip: "bg-destructive-soft text-destructive" },
  pausado: { title: "Pausado", icon: "pause", chip: "bg-muted text-muted-foreground" },
  escalar: { title: "Escalar", icon: "trend", chip: "bg-success-soft text-success" },
  escalado: { title: "Escalado", icon: "trend", chip: "bg-muted text-muted-foreground" },
  ganadores: { title: "Ganadores", icon: "trend", chip: "bg-success-soft text-success" },
};

/** Lo que el motor decidió para un conjunto o anuncio, con la cifra que lo justifica y la regla. */
export function DecisionRow({ decision, label, name, metrics, reason, rule, progress, actions, image, className }: DecisionRowProps) {
  const d = DEC[decision];
  return (
    <article className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", decision === "pausar" && "border-destructive", className)}>
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
          <img src={image} alt="" className="size-10 shrink-0 rounded-sm bg-muted object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
            <Icon name="box" size="sm" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-row font-semibold">{name}</div>
          {metrics ? <div className="text-caption text-muted-foreground tabular-nums">{metrics}</div> : null}
        </div>
        <span className={cn("inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-caption font-semibold whitespace-nowrap", d.chip)}>
          <Icon name={d.icon} size="sm" strokeWidth={2.25} />
          {label ?? d.title}
        </span>
      </div>
      {progress != null ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Avance para decidir">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-slow ease-standard" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {reason ? <div className="text-label font-normal text-muted-foreground">{reason}</div> : null}
        </div>
      ) : reason ? (
        <p className="m-0 text-small">{reason}</p>
      ) : null}
      {rule ? (
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Icon name="settings" size="sm" />
          Regla: {rule}
        </div>
      ) : null}
      {actions ? <div className="grid grid-cols-[1fr_1.5fr] gap-2 [&>*]:min-w-0">{actions}</div> : null}
    </article>
  );
}
