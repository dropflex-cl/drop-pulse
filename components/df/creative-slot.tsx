"use client";

import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export type CreativeState = "ready" | "uploading" | "processing" | "error";

export interface CreativeSlotProps {
  name: string;
  type?: "image" | "video";
  /** URL para la miniatura (imagen, o el video mismo: se muestra su primer cuadro). */
  src?: string;
  ratio?: string | null;
  /** «0:18» */
  duration?: string | null;
  state?: CreativeState;
  /** 0 a 1, al subir. */
  progress?: number;
  error?: string | null;
  /** «Conjunto 1»: lo que va a crear en ABO. */
  adset?: string;
  /** Segunda línea cuando no hay conjunto (CBO: «Anuncio en 3 conjuntos»). */
  detail?: string;
  onRemove?: () => void;
  /** Asa para reordenar (arrastrar o flechas). */
  handle?: React.ReactNode;
  className?: string;
}

/** Un creativo subido y lo que va a generar. Subiendo, procesando, listo o error con el motivo. */
export function CreativeSlot({ name, type, src, ratio, duration, state = "ready", progress, error, adset, detail, onRemove, handle, className }: CreativeSlotProps) {
  const meta = state === "error" ? error : state === "processing" ? "Meta está procesando el video…" : state === "uploading" ? "Subiendo…" : adset ? `→ ${adset}` : detail;
  return (
    <div className={cn("grid grid-cols-[--spacing(16)_1fr_auto] items-center gap-3 rounded-md border bg-card py-1.5 pr-1 pl-1.5", state === "error" && "border-destructive", className)}>
      <div className="relative grid size-16 place-items-center overflow-hidden rounded-sm bg-muted">
        {state === "uploading" ? (
          <span className="flex flex-col items-center gap-1 text-micro font-medium" role="status">
            <span className="text-row tabular-nums">{Math.round((progress ?? 0) * 100)}%</span>
            Subiendo
          </span>
        ) : state === "error" ? (
          <span className="flex flex-col items-center gap-1 text-micro font-medium text-destructive">
            <Icon name="alert" />
            Error
          </span>
        ) : src ? (
          type === "video" ? (
            <video src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="size-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
            <img src={src} alt="" className="size-full object-cover" />
          )
        ) : (
          <Icon name="image" className="text-muted-foreground" />
        )}
        {type === "video" && state === "ready" && duration ? (
          <span className="absolute top-1 right-1 inline-flex h-4.5 items-center gap-0.5 rounded-full bg-foreground pr-1.25 pl-0.75 text-nano font-semibold text-background tabular-nums">
            <svg viewBox="0 0 24 24" aria-hidden className="size-2.5">
              <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
            </svg>
            {duration}
          </span>
        ) : null}
        {(state === "ready" || state === "processing") && (ratio || type) ? (
          <span className="absolute bottom-1 left-1 rounded-sm bg-card px-1 text-nano font-medium whitespace-nowrap text-foreground ring-1 ring-border">{ratio ?? (type === "video" ? "Video" : "Imagen")}</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-small font-medium">{name}</span>
        {meta ? <span className={cn("text-caption text-muted-foreground", state === "error" && "text-destructive")}>{meta}</span> : null}
      </div>
      <div className="flex items-center">
        {handle}
        {onRemove ? (
          <button type="button" aria-label={`Quitar ${name}`} title="Quitar creativo" onClick={onRemove} className="grid size-touch cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Icon name="x" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
