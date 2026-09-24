import { Icon } from "./icon";
import { capTone } from "@/lib/ai/costs";
import { count, money } from "@/lib/format";
import type { AiStageCost } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AiCostCardProps {
  /** En la moneda de la tienda. */
  total: number;
  totalUsd: number;
  generations: number;
  cap?: number;
  stages?: AiStageCost[];
  /** “Equivale al 4,5% de lo que ganas en una venta ($8.590).” */
  context?: string | null;
  /** Solo total y tope (bajo la ruta de etapas). */
  compact?: boolean;
  /** `admin` suma tokens por etapa y es solo para el equipo. */
  audience?: "merchant" | "admin";
  action?: React.ReactNode;
  currency?: string;
  className?: string;
}

const runsText = (s: AiStageCost) =>
  `${count(s.runs ?? 0)} ${s.runs === 1 ? "generación" : "generaciones"}${s.retries ? ` · ${s.retries} ${s.retries === 1 ? "reintento" : "reintentos"}` : ""}`;

/** Costo de IA de un producto: total, equivalente en dólares, generaciones, tope, desglose por etapa y contexto. */
export function AiCostCard({ total, totalUsd, generations, cap, stages = [], context, compact, audience = "merchant", action, currency = "CLP", className }: AiCostCardProps) {
  const pct = cap ? total / cap : 0;
  const tone = capTone(total, cap);
  const admin = audience === "admin";
  const max = Math.max(1, ...stages.map((s) => s.cost));

  return (
    <section aria-label="Costo de IA del producto" className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-caption text-muted-foreground">
            <Icon name="sparkle" size="sm" /> Costo de IA de este producto
          </div>
          <div className={cn("flex items-baseline gap-2 tabular-nums", compact ? "text-metric" : "text-cost")}>
            {money(total, currency)}
            {currency !== "USD" ? <small className="text-caption font-normal text-muted-foreground">≈ {money(totalUsd, "USD")}</small> : null}
          </div>
        </div>
        <div className="flex flex-col items-end tabular-nums">
          <b className="text-heading">{count(generations)}</b>
          <small className="text-micro text-muted-foreground">{generations === 1 ? "generación" : "generaciones"}</small>
        </div>
      </div>

      {cap ? (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Uso del tope de IA"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(pct * 100))}
            className="h-1.5 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border"
          >
            <span
              className={cn("block h-full rounded-full", tone === "over" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-foreground")}
              style={{ width: `${Math.min(100, pct * 100)}%` }}
            />
          </div>
          <p className={cn("flex flex-wrap items-center gap-1 text-caption tabular-nums", tone === "over" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-muted-foreground")}>
            {tone === "over" ? <Icon name="alert" size="sm" strokeWidth={2} /> : tone === "warn" ? <Icon name="clock" size="sm" strokeWidth={2} /> : null}
            <span>
              {Math.round(pct * 100)}% del tope de {money(cap, currency)}
            </span>
            {tone === "over" ? <span>· regenerar pide confirmación</span> : tone === "warn" ? <span>· quedan {money(cap - total, currency)}</span> : null}
          </p>
        </div>
      ) : null}

      {!compact && stages.length ? (
        <ul aria-label="Costo por etapa" className="m-0 flex list-none flex-col border-t p-0">
          {stages.map((s) => (
            <li
              key={s.label}
              className={cn(
                "grid items-center gap-3 border-b py-2",
                admin && s.tokens
                  ? "grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_--spacing(14)_--spacing(16)]"
                  : "grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_--spacing(14)]",
              )}
            >
              <span className={cn("flex min-w-0 flex-col text-small", !s.cost && "text-muted-foreground")}>
                {s.label}
                <small className="text-micro text-muted-foreground">{s.cost ? runsText(s) : s.note || "Sin uso aún"}</small>
              </span>
              <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground" style={{ width: `${(s.cost / max) * 100}%` }} />
              </span>
              <span className="text-right text-small font-medium tabular-nums">{s.cost ? money(s.cost, currency) : "—"}</span>
              {admin && s.tokens ? <span className="text-right font-mono text-micro text-muted-foreground">{s.tokens}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {context && !compact && !admin ? <p className="m-0 text-label font-normal text-muted-foreground">{context}</p> : null}
      {action ? <div className="flex justify-end">{action}</div> : null}
    </section>
  );
}
