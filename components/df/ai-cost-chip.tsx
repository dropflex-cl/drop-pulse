import { Icon } from "./icon";
import { capTone } from "@/lib/ai/costs";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AiCostChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** En la moneda de la tienda. */
  total: number;
  /** Tope por producto (opcional). */
  cap?: number;
  /** Una generación en curso: el ícono gira y el total se actualiza al terminar. */
  running?: boolean;
  currency?: string;
}

/**
 * Indicador compacto del costo de IA del producto, en la barra superior; abre el detalle.
 * Es información, no la acción principal: nunca usa `primary`.
 */
export function AiCostChip({ total, cap, running, currency = "CLP", className, ...props }: AiCostChipProps) {
  const pct = cap ? total / cap : 0;
  const tone = capTone(total, cap);
  return (
    <button
      type="button"
      aria-label={`Costo de IA de este producto: ${money(total, currency)}${cap ? `, ${Math.round(pct * 100)}% del tope` : ""}. Ver detalle`}
      className={cn(
        // 32px de dibujo, 44px de área táctil (before).
        "relative mx-0.5 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-card pr-2.5 pl-2 text-label whitespace-nowrap text-foreground tabular-nums before:absolute before:-inset-x-0.5 before:-inset-y-1.5 hover:bg-accent",
        tone === "warn" && "border-warning",
        tone === "over" && "border-destructive bg-destructive-soft text-destructive hover:bg-destructive-soft",
        className,
      )}
      {...props}
    >
      <Icon
        name={running ? "loader" : "sparkle"}
        size="sm"
        className={cn(tone === "over" ? "text-destructive" : "text-muted-foreground", running && "animate-df-spin")}
      />
      <span>{money(total, currency)}</span>
      {cap ? (
        <span aria-hidden className="h-1 w-6 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border">
          <span
            className={cn("block h-full", tone === "over" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-foreground")}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </span>
      ) : null}
    </button>
  );
}
