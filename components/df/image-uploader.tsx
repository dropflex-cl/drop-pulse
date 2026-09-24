"use client";

import { useState } from "react";
import { Button } from "./button";
import { Field } from "./field";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { SegmentedControl } from "./segmented-control";
import { cn } from "@/lib/utils";

export interface UploadItem {
  id: string;
  name: string;
  state: "uploading" | "done" | "error";
  /** De 0 a 1. */
  progress?: number;
  /** “1,2 MB · lista” o el motivo del error. */
  detail?: string;
}

export type UploaderMode = "file" | "url";

export interface ImageUploaderProps {
  mode?: UploaderMode;
  onModeChange?: (mode: UploaderMode) => void;
  /** `fetching`: trayendo desde el enlace. */
  state?: "idle" | "error" | "fetching";
  items?: UploadItem[];
  onFiles?: (files: File[]) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  url?: string;
  onUrlChange?: (url: string) => void;
  urlError?: string;
  onFetchUrl?: () => void;
  /** Texto corto en móvil. */
  compact?: boolean;
  hideModes?: boolean;
  /** Tipos que acepta el selector de archivos; por defecto JPG, PNG y WEBP. */
  accept?: string[];
  /** Por defecto se pueden elegir varios. */
  multiple?: boolean;
  /** «elige desde tu equipo» (enlace subrayado). */
  pickLabel?: string;
  /** «Arrastra imágenes aquí o» (escritorio). */
  dragLabel?: string;
  /** Texto corto en móvil: «Elige imágenes». */
  compactLabel?: string;
  /** La línea de formatos y topes bajo la zona de arrastre. */
  formats?: string;
  /** Qué se agrega, para el nombre accesible y el selector de modo («imágenes», «GIF»). */
  noun?: string;
  urlLabel?: string;
  urlHint?: string;
  className?: string;
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Agrega imágenes desde el equipo o desde un enlace: las referencias de Información base y los GIF
 * de Imágenes. Cada archivo tiene su fila con avance; un error no detiene a los demás; subir se
 * puede cancelar. Los textos y los tipos aceptados se ajustan por props; por defecto, los de las
 * referencias.
 */
export function ImageUploader({
  mode = "file",
  onModeChange,
  state = "idle",
  items,
  onFiles,
  onCancel,
  onRetry,
  url = "",
  onUrlChange,
  urlError,
  onFetchUrl,
  compact,
  hideModes,
  accept = ACCEPTED_TYPES,
  multiple = true,
  pickLabel = "elige desde tu equipo",
  dragLabel = "Arrastra imágenes aquí o ",
  compactLabel = "Elige imágenes",
  formats = "JPG, PNG o WEBP · hasta 10 MB cada una · máximo 10",
  noun = "imágenes",
  urlLabel = "Enlace de la imagen",
  urlHint = "Pega el enlace directo a la imagen (por ejemplo, desde la página del proveedor).",
  className,
}: ImageUploaderProps) {
  const [over, setOver] = useState(false);

  return (
    <section aria-label={`Agregar ${noun}`} className={cn("flex flex-col gap-3", className)}>
      {hideModes ? null : (
        <SegmentedControl
          block
          value={mode}
          onChange={(v) => onModeChange?.(v as UploaderMode)}
          label={`Cómo agregar ${noun}`}
          options={[
            { value: "file", label: "Desde tu equipo" },
            { value: "url", label: "Desde un enlace" },
          ]}
        />
      )}
      {mode === "file" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const files = [...e.dataTransfer.files];
            if (files.length) onFiles?.(files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-(length:--stroke-strong) border-dashed border-input bg-background px-4 py-6 text-center transition-colors duration-fast ease-standard hover:bg-accent",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
            over && "border-solid border-primary bg-primary-soft hover:bg-primary-soft",
            state === "error" && "border-destructive",
          )}
        >
          <input
            type="file"
            accept={accept.join(",")}
            multiple={multiple}
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) onFiles?.(files);
            }}
          />
          <span className={cn("grid size-11 place-items-center rounded-full bg-muted text-foreground", over && "bg-primary text-primary-foreground")}>
            <Icon name={over ? "arrow-down" : "upload"} />
          </span>
          <span className="text-row">
            {over ? (
              "Suelta para subir"
            ) : compact ? (
              compactLabel
            ) : (
              <>
                <span className="[@media(hover:none)]:hidden">{dragLabel}</span>
                <u className="text-primary underline-offset-3">{pickLabel}</u>
              </>
            )}
          </span>
          <span className="text-caption text-muted-foreground">{formats}</span>
        </label>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onFetchUrl?.();
          }}
          className="flex items-start gap-2"
        >
          <Field
            label={urlLabel}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            value={url}
            onValueChange={onUrlChange}
            error={urlError}
            hint={urlHint}
            className="flex-1"
          />
          <Button type="submit" loading={state === "fetching"} disabled={!url.trim()} className="mt-6 shrink-0">
            {state === "fetching" ? "Trayendo" : "Traer"}
          </Button>
        </form>
      )}
      {items?.length ? (
        <ul className="m-0 list-none overflow-hidden rounded-lg border p-0">
          {items.map((it) => (
            <li key={it.id} className="grid min-h-13 grid-cols-[auto_1fr_auto] items-center gap-3 bg-card py-2 pr-2 pl-3 not-first:border-t">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-sm bg-muted text-muted-foreground",
                  it.state === "done" && "bg-success-soft text-success",
                  it.state === "error" && "bg-destructive-soft text-destructive",
                )}
              >
                <Icon name={it.state === "error" ? "alert" : it.state === "done" ? "check" : "image"} size="sm" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-small font-medium">{it.name}</span>
                {it.state === "uploading" ? (
                  <span
                    role="progressbar"
                    aria-label={`Subiendo ${it.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((it.progress ?? 0) * 100)}
                    className="h-1.5 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border"
                  >
                    <span className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard" style={{ width: `${Math.round((it.progress ?? 0) * 100)}%` }} />
                  </span>
                ) : (
                  <span className={cn("text-caption", it.state === "error" ? "text-destructive" : "text-muted-foreground")}>{it.detail}</span>
                )}
              </span>
              {it.state === "error" && onRetry ? (
                <Button size="sm" variant="ghost" onClick={() => onRetry(it.id)}>
                  Reintentar
                </Button>
              ) : it.state === "uploading" && onCancel ? (
                <IconButton icon="x" label={`Cancelar la subida de ${it.name}`} onClick={() => onCancel(it.id)} />
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
