import { useId } from "react";
import { Tag } from "./creative-concept";
import { Icon } from "./icon";
import { StateChip } from "./state-chip";
import { cn } from "@/lib/utils";

export interface ScriptShotProps {
  /** Nombre de la toma: «Toma 1», «A1». */
  label: string;
  kind: "talk" | "broll";
  /** «0–5 s». */
  time?: string;
  /** Hablada: lo que dice. De apoyo: lo que se ve. */
  line: string;
  /** Textos en pantalla que salen durante la toma. */
  onscreen?: string[];
  /** Ya había clips: esta toma cambió y se genera de nuevo. */
  changed?: boolean;
  editing?: boolean;
  onLineChange?: (v: string) => void;
  onOnscreenChange?: (index: number, v: string) => void;
  lineMax?: number;
  onscreenMax?: number;
}

/**
 * Una toma del guion del UGC (.df-shot). Las habladas se generan con voz; las de apoyo, sin audio.
 * En edición solo se cambia lo que dice y el texto en pantalla.
 */
export function ScriptShot(p: ScriptShotProps) {
  const id = useId();
  const talk = p.kind === "talk";
  const field = "w-full rounded-md border border-input bg-background px-3 text-body text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5", p.changed && "border-warning")}>
      <div className="flex flex-wrap items-center gap-1.5 text-small">
        <b className="font-semibold">{p.label}</b>
        <Tag>{talk ? "Hablada" : "Apoyo"}</Tag>
        <span className="mr-auto text-caption text-muted-foreground tabular-nums">{p.time}</span>
        {p.changed ? <StateChip size="sm" tone="warning" icon="undo" label="Se genera de nuevo" /> : null}
      </div>
      <div className="flex flex-col gap-0.5">
        {p.editing && talk ? (
          <>
            <label htmlFor={`${id}-l`} className="text-caption font-semibold text-muted-foreground">
              Dice
            </label>
            <textarea id={`${id}-l`} rows={2} value={p.line} maxLength={p.lineMax} onChange={(e) => p.onLineChange?.(e.target.value)} className={cn(field, "resize-y py-2")} />
          </>
        ) : (
          <>
            <span className="text-caption font-semibold text-muted-foreground">{talk ? "Dice" : "Se ve"}</span>
            <p className="text-small">{talk ? `“${p.line}”` : p.line}</p>
          </>
        )}
      </div>
      {p.onscreen?.map((text, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {p.editing ? (
            <>
              <label htmlFor={`${id}-o${i}`} className="text-caption font-semibold text-muted-foreground">
                Texto en pantalla
              </label>
              <input id={`${id}-o${i}`} value={text} maxLength={p.onscreenMax} onChange={(e) => p.onOnscreenChange?.(i, e.target.value)} className={cn(field, "h-control")} />
            </>
          ) : (
            <>
              <span className="text-caption font-semibold text-muted-foreground">Texto en pantalla</span>
              <p className="text-small">{text}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** «La persona muestra el producto…» (.df-gc-guard): el recordatorio de honestidad del guion. */
export function ScriptGuard({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-sm bg-muted p-2 text-caption text-muted-foreground">
      <Icon name="shield" size="sm" />
      {children}
    </p>
  );
}
