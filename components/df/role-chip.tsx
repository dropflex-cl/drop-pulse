import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export type AngleRoleUi = "principal" | "secundario";

export interface RoleChipProps {
  role?: AngleRoleUi | "sugerido";
  /** Solo “Principal” o “Secundario”, para espacios estrechos. */
  short?: boolean;
  className?: string;
}

/**
 * El papel de un ángulo: principal (el gancho), secundario (el refuerzo) o sugerido por la IA.
 * Principal y secundario son selección del comerciante (usan el acento); “Sugerido por la IA” es
 * neutro con el destello: informa, no decide.
 */
export function RoleChip({ role, short, className }: RoleChipProps) {
  if (!role) return null;
  const base = "inline-flex h-5.5 items-center gap-1 rounded-full text-micro font-semibold whitespace-nowrap";
  if (role === "sugerido") return <AiChip className={className}>Sugerido por la IA</AiChip>;
  const principal = role === "principal";
  return (
    <span className={cn(base, "pr-2 pl-0.75", principal ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary inset-ring inset-ring-primary", className)}>
      <b aria-hidden className={cn("grid size-4 place-items-center rounded-full text-nano", principal ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground")}>
        {principal ? 1 : 2}
      </b>
      {principal ? (short ? "Principal" : "Principal · gancho") : short ? "Secundario" : "Secundario · refuerzo"}
    </span>
  );
}

/** Chip neutro de la IA (“Sugerido por la IA”, “La IA sugería…”, “Recomendado”). */
export function AiChip({ children, icon = true, className }: { children: React.ReactNode; icon?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-5.5 items-center gap-1 rounded-full bg-muted pr-2 pl-1.5 text-micro font-medium whitespace-nowrap text-muted-foreground", !icon && "pl-2", className)}>
      {icon ? <Icon name="sparkle" size="sm" className="size-3" /> : null}
      {children}
    </span>
  );
}
