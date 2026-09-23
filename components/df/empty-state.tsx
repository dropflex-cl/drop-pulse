import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  tone?: "neutral" | "error";
  /** Generando: anima el ícono y usa role="status". */
  busy?: boolean;
  /** Por ejemplo, esqueletos. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Estado de una etapa sin nada que revisar: bloqueada, lista para empezar, generando o con error
 * (.df-empty). Siempre dice qué pasa y cómo seguir.
 */
export function EmptyState({ icon = "text", title, body, action, secondary, tone = "neutral", busy, children, className }: EmptyStateProps) {
  const error = tone === "error";
  return (
    <section
      role={error ? "alert" : busy ? "status" : undefined}
      className={cn("flex flex-col items-center gap-2 rounded-lg border bg-card px-5 py-6 text-center", error && "border-destructive", className)}
    >
      <span className={cn("mb-1 grid size-11 place-items-center rounded-full", error ? "bg-destructive-soft text-destructive" : "bg-muted text-foreground")}>
        <Icon name={icon} className={busy ? "animate-df-pulse" : undefined} />
      </span>
      <h2 className="text-heading text-balance">{title}</h2>
      {body ? <p className="max-w-empty text-small text-pretty text-muted-foreground">{body}</p> : null}
      {children}
      {action || secondary ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </section>
  );
}
