"use client";

import { Button } from "./button";
import { Field } from "./field";
import { Icon } from "./icon";
import { SegmentedControl } from "./segmented-control";
import { StateChip } from "./state-chip";
import { Switch } from "./switch";
import { cn } from "@/lib/utils";

export type ReviewImporterState = "idle" | "fetching" | "done" | "error";
export type MinStars = "1" | "4" | "5";

export interface ReviewImporterProps {
  state?: ReviewImporterState;
  url?: string;
  onUrlChange?: (url: string) => void;
  /** El motivo y cómo arreglarlo (borde `destructive`). */
  error?: string;
  /** De 0 a 1 mientras importa. */
  progress?: number;
  /** “Leyendo reseñas… 112 de 204”. */
  detail?: string;
  /** “48 importadas · promedio 4,6”. */
  summary?: string;
  actions?: React.ReactNode;
  minStars?: MinStars;
  onMinStarsChange?: (v: MinStars) => void;
  photosOnly?: boolean;
  onPhotosOnlyChange?: (v: boolean) => void;
  translate?: boolean;
  onTranslateChange?: (v: boolean) => void;
  /** false oculta los filtros. */
  filters?: boolean;
  /** false: “Importar reseñas” como botón secundario. */
  primary?: boolean;
  title?: string;
  onImport?: () => void;
  /** Mientras se crea la importación. */
  starting?: boolean;
  className?: string;
}

const MIN_STARS = [
  { value: "1", label: "Todas" },
  { value: "4", label: "4★ o más" },
  { value: "5", label: "Solo 5★" },
];

const CHIP = {
  idle: null,
  fetching: { label: "Importando", icon: "loader", tone: "progress", spin: true },
  done: { label: "Importadas", icon: "check-circle", tone: "success" },
  error: { label: "No se pudo", icon: "alert", tone: "danger" },
} as const;

/**
 * Trae reseñas de un producto de AliExpress a partir de su enlace, con filtros antes de importar
 * (reference/ReviewImporter/README.md). Por defecto trae 4★ o más y traduce al español, guardando
 * siempre el original. Importar otra vez no duplica.
 */
export function ReviewImporter({
  state = "idle",
  url = "",
  onUrlChange,
  error,
  progress,
  detail,
  summary,
  actions,
  minStars = "4",
  onMinStarsChange,
  photosOnly = false,
  onPhotosOnlyChange,
  translate = true,
  onTranslateChange,
  filters = true,
  primary = true,
  title = "Reseñas de AliExpress",
  onImport,
  starting,
  className,
}: ReviewImporterProps) {
  const chip = CHIP[state];
  const editable = state === "idle" || state === "error";
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <section
      aria-label="Importar reseñas"
      className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground", state === "error" && "border-destructive", className)}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-foreground inset-ring inset-ring-border">
          <Icon name="star" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-row font-semibold">{title}</p>
          <p className="truncate text-label font-normal text-muted-foreground">{state === "done" && summary ? summary : "Pega el enlace del producto en AliExpress"}</p>
        </div>
        {chip ? <StateChip {...chip} /> : null}
      </div>

      {state === "fetching" ? (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Importando reseñas"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border"
          >
            <span className="block h-full rounded-full bg-primary transition-[width] duration-slow ease-standard" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-label font-normal text-muted-foreground" aria-live="polite">
            {detail ?? "Leyendo reseñas…"}
          </p>
        </div>
      ) : null}

      {editable ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onImport?.();
          }}
        >
          <Field
            label="Enlace del producto"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://es.aliexpress.com/item/…"
            value={url}
            onValueChange={onUrlChange}
            error={state === "error" ? error : undefined}
            hint="Lo encuentras en la barra de direcciones del producto en AliExpress."
          />
          {filters ? (
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-label">Qué traer</legend>
              <SegmentedControl block value={minStars} onChange={(v) => onMinStarsChange?.(v as MinStars)} label="Calificación mínima" options={MIN_STARS} />
              <Switch label="Traducir al español" hint="Se guarda el texto original" checked={translate} onChange={(v) => onTranslateChange?.(v)} />
              <Switch label="Solo con fotos" hint="Las que más convencen" checked={photosOnly} onChange={(v) => onPhotosOnlyChange?.(v)} />
            </fieldset>
          ) : null}
          <Button type="submit" variant={primary ? "primary" : "secondary"} block icon="arrow-down" loading={starting}>
            Importar reseñas
          </Button>
        </form>
      ) : null}

      {state === "done" && actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
