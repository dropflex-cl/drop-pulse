"use client";

import { Button } from "./button";
import { Icon } from "./icon";
import { linkClasses } from "./icp-summary";
import { AiChip, RoleChip, type AngleRoleUi } from "./role-chip";
import { ScoreBar } from "./score-bar";
import { cn } from "@/lib/utils";

export interface AngleRisk {
  text: string;
  penalty?: number;
  /** La acción que lo resuelve (“Agregar reseñas”). */
  fix?: string;
}

export interface ScoreFactor {
  label: string;
  value: number;
}

export interface AngleCardProps {
  rank: number;
  name: string;
  score: number;
  /** El papel que eligió el comerciante. */
  role?: AngleRoleUi;
  /** El que sugirió la IA. */
  suggestedRole?: AngleRoleUi;
  fit?: string;
  risks?: AngleRisk[];
  breakdown?: ScoreFactor[];
  expanded?: boolean;
  hideActions?: boolean;
  onToggle?: () => void;
  onUse?: () => void;
  onRemove?: () => void;
  onFix?: (risk: AngleRisk) => void;
  className?: string;
}

const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/**
 * Un ángulo del ranking: puesto, nombre, puntaje, por qué encaja o no, riesgos con su castigo y el
 * cálculo. Siempre se muestran los 6; los bajos (<45) se atenúan, nunca se ocultan. El desglose
 * suma exactamente el puntaje: es el mismo cálculo del código.
 */
export function AngleCard({ rank, name, score, role, suggestedRole, fit, risks, breakdown, expanded, hideActions, onToggle, onUse, onRemove, onFix, className }: AngleCardProps) {
  const low = score < 45;
  return (
    <article
      aria-label={`Ángulo ${name}, puesto ${rank}`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        role === "principal" && "border-2 border-primary p-3.75",
        role === "secundario" && "border-primary",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-sm bg-muted text-label font-semibold tabular-nums">
          {rank}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className={cn("text-heading", low && "text-muted-foreground")}>{name}</h3>
          {role || suggestedRole ? (
            <div className="flex flex-wrap gap-1.5 empty:hidden">
              <RoleChip role={role} />
              {suggestedRole && suggestedRole !== role ? <AiChip>La IA sugería {suggestedRole}</AiChip> : role && suggestedRole === role ? <RoleChip role="sugerido" /> : null}
            </div>
          ) : null}
        </div>
      </header>

      <ScoreBar value={score} />

      {fit ? (
        <p className="grid grid-cols-[--spacing(4)_1fr] gap-1.5 text-small">
          <Icon name={low ? "minus" : "check"} size="sm" strokeWidth={2.25} className="mt-0.5 text-muted-foreground" />
          {fit}
        </p>
      ) : null}

      {risks?.length ? (
        <ul aria-label="Riesgos" className="flex flex-col gap-1.5">
          {risks.map((r) => (
            <li key={r.text} className="flex flex-wrap items-center gap-1.5 rounded-sm bg-warning-soft px-2 py-1.5 text-label font-normal text-warning">
              <Icon name="alert" size="sm" strokeWidth={2} />
              <span className="min-w-3/5 flex-1">{r.text}</span>
              {r.penalty ? <b className="font-semibold tabular-nums">−{r.penalty}</b> : null}
              {r.fix && onFix ? (
                <button type="button" onClick={() => onFix(r)} className={cn(linkClasses, "py-0 text-warning")}>
                  {r.fix}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {expanded && breakdown?.length ? (
        <dl className="flex flex-col border-t pt-2">
          {breakdown.map((b) => (
            <div key={b.label} className="flex justify-between gap-2 text-label leading-5 font-normal">
              <dt className="text-muted-foreground">{b.label}</dt>
              <dd className={cn("font-medium tabular-nums", b.value < 0 && "text-destructive")}>{signed(b.value)}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-2 border-t pt-1 text-label leading-5 font-semibold">
            <dt>Puntaje final</dt>
            <dd className="tabular-nums">{score}</dd>
          </div>
        </dl>
      ) : null}

      {hideActions ? null : (
        <div className="flex items-center gap-2">
          {breakdown?.length ? (
            <button type="button" aria-expanded={expanded ? "true" : "false"} onClick={onToggle} className={linkClasses}>
              {expanded ? "Ocultar cálculo" : "Cómo se calculó"}
            </button>
          ) : null}
          <span className="flex-1" />
          {role ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Quitar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" iconEnd="chevron-right" onClick={onUse}>
              Usar este
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
