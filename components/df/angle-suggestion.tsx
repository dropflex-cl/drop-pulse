"use client";

import { Button } from "./button";
import { Icon } from "./icon";
import { RoleChip, type AngleRoleUi } from "./role-chip";
import { cn } from "@/lib/utils";

export interface AngleSuggestionProps {
  principal?: string;
  principalScore?: number;
  secundario?: string;
  secundarioScore?: number;
  /** Cómo se combinan, en una o dos frases. */
  combo?: string;
  /** Qué datos faltan para elegir mejor; nunca bloquea la confirmación. */
  missing?: { text: string; action?: string; onAction?: () => void }[];
  /** El título pasa a “Tu elección”. */
  changed?: boolean;
  /** Tocar un papel abre la elección de ese papel. */
  onPick?: (role: AngleRoleUi) => void;
  className?: string;
}

function Slot({ role, name, score, onPick }: { role: AngleRoleUi; name?: string; score?: number; onPick?: (r: AngleRoleUi) => void }) {
  const body = (
    <>
      <RoleChip role={role} short />
      <b className="text-row font-semibold wrap-anywhere hyphens-auto">{name ?? "Elige uno"}</b>
      <small className="text-caption text-muted-foreground tabular-nums">{score != null ? `${score}/100` : "Sin elegir"}</small>
    </>
  );
  const cls = "flex min-w-0 flex-col items-start gap-1.5 rounded-md bg-muted p-3 text-left";
  if (!onPick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={() => onPick(role)} aria-label={`Cambiar el ${role}: ${name ?? "sin elegir"}`} className={cn(cls, "relative cursor-pointer hover:bg-accent")}>
      {body}
      <Icon name="edit" size="sm" className="absolute top-3 right-3 text-muted-foreground" />
    </button>
  );
}

/** La elección del orquestador: principal + secundario, cómo se combinan y qué datos faltan. */
export function AngleSuggestion({ principal, principalScore, secundario, secundarioScore, combo, missing, changed, onPick, className }: AngleSuggestionProps) {
  return (
    <section aria-label={changed ? "Tu elección" : "Sugerencia de la IA"} className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-1.5 text-caption font-semibold tracking-label text-muted-foreground uppercase">
        <Icon name="sparkle" size="sm" />
        {changed ? "Tu elección" : "La IA sugiere"}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <Slot role="principal" name={principal} score={principalScore} onPick={onPick} />
        <span aria-hidden className="self-center font-semibold text-muted-foreground">
          +
        </span>
        <Slot role="secundario" name={secundario} score={secundarioScore} onPick={onPick} />
      </div>
      {combo ? <p className="text-small">{combo}</p> : null}
      {missing?.length ? (
        <div className="border-t pt-3">
          <div className="mb-1.5 text-label font-semibold">Para elegir mejor, falta:</div>
          <ul className="flex flex-col gap-1.5">
            {missing.map((m) => (
              <li key={m.text} className="flex min-h-8 items-center gap-2 text-label font-normal text-muted-foreground">
                <span className="flex-1">{m.text}</span>
                {m.action ? (
                  <Button size="sm" variant="secondary" onClick={m.onAction}>
                    {m.action}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
