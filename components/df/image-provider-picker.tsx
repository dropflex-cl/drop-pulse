import { useId } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface ProviderOption {
  id: string;
  name: string;
  /** Costo por pieza, ya formateado: «≈ $95». */
  cost?: string;
  /** Tiempo por pieza: «~40 s». */
  eta?: string;
  connected: boolean;
  /** Por qué no se puede usar (sin clave, clave rechazada). */
  reason?: string;
}

export interface ImageProviderPickerProps {
  value: string | null;
  providers: ProviderOption[];
  onChange?: (id: string) => void;
  /** Fila con el elegido y «Cambiar». */
  compact?: boolean;
  /** Una línea sobre el botón de generar: «Con Higgsfield · ≈ $95 por pieza · Cambiar». */
  inline?: boolean;
  onChangeRequest?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Con qué proveedor se generan las imágenes de la etapa (.df-prov). Es un `radiogroup`; un proveedor sin
 * conectar queda deshabilitado y dice por qué. La elección se guarda por etapa.
 */
export function ImageProviderPicker({ value, providers, onChange, compact, inline, onChangeRequest, label = "Proveedor de imagen", disabled, className }: ImageProviderPickerProps) {
  const id = useId();
  if (inline) {
    const cur = providers.find((p) => p.id === value) ?? providers[0];
    if (!cur) return null;
    return (
      <p className={cn("flex flex-wrap items-center justify-center text-label font-normal text-muted-foreground tabular-nums", className)}>
        Con <b className="mx-0.75 font-semibold text-foreground">{cur.name}</b>
        {cur.cost ? ` · ${cur.cost} por pieza · ` : " · "}
        {onChangeRequest ? (
          <button type="button" onClick={onChangeRequest} className="ml-1 inline-flex min-h-6 cursor-pointer items-center font-medium text-primary underline underline-offset-3 before:absolute before:-inset-y-2.5 before:inset-x-0 relative">
            Cambiar
          </button>
        ) : null}
      </p>
    );
  }
  if (compact) {
    const cur = providers.find((p) => p.id === value) ?? providers[0];
    if (!cur) return null;
    return (
      <div className={cn("flex min-h-touch items-center gap-2 text-small text-muted-foreground", className)}>
        <Icon name="image" size="sm" />
        <span className="min-w-0 flex-1 tabular-nums">
          <b className="font-semibold text-foreground">{cur.name}</b>
          {cur.cost ? ` · ${cur.cost} por pieza` : ""}
        </span>
        {onChangeRequest ? (
          <button type="button" onClick={onChangeRequest} className="inline-flex min-h-8 cursor-pointer items-center text-small font-medium text-primary underline underline-offset-3">
            Cambiar
          </button>
        ) : null}
      </div>
    );
  }

  const select = (i: number) => {
    const p = providers[i];
    if (p && p.connected && !disabled) onChange?.(p.id);
  };
  // Flechas entre opciones, como un radio nativo.
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    for (let n = 1; n <= providers.length; n++) {
      const j = (i + dir * n + providers.length) % providers.length;
      if (providers[j].connected) {
        select(j);
        (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
        return;
      }
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={`${id}-l`} className="text-label">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid gap-2">
        {providers.map((p, i) => {
          const on = p.id === value;
          const off = !p.connected;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off || disabled}
              tabIndex={on || (!value && i === 0) ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-card px-3.5 py-2.5 text-left text-foreground",
                on && "border-primary bg-primary-soft inset-ring inset-ring-primary",
                off && "cursor-not-allowed bg-muted",
              )}
            >
              <span aria-hidden className={cn("size-4.5 shrink-0 rounded-full bg-background", on ? "inset-ring-5 inset-ring-primary" : "inset-ring-(length:--stroke-strong) inset-ring-input")} />
              <span className="flex min-w-0 flex-col">
                <b className="text-body font-semibold">{p.name}</b>
                <span className="text-label font-normal text-muted-foreground tabular-nums">
                  {off ? (p.reason ?? "No conectado · conéctalo en Ajustes") : [p.cost ? `${p.cost} por pieza` : null, p.eta].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-caption text-muted-foreground">Se guarda para esta etapa. Puedes cambiarlo y volver a generar una pieza con el otro.</span>
    </div>
  );
}
