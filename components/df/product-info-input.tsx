"use client";

import { useId } from "react";
import { Icon } from "./icon";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";

export const INFO_TOPICS = ["Beneficios", "Medidas", "Materiales", "Qué incluye", "Modo de uso", "Garantía", "Para quién es"];

export interface ProductInfoInputProps {
  value: string;
  onChange?: (value: string) => void;
  /** Temas que la IA encontró en el texto. */
  found?: string[];
  /** Muestra “Incluye la descripción de Shopify”. */
  fromShopify?: boolean;
  saving?: boolean;
  /** “Guardado hace 5 s”. */
  saved?: string;
  /** No se pudo guardar: qué pasó y qué hacer. */
  error?: string;
  rows?: number;
  label?: string;
  hint?: string;
  placeholder?: string;
  /** Chips a mostrar; por defecto, los temas que faltan. */
  suggest?: string[];
  /** Tocar un chip: agrega una línea con ese título al final del texto. */
  onAddTopic?: (topic: string) => void;
  className?: string;
}

/**
 * Campo único donde el comerciante pega todo lo que sabe del producto; la IA lo ordena y dice qué
 * encontró. Un solo campo, no un formulario: la información llega desordenada.
 */
export function ProductInfoInput({
  value,
  onChange,
  found = [],
  fromShopify,
  saving,
  saved = "Guardado",
  error,
  rows = 8,
  label = "Todo lo que sabes del producto",
  hint = "Pega la descripción del proveedor, medidas, materiales, reseñas o lo que te hayan preguntado tus clientes. Usa esta información como contexto para el chat.",
  placeholder = "Ej.: Corrector de postura de neopreno, talla única ajustable hasta 110 cm de pecho…",
  suggest,
  onAddTopic,
  className,
}: ProductInfoInputProps) {
  const id = useId();
  const chips = suggest ?? INFO_TOPICS.filter((t) => !found.includes(t)).slice(0, 4);
  const enough = found.length >= 3;

  return (
    <section aria-label="Información del producto" className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-heading">
          {label}
        </label>
        <span role="status" className={cn("inline-flex items-center gap-1 text-caption whitespace-nowrap", error ? "text-destructive" : "text-muted-foreground")}>
          {error ? (
            <>
              <Icon name="alert" size="sm" />
              Sin guardar
            </>
          ) : saving ? (
            <>
              <Icon name="loader" size="sm" className="animate-spin" />
              Guardando
            </>
          ) : (
            <>
              <Icon name="check" size="sm" />
              {saved}
            </>
          )}
        </span>
      </div>
      <p id={`${id}-h`} className="text-label font-normal text-muted-foreground">
        {hint}
      </p>
      <div
        className={cn(
          "flex flex-col rounded-lg border border-input bg-background transition-[border-color,box-shadow] duration-fast ease-standard",
          "focus-within:border-primary focus-within:ring-3 focus-within:ring-primary-soft",
          error && "border-destructive",
        )}
      >
        {fromShopify ? (
          <span className="mx-3 mt-3 inline-flex items-center gap-1 self-start rounded-full bg-muted py-0.5 pr-2 pl-1.5 text-caption text-muted-foreground">
            <Icon name="store" size="sm" />
            Incluye la descripción de Shopify
          </span>
        ) : null}
        <textarea
          id={id}
          aria-describedby={`${id}-h ${id}-cov${error ? ` ${id}-err` : ""}`}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          data-focus="within"
          className="min-h-30 resize-y border-0 bg-transparent p-3 text-heading leading-6 font-normal text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <div aria-label="Agregar un tema" role="group" className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {chips.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onAddTopic?.(t)}
                className="h-8 shrink-0 cursor-pointer rounded-full border border-input bg-background px-2.5 text-caption whitespace-nowrap text-foreground hover:bg-accent"
              >
                + {t}
              </button>
            ))}
          </div>
          <span className="text-caption whitespace-nowrap text-muted-foreground tabular-nums">{count(value.length)} caracteres</span>
        </div>
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      <div id={`${id}-cov`} className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1 text-caption text-muted-foreground">
          <Icon name="sparkle" size="sm" />
          {enough ? "Suficiente para empezar" : "Agrega un poco más"} · temas detectados:
        </span>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {INFO_TOPICS.map((t) => {
            const ok = found.includes(t);
            return (
              <li
                key={t}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-caption",
                  ok ? "bg-success-soft text-success" : "text-muted-foreground inset-ring inset-ring-border",
                )}
              >
                <Icon name={ok ? "check" : "minus"} size="sm" strokeWidth={2.25} className="size-3.5" />
                {t}
                <span className="sr-only">{ok ? ": encontrado" : ": falta"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
