import { IconButton } from "./icon-button";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  title: string;
  /** Estado resumido: “2 de 5 etapas · editado hace 2 h”. */
  subtitle?: string;
  /** Texto de la pantalla anterior; es el nombre accesible del botón volver. */
  back?: string;
  backHref?: string;
  /** Volver dentro de la misma pantalla (una subvista), en vez de navegar. */
  onBack?: () => void;
  /** Acción de contexto a la derecha (el destello del asistente en pantallas de producto). */
  actions?: React.ReactNode;
  /** Raíces de pestaña (Hoy, Productos, Campañas): título grande, sin volver. */
  large?: boolean;
  className?: string;
}

/** Barra superior: dónde estás, cómo volver y la acción de contexto. */
export function TopBar({ title, subtitle, back, backHref, onBack, actions, large, className }: TopBarProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-1 bg-background px-1",
        large ? "flex-wrap pb-2" : "h-topbar",
        className,
      )}
    >
      {back ? <IconButton icon="chevron-left" label={back} href={onBack ? undefined : backHref} onClick={onBack} /> : null}
      <div className={cn("min-w-0 flex-1 px-2", !back && "pl-3")}>
        <h1 className={cn("truncate", large ? "text-title tracking-normal" : "text-topbar")}>{title}</h1>
        {subtitle ? <p className="truncate text-caption text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}
