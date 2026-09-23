import { money as formatMoney, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PricePart {
  label: string;
  value: number;
}

export interface PriceBreakdownProps {
  price: number;
  /** En orden: costo del producto, envío, publicidad por venta… */
  parts: PricePart[];
  /** Los supuestos del cálculo. */
  note?: string;
  /** Moneda de la tienda (CLP por defecto). */
  currency?: string;
  className?: string;
}

// Costos en grises (chart-1…3); color solo para la ganancia (chart-4).
const COST_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3"];

/** Cuánto ganas por venta y en qué se va el resto del precio. Cálculo puro: se recalcula al cambiar las props. */
export function PriceBreakdown({ price, parts, note, currency = "CLP", className }: PriceBreakdownProps) {
  const money = (v: number) => formatMoney(v, currency);
  const cost = parts.reduce((sum, p) => sum + p.value, 0);
  const profit = price - cost;
  const total = Math.max(price, cost, 1);
  const pct = (v: number) => (price > 0 ? percent((v / price) * 100) : "—");

  const segs = parts.map((p, i) => ({ ...p, color: COST_COLORS[i % COST_COLORS.length], strong: false }));
  // Si pierdes, la cifra de arriba ya lo dice en destructive con signo menos; la barra solo muestra costos.
  if (profit > 0) segs.push({ label: "Tu ganancia", value: profit, color: "bg-chart-4", strong: true });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-caption text-muted-foreground">Ganas por cada venta entregada</div>
          <div aria-live="polite" className={cn("text-metric-lg", profit >= 0 ? "text-success" : "text-destructive")}>
            {money(profit)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-caption text-muted-foreground">Margen</div>
          <div className="text-metric">{pct(profit)}</div>
        </div>
      </div>

      <div
        role="img"
        aria-label={`De ${money(price)}: ${segs.map((s) => `${s.label} ${money(s.value)}`).join(", ")}`}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-background"
      >
        {segs.map((s) => (
          <span key={s.label} className={cn("block h-full", s.color)} style={{ flexGrow: s.value / total, flexBasis: 0 }} />
        ))}
      </div>

      <ul className="flex flex-col">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-2 py-2 text-small not-first:border-t">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-swatch", s.color)} />
            <span className={cn("flex-1", s.strong && "font-semibold")}>{s.label}</span>
            <span className={cn("text-right font-medium", s.strong && "text-success")}>{money(s.value)}</span>
            <span className="min-w-9 text-right text-caption text-muted-foreground">{pct(s.value)}</span>
          </li>
        ))}
      </ul>

      {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}
