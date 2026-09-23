import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

export interface NoticeProps {
  /** `warning`: afecta el resultado (desactualizado, obligatorio pendiente). `info`: un dato por completar. */
  tone?: "warning" | "info";
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Aviso sobre una lista o un bloque. Va arriba de lo que afecta, nunca como toast: tiene que seguir visible. */
export function Notice({ tone = "warning", icon, title, body, action, className }: NoticeProps) {
  return (
    <div role="status" className={cn("flex items-start gap-2 rounded-md p-3 text-label font-normal", tone === "warning" ? "bg-warning-soft" : "bg-muted", className)}>
      <Icon name={icon ?? (tone === "warning" ? "alert" : "sparkle")} size="sm" strokeWidth={2} className={cn("mt-px", tone === "warning" ? "text-warning" : "text-foreground")} />
      <p className="min-w-0 flex-1 text-foreground">
        <b className="mr-1 font-semibold">{title}</b>
        {body}
      </p>
      {action ? <div className="flex-none self-center">{action}</div> : null}
    </div>
  );
}
