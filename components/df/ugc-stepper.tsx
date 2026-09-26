import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export const UGC_STEPS = ["Guion", "Imágenes clave", "Clips", "Montaje", "Video final"] as const;

export interface UgcStepperProps {
  /** Paso actual, 1–5. */
  current: number;
  /** El paso que se está mirando (puede ser uno ya hecho); por defecto, el actual. */
  viewing?: number;
  /** Escritorio: vertical, con el estado de cada paso. */
  vertical?: boolean;
  notes?: (string | undefined)[];
  /** Deja volver a mirar un paso hecho. */
  onSelect?: (step: number) => void;
  className?: string;
}

/** Los 5 pasos del video UGC (.df-ugc). Hecho: círculo lleno con check; actual: anillo de acento. */
export function UgcStepper({ current, viewing = current, vertical, notes, onSelect, className }: UgcStepperProps) {
  return (
    <ol aria-label="Pasos del video" className={cn("m-0 grid list-none p-0", vertical ? "grid-cols-1" : "grid-cols-5 gap-1", className)}>
      {UGC_STEPS.map((s, i) => {
        const n = i + 1;
        const st = n < current ? "done" : n === current ? "current" : "todo";
        const shown = n === viewing;
        const circle = (
          <span
            className={cn(
              "relative grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold",
              st === "done" ? "bg-primary text-primary-foreground" : st === "current" ? "bg-background text-primary inset-ring-2 inset-ring-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {st === "done" ? <Icon name="check" size="sm" strokeWidth={2.5} /> : n}
          </span>
        );
        const text = (
          <span className={cn(vertical ? "text-body" : "text-caption", shown || (vertical && st === "done") ? "text-foreground" : "text-muted-foreground", shown && "font-semibold")}>
            {vertical ? s : s.split(" ")[0]}
          </span>
        );
        const clickable = onSelect && n <= current && n !== viewing;
        const inner = (
          <>
            {circle}
            {text}
            {vertical && notes?.[i] ? <small className="col-start-2 text-label font-normal text-muted-foreground">{notes[i]}</small> : null}
          </>
        );
        const cell = vertical ? "grid grid-cols-[--spacing(6)_1fr] items-start gap-x-3 pb-5 text-left" : "flex flex-col items-center gap-1 text-center";
        return (
          <li
            key={s}
            aria-current={st === "current" ? "step" : undefined}
            className={cn(
              "relative",
              // La línea que une los pasos: primary hasta el actual.
              vertical
                ? "before:absolute before:top-7 before:bottom-1 before:left-2.75 before:w-0.5 last:before:hidden"
                : "before:absolute before:top-3 before:right-[calc(50%+--spacing(4))] before:left-[calc(-50%+--spacing(4))] before:h-0.5 first:before:hidden",
              (vertical ? st === "done" : st !== "todo") ? "before:bg-primary" : "before:bg-border",
            )}
          >
            {clickable ? (
              <button type="button" onClick={() => onSelect(n)} aria-label={`Ver el paso ${n}: ${s}`} className={cn("w-full cursor-pointer rounded-sm", cell)}>
                {inner}
              </button>
            ) : (
              <div className={cell}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
