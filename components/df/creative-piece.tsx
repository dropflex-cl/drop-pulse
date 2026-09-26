import { Button } from "./button";
import { Icon } from "./icon";
import { detailCount, QaResult } from "./qa-result";
import { StateChip } from "./state-chip";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export type PieceState = "empty" | "locked" | "queued" | "generating" | "review" | "approved" | "discarded" | "failed";
export type PieceAction = "generate" | "review" | "approve" | "discard" | "undo" | "recover" | "retry";

export interface CreativePieceProps {
  ratio: "1:1" | "9:16";
  /** «Feed 1:1», «Stories 9:16», «Captura 9:16». */
  label?: string;
  state: PieceState;
  /** Nombre del proveedor con que se generó (Higgsfield, Gemini). */
  provider?: string;
  /** Imagen de la pieza (URL firmada). */
  src?: string;
  /** Costo de generarla, ya formateado: «≈ $95». Todo botón que gasta lo muestra. */
  cost?: string;
  /** Segundo intento, sin estilo (el QA rechazó el primero). */
  retry?: boolean;
  /** Detalles del QA; undefined si todavía no hay QA. */
  qa?: string[];
  qaOk?: string;
  /** El proveedor la recibió: se recupera sin volver a pagar. */
  recoverable?: boolean;
  error?: string;
  eta?: string;
  /** Por qué no se puede generar todavía (estado `locked`). */
  lockedLabel?: string;
  /** `row` dentro de CreativeConcept; `full` es la revisión con imagen grande. */
  variant?: "row" | "full";
  /** La acción que está en curso (muestra el spinner en su botón y deshabilita las demás). */
  busy?: PieceAction | null;
  /** Otra acción de la vista está en curso: los botones que gastan se deshabilitan. */
  disabled?: boolean;
  /** Fila: abre la pieza completa desde su nombre. */
  onOpen?: () => void;
  onAction?: (action: PieceAction) => void;
  /** Vista completa: acciones de más (Generar con el otro proveedor). */
  extra?: React.ReactNode;
  className?: string;
}

const RATIO_LABEL = { "1:1": "Feed 1:1", "9:16": "Stories 9:16" } as const;

function PieceStatus({ state, lockedLabel }: { state: PieceState; lockedLabel?: string }) {
  switch (state) {
    case "locked":
      return <StateChip size="sm" tone="quiet" icon="lock" label={lockedLabel ?? "Primero la 1:1"} />;
    case "queued":
      return <StateChip size="sm" tone="progress" icon="clock" label="En cola" />;
    case "generating":
      return <StateChip size="sm" tone="progress" icon="loader" spin label="Generando" />;
    case "review":
      return <StatusBadge size="sm" status="revision" label="Por revisar" />;
    case "approved":
      return <StatusBadge size="sm" status="aprobado" label="En Anuncios" />;
    case "discarded":
      return <StatusBadge size="sm" status="rechazado" label="Descartada" />;
    case "failed":
      return <StatusBadge size="sm" status="error" label="Falló" />;
    default:
      return null;
  }
}

/**
 * Una pieza generada (feed 1:1, Stories 9:16, captura del chat) en todos sus estados (.df-piece):
 * vacía → en cola → generando → por revisar (con QA) → aprobada o descartada; si falla, recuperar o
 * generar de nuevo. Todo botón que genera muestra su costo.
 */
