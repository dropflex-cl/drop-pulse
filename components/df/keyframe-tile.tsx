import { IconButton } from "./icon-button";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export type KeyframeState = "missing" | "generating" | "review" | "approved" | "discarded" | "failed";

export interface KeyframeTileProps {
  /** «Toma 1», «K1». */
  label: string;
  state: KeyframeState;
  src?: string;
  error?: string;
  busy?: boolean;
  onApprove?: () => void;
  onDiscard?: () => void;
  /** Acciones de un tile decidido o fallido (Volver a revisar, Pedir otra). */
  footer?: React.ReactNode;
}

const NOTE: Partial<Record<KeyframeState, string>> = { missing: "Falta", generating: "Generando…", approved: "Disponible", discarded: "Descartada", review: "Disponible" };

/** Imagen clave 9:16 de una toma, para revisar y elegir (.df-kf). */
export function KeyframeTile({ label, state, src, error, busy, onApprove, onDiscard, footer }: KeyframeTileProps) {
  const img = (state === "review" || state === "approved" || state === "discarded") && src;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className={cn(
          "relative grid aspect-[9/16] place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground",
          state === "missing" && "border-dashed",
          state === "failed" && "border-destructive",
        )}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
          <img src={src} alt={`Imagen clave ${label}`} className={cn("size-full object-cover", state === "discarded" && "opacity-35 grayscale")} loading="lazy" />
        ) : (
          <Icon name={state === "failed" ? "alert" : "sparkle"} className={cn(state === "generating" && "animate-df-pulse", state === "failed" && "text-destructive")} />
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded-sm bg-card px-1.5 py-px text-micro font-medium text-foreground inset-ring inset-ring-border">{label}</span>
        {state === "approved" ? (
          <span aria-hidden className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Icon name="check" size="sm" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      {state === "failed" ? (
        <span className="line-clamp-2 text-caption text-destructive">{error ?? "No se pudo generar."}</span>
      ) : (
        <span role={state === "generating" ? "status" : undefined} className="text-caption text-muted-foreground">
          {NOTE[state]}
        </span>
      )}
      {state === "review" ? (
        <div className="flex gap-1 [&>*]:flex-1 [&>*]:border">
          <IconButton icon="x" label={`Descartar ${label}`} disabled={busy} onClick={onDiscard} />
          <IconButton icon="check" label={`Usar ${label}`} variant="primary" disabled={busy} onClick={onApprove} />
        </div>
      ) : null}
      {footer}
    </div>
  );
}
