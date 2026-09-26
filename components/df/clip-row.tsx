"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "./button";
import { Icon } from "./icon";
import { StateChip } from "./state-chip";
import { StatusBadge } from "./status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ClipState = "queued" | "generating" | "done" | "failed";

export interface ClipRowProps {
  /** «Toma 1», «A1». */
  label: string;
  kind: "talk" | "broll";
  state: ClipState;
  /** El MP4 del clip (URL firmada). */
  src?: string;
  /** La imagen clave, de miniatura. */
  poster?: string;
  /** «0:05». */
  duration?: string;
  eta?: string;
  /** Costo de rehacerlo, ya formateado. */
  cost?: string;
  recoverable?: boolean;
  error?: string;
  busy?: boolean;
  onRecover?: () => void;
  onRedo?: () => void;
}

/** Un clip generado desde su imagen clave (.df-clip): las habladas con voz, las de apoyo sin audio. */
export function ClipRow(p: ClipRowProps) {
  const talk = p.kind === "talk";
  const status =
    p.state === "queued" ? (
      <StateChip size="sm" tone="progress" icon="clock" label="En cola" />
    ) : p.state === "generating" ? (
      <StateChip size="sm" tone="progress" icon="loader" spin label="Generando" />
    ) : p.state === "done" ? (
      <StateChip size="sm" tone="success" icon="check" label="Listo" />
    ) : (
      <StatusBadge size="sm" status="error" label="Falló" />
    );
  const redo = p.cost ? `Rehacer · ${p.cost}` : "Rehacer";
  return (
    <div className="grid grid-cols-[--spacing(10)_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-card px-3 py-2.5">
      <div className="relative grid h-16 w-10 place-items-center overflow-hidden rounded-sm bg-muted text-muted-foreground">
        {p.state === "done" && p.poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
          <img src={p.poster} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="video" className={cn(p.state === "generating" && "animate-df-pulse")} />
        )}
        {p.state === "done" && p.duration ? (
          <span className="absolute right-0.75 bottom-0.75 rounded-full bg-foreground px-1 text-nano font-semibold text-background tabular-nums">{p.duration}</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-small font-semibold">{`${p.label} · ${talk ? "hablada" : "apoyo"}`}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {status}
          <span className="text-caption text-muted-foreground">{`${talk ? "Seedance · con voz" : "Kling"}${p.state === "generating" ? ` · ${p.eta ?? "3 a 6 min"}` : ""}`}</span>
        </div>
        {p.state === "failed" ? (
          <p className="mt-0.5 text-caption text-destructive">
            {p.error ?? "No se pudo generar."}
            {p.recoverable ? " El proveedor sí lo recibió: recupéralo sin volver a pagar." : ""}
          </p>
        ) : null}
      </div>
      {p.state === "failed" ? (
        <div className="col-span-2 col-start-2 flex flex-wrap gap-1.5">
          {p.recoverable ? (
            <Button size="sm" icon="download" loading={p.busy} onClick={p.onRecover}>
              Recuperar
            </Button>
          ) : null}
          <Button size="sm" icon="undo" disabled={p.busy} onClick={p.onRedo}>
            {redo}
          </Button>
        </div>
      ) : p.state === "done" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={p.busy}>
            <button type="button" aria-label={`Más acciones de ${p.label}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "grid place-items-center")}>
              <Icon name="more" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {p.src ? (
              <DropdownMenuItem asChild className="min-h-touch">
                <a href={p.src} target="_blank" rel="noopener">
                  Ver el clip
                  <Icon name="external" size="sm" />
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={p.onRedo} className="min-h-touch">
              {redo}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
