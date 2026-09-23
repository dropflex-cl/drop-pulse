import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export interface IcpSummaryProps {
  text: string;
  tags?: string[];
  /** false lo muestra “En revisión”. */
  approved?: boolean;
  action?: string;
  href?: string;
  className?: string;
}

/** Enlace de texto del sistema (.df-rev-link), con área táctil de 44px. */
export const linkClasses =
  "relative inline-flex cursor-pointer items-center gap-1 py-1 text-caption text-primary underline underline-offset-3 before:absolute before:inset-x-0 before:-inset-y-2.5";

/**
 * Resumen del cliente ideal aprobado, la entrada del orquestador de ángulos. Aparece al entrar a
 * Ángulos para que el comerciante vea sobre qué base se decide; “Ver o cambiar” lleva a Información base.
 */
export function IcpSummary({ text, tags, approved, action, href, className }: IcpSummaryProps) {
  return (
    <section aria-label="Cliente ideal" className={cn("flex flex-col gap-2 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-row font-semibold">Cliente ideal</span>
        <StatusBadge status={approved === false ? "revision" : "aprobado"} size="sm" />
      </div>
      <p className="text-small">{text}</p>
      {tags?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center rounded-sm bg-muted px-1.5 py-px text-micro text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {action && href ? (
        <Link href={href} className={cn(linkClasses, "self-start")}>
          {action}
        </Link>
      ) : null}
    </section>
  );
}
