"use client";

import { useRef } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export type VideoUploadState = "idle" | "uploading" | "error" | "ready" | "approved" | "discarded";

export interface VideoUploadProps {
  state: VideoUploadState;
  /** 0–1 mientras sube. */
  progress?: number;
  file?: string;
  /** «48 MB». */
  size?: string;
  /** «31 de 48 MB · quedan ~20 s». */
  detail?: string;
  /** «0:31». */
  duration?: string;
  /** El video subido (URL firmada). */
  src?: string;
  /** En qué conjunto de Anuncios quedó: «Ángulo 1». */
  adset?: string;
  error?: string;
  busy?: "approve" | "discard" | "undo" | null;
  onPick?: (file: File) => void;
  onCancel?: () => void;
  onApprove?: () => void;
  onDiscard?: () => void;
  onUndo?: () => void;
}

/** Subir el MP4 montado y decidir (.df-drop / .df-vup / .df-vfinal). Solo MP4. */
export function VideoUpload(p: VideoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const picker = (
    <input
      ref={input}
      type="file"
      accept="video/mp4"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) p.onPick?.(f);
      }}
    />
  );

  if (p.state === "idle" || p.state === "error") {
    const error = p.state === "error";
    return (
      <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-lg border-(length:--stroke-strong) border-dashed bg-background px-4 py-6 text-center", error ? "border-destructive" : "border-input")}>
        {picker}
        <span className={cn("grid size-11 place-items-center rounded-full", error ? "bg-destructive-soft text-destructive" : "bg-muted text-foreground")}>
          <Icon name={error ? "alert" : "upload"} />
        </span>
        <b role={error ? "alert" : undefined} className="text-body font-semibold">
          {error ? (p.error ?? "Ese archivo no es MP4") : "Sube el MP4 montado"}
        </b>
        <span className="text-caption text-muted-foreground">{error ? "Exporta el video en MP4 9:16 y vuelve a subirlo." : "Solo MP4 · 9:16 · de 10 a 60 s · hasta 100 MB"}</span>
        <Button icon="upload" onClick={() => input.current?.click()} className="mt-1">
          Elegir archivo
        </Button>
      </div>
    );
  }

  if (p.state === "uploading") {
    const pct = Math.round((p.progress ?? 0) * 100);
    return (
      <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5">
        <div className="flex items-center gap-2.5">
          <Icon name="video" />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-body font-semibold">{p.file}</b>
            <span className="text-caption text-muted-foreground tabular-nums">{p.detail ?? `${pct} %`}</span>
          </div>
        </div>
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Subiendo video" className="h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard" style={{ width: `${pct}%` }} />
        </div>
        {p.onCancel ? (
          <Button variant="ghost" onClick={p.onCancel} className="self-start">
            Cancelar
          </Button>
        ) : null}
      </div>
    );
  }

  const any = Boolean(p.busy);
  return (
    <div className="flex gap-3.5 rounded-lg border bg-card p-3">
      {picker}
      <div className={cn("relative h-37.5 w-21 shrink-0 overflow-hidden rounded-md bg-muted", p.state === "discarded" && "opacity-35 grayscale")}>
        {p.src ? <video src={p.src} controls playsInline preload="metadata" aria-label="Video final" className="size-full object-cover" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        {p.file ? <b className="max-w-full truncate text-body font-semibold">{p.file}</b> : <b className="text-body font-semibold">Video final</b>}
        <span className="text-caption text-muted-foreground tabular-nums">{["9:16", p.duration, p.size].filter(Boolean).join(" · ")}</span>
        {p.state === "approved" ? <StatusBadge size="sm" status="aprobado" label={`En Anuncios${p.adset ? ` · ${p.adset}` : ""}`} className="h-auto min-h-5 whitespace-normal" /> : null}
        {p.state === "discarded" ? <StatusBadge size="sm" status="rechazado" label="Descartado" /> : null}
        <div className="mt-auto flex w-full flex-wrap gap-2">
          {p.state === "ready" ? (
            <>
              <Button icon="x" loading={p.busy === "discard"} disabled={any} onClick={p.onDiscard} className="flex-1">
                Descartar
              </Button>
              <Button variant="primary" icon="check" loading={p.busy === "approve"} disabled={any} onClick={p.onApprove} className="flex-1">
                Aprobar
              </Button>
            </>
          ) : (
            <Button icon="undo" loading={p.busy === "undo"} disabled={any} onClick={p.onUndo}>
              Deshacer
            </Button>
          )}
          {p.state !== "approved" ? (
            <Button variant="ghost" icon="upload" disabled={any} onClick={() => input.current?.click()}>
              Subir otra versión
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
