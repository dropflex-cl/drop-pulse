"use client";

import Image from "next/image";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export type ReferenceImageState = "ready" | "excluded" | "uploading" | "error";

export interface ReferenceImageProps {
  src?: string;
  alt?: string;
  source?: "shopify" | "upload" | "url";
  state?: ReferenceImageState;
  /** Portada actual en la tienda. */
  cover?: boolean;
  /** La imagen base: toda generación parte de ella. */
  base?: boolean;
  /** Avance de la subida, de 0 a 1. */
  progress?: number;
  /** Motivo del error. */
  error?: string;
  /** Nombre del archivo (para lectores de pantalla mientras sube). */
  name?: string;
  /** En la grilla de 4 columnas (móvil): el origen va más chico para no chocar con el botón. */
  dense?: boolean;
  /** Excluir o volver a usar. */
  onToggle?: () => void;
  /** Tocar la imagen la elige como base. */
  onSelect?: () => void;
  onRetry?: () => void;
  className?: string;
}

const SOURCE: Record<NonNullable<ReferenceImageProps["source"]>, string> = { shopify: "Shopify", upload: "Subida", url: "Enlace" };

const frame = "relative m-0 aspect-square overflow-hidden rounded-md bg-muted inset-ring inset-ring-border";

/**
 * Una imagen de origen (de Shopify, subida o traída por enlace) que la IA usará como referencia.
 * Excluir no borra nada en Shopify: solo le dice a la IA que no la use.
 */
export function ReferenceImage({ src, alt = "", source = "shopify", state = "ready", cover, base, progress = 0, error, name, dense, onToggle, onSelect, onRetry, className }: ReferenceImageProps) {
  if (state === "uploading") {
    const pct = Math.round(progress * 100);
    return (
      <div role="status" aria-label={`Subiendo ${name ?? "imagen"}`} className={cn(frame, "grid place-items-center text-muted-foreground", className)}>
        <span className="relative z-1 flex flex-col items-center gap-1 text-micro font-medium">
          <span className="text-body font-semibold text-foreground tabular-nums">{pct}%</span>
          Subiendo
        </span>
        <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-background">
          <span className="block h-full bg-primary transition-[width] duration-base ease-standard" style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className={cn(frame, "grid place-items-center bg-destructive-soft p-2 text-center text-destructive inset-ring-destructive", className)}>
        <span className="relative z-1 flex flex-col items-center gap-1 pb-7 text-micro font-medium">
          <Icon name="alert" />
          {error ?? "No se pudo subir"}
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="absolute inset-x-1.5 bottom-1.5 h-7 cursor-pointer rounded-sm bg-card text-caption font-semibold text-destructive"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  const off = state === "excluded";
  const isBase = base && !off;
  const badge = cn("rounded-sm font-semibold", dense ? "px-1 text-nano" : "px-1.5 py-0.5 text-micro");
  return (
    <figure className={cn(frame, isBase && "ring-2 ring-primary ring-offset-2 ring-offset-background", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes="(min-width: 1024px) 180px, 25vw"
          draggable={false}
          className={cn("object-cover transition-opacity duration-base ease-standard", off && "opacity-35 grayscale")}
        />
      ) : null}
      <span className={cn("pointer-events-none absolute top-1.5 left-1.5 rounded-sm bg-card font-medium text-foreground ring-1 ring-border", dense ? "px-1 text-nano" : "px-1.5 py-px text-micro")}>
        {SOURCE[source]}
      </span>
      {/* Toda la imagen elige la base; el botón de excluir va encima, en su esquina. */}
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isBase}
          aria-label={isBase ? `Imagen base${alt ? `: ${alt}` : ""}` : `Usar como imagen base${alt ? `: ${alt}` : ""}`}
          className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring"
        />
      ) : null}
      {/* En la grilla densa no caben las dos etiquetas: manda “Base”. */}
      {!off && (isBase || cover) ? (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
          {isBase ? <span className={cn(badge, "bg-primary text-primary-foreground")}>Base</span> : null}
          {cover && !(dense && isBase) ? <span className={cn(badge, "bg-foreground text-background")}>Portada</span> : null}
        </span>
      ) : null}
      {/* Área de 40×40 aunque el círculo mida 24. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!off}
        aria-label={off ? `Usar como referencia${alt ? `: ${alt}` : ""}` : `No usar como referencia${alt ? `: ${alt}` : ""}`}
        className="group absolute top-0.5 right-0.5 grid size-10 cursor-pointer place-items-center focus-visible:outline-none"
      >
        <span className="grid size-6 place-items-center rounded-full bg-card text-foreground ring-1 ring-border group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
          <Icon name={off ? "plus" : "x"} size="sm" strokeWidth={2.25} />
        </span>
      </button>
      {off ? (
        <figcaption className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-center rounded-sm bg-card px-1.5 py-0.5 text-micro font-medium text-foreground">
          No se usa
        </figcaption>
      ) : null}
    </figure>
  );
}

/** El tile “Agregar” de la grilla de referencias (abre la carga). */
export function ReferenceAddTile({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-(length:--stroke-strong) border-dashed border-input bg-background text-label text-primary",
        "hover:border-primary hover:bg-primary-soft",
        className,
      )}
    >
      <Icon name="plus" />
      Agregar
    </button>
  );
}