export function CreativePiece(p: CreativePieceProps) {
  const { ratio, state, variant = "row", busy, disabled, onAction } = p;
  const full = variant === "full";
  const vertical = ratio === "9:16";
  const label = p.label ?? RATIO_LABEL[ratio];
  const hasImg = (state === "review" || state === "approved" || state === "discarded") && Boolean(p.src);
  const showProvider = Boolean(p.provider) && state !== "empty" && state !== "locked";
  const act = (a: PieceAction) => () => onAction?.(a);
  const any = Boolean(busy);
  const costly = (text: string) => (p.cost ? `${text} · ${p.cost}` : text);

  const media = (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground",
        full
          ? cn("rounded-lg inset-ring inset-ring-border", hasImg ? (vertical ? "aspect-[9/16] h-95 self-center" : "aspect-square w-full") : "h-35 w-full")
          : cn("justify-self-center rounded-sm", vertical ? "h-14 w-8" : "size-12"),
      )}
    >
      {hasImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
        <img src={p.src} alt={full ? `${label} generada` : ""} className={cn("size-full object-cover", state === "discarded" && "opacity-35 grayscale")} loading="lazy" />
      ) : (
        <Icon
          name={state === "failed" ? "alert" : state === "locked" ? "lock" : "sparkle"}
          className={cn(full && "size-8", state === "generating" && "animate-df-pulse")}
        />
      )}
      {full && showProvider ? (
        <span className="absolute bottom-2 left-2 rounded-sm bg-card px-1.5 py-px text-micro font-medium text-foreground inset-ring inset-ring-border">{p.provider}</span>
      ) : null}
    </div>
  );

  const note =
    state === "generating" && p.retry ? (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <Icon name="undo" size="sm" />
        Segundo intento, sin estilo
      </span>
    ) : state === "queued" || state === "generating" || state === "discarded" ? (
      <span className="text-caption text-muted-foreground">
        {state === "discarded" ? "El archivo se borra en 2 min" : (p.eta ?? (state === "queued" ? "Empieza en unos segundos" : "Suele tardar menos de un minuto"))}
      </span>
    ) : null;

  const fail =
    state === "failed" ? (
      <p className={cn("m-0 text-destructive", full ? "text-small" : "mt-0.5 text-caption")}>
        {p.error ?? "No se pudo generar."}
        {p.recoverable ? ` ${p.provider ?? "El proveedor"} sí la recibió: recupérala sin volver a pagar.` : ""}
      </p>
    ) : null;

  let actions: React.ReactNode = null;
  if (state === "empty" && onAction) {
    actions = (
      <Button variant={full ? "primary" : "secondary"} size={full ? "lg" : "sm"} block={full} icon="sparkle" loading={busy === "generate"} disabled={disabled || any} onClick={act("generate")}>
        {costly(full ? `Generar ${vertical ? "Stories 9:16" : "feed 1:1"}` : "Generar")}
      </Button>
    );
  } else if (state === "review" && onAction) {
    actions = full ? (
      <div className="flex gap-2 [&>*]:flex-1">
        <Button icon="x" kbd="D" loading={busy === "discard"} disabled={any} onClick={act("discard")}>
          Descartar
        </Button>
        <Button variant="primary" icon="check" kbd="A" loading={busy === "approve"} disabled={any} onClick={act("approve")}>
          Aprobar
        </Button>
      </div>
    ) : (
      <Button size="sm" icon="eye" onClick={act("review")} aria-label={`Revisar ${label}`}>
        Revisar
      </Button>
    );
  } else if (state === "failed" && onAction) {
    actions = (
      <div className={cn("flex flex-wrap gap-2", full && "flex-col")}>
        {p.recoverable ? (
          <Button variant={full ? "primary" : "secondary"} size={full ? "md" : "sm"} icon="download" loading={busy === "recover"} disabled={any} onClick={act("recover")}>
            Recuperar
          </Button>
        ) : null}
        <Button variant={full && !p.recoverable ? "primary" : "secondary"} size={full ? "md" : "sm"} icon="undo" loading={busy === "retry"} disabled={disabled || any} onClick={act("retry")}>
          {costly(p.recoverable ? "Generar de nuevo" : "Reintentar")}
        </Button>
      </div>
    );
  } else if ((state === "approved" || state === "discarded") && full && onAction) {
    actions = (
      <Button icon="undo" block loading={busy === "undo"} disabled={any} onClick={act("undo")}>
        Deshacer
      </Button>
    );
  }

  const qaInline = p.qa && state === "review" ? (
    <span className={cn("text-caption font-medium", p.qa.length ? "text-warning" : "text-success")}>{p.qa.length ? `Revisa: ${detailCount(p.qa.length)}` : "QA sin detalles"}</span>
  ) : null;

  if (!full) {
    const title = (
      <>
        {label}
        {showProvider ? <span className="font-normal text-muted-foreground">{` · ${p.provider}`}</span> : null}
      </>
    );
    return (
      <div className={cn("grid grid-cols-[--spacing(12)_minmax(0,1fr)_auto] items-center gap-2.5 border-t py-2", p.className)}>
        {media}
        <div className="flex min-w-0 flex-col gap-0.5">
          {p.onOpen && state !== "empty" && state !== "locked" ? (
            <button type="button" onClick={p.onOpen} className="w-fit cursor-pointer rounded-sm text-left text-small font-semibold hover:underline">
              {title}
            </button>
          ) : (
            <span className="text-small font-semibold">{title}</span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <PieceStatus state={state} lockedLabel={p.lockedLabel} />
            {note}
          </div>
          {qaInline}
          {fail}
        </div>
        {actions ? <div className={cn("flex justify-end gap-1.5", state === "failed" && "col-span-2 col-start-2 justify-start")}>{actions}</div> : null}
      </div>
    );
  }

  return (
    <section aria-label={label} className={cn("flex flex-col items-stretch gap-2.5", p.className)}>
      {media}
      <div className="flex flex-wrap items-center gap-2 text-body">
        <b className="font-semibold">{label}</b>
        <PieceStatus state={state} lockedLabel={p.lockedLabel} />
        {hasImg && p.src ? (
          <a href={p.src} target="_blank" rel="noopener" className="ml-auto inline-flex min-h-8 items-center gap-1 text-small font-medium text-primary underline-offset-3 hover:underline">
            Tamaño completo
            <Icon name="external" size="sm" />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        ) : null}
      </div>
      {note}
      {fail}
      {p.qa && hasImg ? <QaResult issues={p.qa} okLabel={p.qaOk} /> : null}
      {actions}
      {p.extra}
    </section>
  );
}
