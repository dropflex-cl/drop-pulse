"use client";

import { useId } from "react";
import { Button, CharCount, Icon, IconButton } from "@/components/df";
import { DfIcon } from "@/components/store-preview/primitives";
import { Label } from "@/components/ui/label";
import { ICON_LABELS, emptyValue, type FormField } from "@/lib/copy/form";
import { ICON_KEYS } from "@/lib/shopify/components/define";
import type { StoreReview } from "@/lib/store-preview/facts";
import { cn } from "@/lib/utils";

// Los campos de un componente, dibujados desde su esquema (lib/copy/form.ts): textos con su límite,
// íconos, opciones, reseñas aprobadas, celdas de la comparativa y listas con agregar y quitar dentro
// de su mínimo y máximo. El valor es el json del componente; cada cambio devuelve uno nuevo.

type Path = (string | number)[];

const control =
  "w-full rounded-md border border-input bg-background px-3 text-heading font-normal text-foreground outline-none transition-[border-color,box-shadow] duration-fast ease-standard focus:border-primary focus:ring-3 focus:ring-primary-soft aria-invalid:border-destructive";

/** Un valor dentro del json por su ruta. */
function at(value: unknown, path: Path): unknown {
  return path.reduce<unknown>((v, k) => (v == null ? undefined : (v as Record<string | number, unknown>)[k]), value);
}

/** Copia del json con `next` en la ruta (undefined borra la clave: un opcional vacío no se guarda). */
function put(value: unknown, path: Path, next: unknown): unknown {
  if (!path.length) return next;
  const [k, ...rest] = path;
  if (typeof k === "number") {
    const list = Array.isArray(value) ? [...value] : [];
    list[k] = put(list[k], rest, next);
    return list;
  }
  const obj = { ...((value as Record<string, unknown>) ?? {}) };
  const child = put(obj[k], rest, next);
  if (child === undefined) delete obj[k];
  else obj[k] = child;
  return obj;
}

export interface ComponentFormProps {
  fields: FormField[];
  value: unknown;
  onChange: (next: unknown) => void;
  /** Ruta («benefits.2.body») → qué está mal. */
  errors: Map<string, string>;
  /** Las reseñas aprobadas, para los campos de reseña. */
  reviews: StoreReview[];
}

export function ComponentForm({ fields, value, onChange, errors, reviews }: ComponentFormProps) {
  const ctx = { root: value, onChange, errors, reviews };
  return (
    <div className="flex flex-col gap-5">
      {fields.map((f) => (
        <FieldView key={f.key} field={f} path={[f.key]} ctx={ctx} />
      ))}
    </div>
  );
}

interface Ctx {
  root: unknown;
  onChange: (next: unknown) => void;
  errors: Map<string, string>;
  reviews: StoreReview[];
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="flex items-center gap-1 text-caption text-destructive">
      <Icon name="alert" size="sm" />
      {message}
    </span>
  );
}

function FieldView({ field, path, ctx, label }: { field: FormField; path: Path; ctx: Ctx; label?: string }) {
  const id = useId();
  const key = path.join(".");
  const error = ctx.errors.get(key);
  const value = at(ctx.root, path);
  const set = (next: unknown) => ctx.onChange(put(ctx.root, path, next));
  const name = label ?? field.label;
  const errorId = `${id}-error`;

  switch (field.kind) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      const count = [...text.trim()].length;
      const hintId = `${id}-ayuda`;
      const props = {
        id,
        value: text,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [field.hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(field.optional && !e.target.value ? undefined : e.target.value),
      };
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id} className="text-label">
              {name}
              {field.optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
            </Label>
            {field.max ? <CharCount count={count} limit={field.max} live /> : null}
          </div>
          {field.multiline ? <textarea rows={3} className={cn(control, "min-h-11 resize-y py-2.5 leading-6")} {...props} /> : <input type="text" className={cn(control, "h-control")} {...props} />}
          {field.hint ? (
            <span id={hintId} className="text-caption text-muted-foreground">
              {field.hint}
            </span>
          ) : null}
          <ErrorText id={errorId} message={error} />
        </div>
      );
    }

    case "choice":
    case "review": {
      const options =
        field.kind === "review"
          ? ctx.reviews.map((r) => ({ value: r.id, label: `${r.author} · ${r.rating}★ · ${r.body.length > 60 ? `${r.body.slice(0, 59)}…` : r.body}` }))
          : field.options;
      const current = typeof value === "string" ? value : "";
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} className="text-label">
            {name}
            {field.optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
          </Label>
          <select
            id={id}
            value={current}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => set(e.target.value || undefined)}
            className={cn(control, "h-control")}
          >
            {field.optional || !current ? <option value="">{field.kind === "review" ? "Ninguna" : "Elige una"}</option> : null}
            {!options.some((o) => o.value === current) && current ? <option value={current}>{field.kind === "review" ? "Reseña que ya no está aprobada" : current}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorText id={errorId} message={error} />
        </div>
      );
    }

    case "icon": {
      const current = typeof value === "string" ? value : "";
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label">{name}</legend>
          <details className="group rounded-md border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 text-small [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 place-items-center rounded-sm bg-muted text-foreground">
                <DfIcon name={current} />
              </span>
              <span className="flex-1">{current ? (ICON_LABELS[current] ?? current) : "Sin ícono"}</span>
              <span className="text-caption text-primary group-open:hidden">Cambiar</span>
              <span className="hidden text-caption text-primary group-open:inline">Cerrar</span>
            </summary>
            <div role="radiogroup" aria-label={name} className="grid grid-cols-[repeat(auto-fill,minmax(--spacing(11),1fr))] gap-1 border-t p-2">
              {ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={current === k}
                  aria-label={ICON_LABELS[k] ?? k}
                  title={ICON_LABELS[k] ?? k}
                  onClick={() => set(k)}
                  className={cn(
                    "grid size-11 place-items-center rounded-sm text-foreground transition-colors duration-fast hover:bg-muted",
                    current === k && "bg-primary-soft text-primary inset-ring-2 inset-ring-primary",
                  )}
                >
                  <DfIcon name={k} />
                </button>
              ))}
            </div>
          </details>
          <ErrorText id={errorId} message={error} />
        </fieldset>
      );
    }

    case "cell": {
      const isText = value != null && typeof value === "object";
      const text = isText ? ((value as { text?: string }).text ?? "") : "";
      const choice = isText ? "text" : typeof value === "string" ? value : "";
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} className="text-label">
            {name}
          </Label>
          <select
            id={id}
            value={choice}
            onChange={(e) => set(e.target.value === "text" ? { text } : e.target.value)}
            className={cn(control, "h-control")}
          >
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="text">Texto corto</option>
          </select>
          {isText ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label={`${name}: texto`}
                value={text}
                aria-invalid={error ? true : undefined}
                onChange={(e) => set({ text: e.target.value })}
                className={cn(control, "h-control")}
              />
              {field.max ? <CharCount count={[...text.trim()].length} limit={field.max} /> : null}
            </div>
          ) : null}
          <ErrorText id={errorId} message={error} />
        </div>
      );
    }

    case "group": {
      return (
        <fieldset className="flex flex-col gap-4">
          {name ? <legend className="mb-1 text-label">{name}</legend> : null}
          {field.fields.map((f) => (
            <FieldView key={f.key} field={f} path={[...path, f.key]} ctx={ctx} />
          ))}
          <ErrorText id={errorId} message={error} />
        </fieldset>
      );
    }

    case "list": {
      const items = Array.isArray(value) ? value : [];
      const itemName = (i: number) => `${singular(field.label)} ${i + 1}`;
      return (
        <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id={`${id}-titulo`} className="text-label">
              {name}
              {field.optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
            </h3>
            <span className="text-caption text-muted-foreground tabular-nums">
              {items.length} · {field.min === field.max ? `justo ${field.max}` : `de ${field.min} a ${field.max}`}
            </span>
          </div>
          {field.hint ? <p className="-mt-2 text-caption text-muted-foreground">{field.hint}</p> : null}
          <ErrorText id={errorId} message={error} />
          <ol className="flex flex-col gap-3">
            {items.map((_, i) => (
              <li key={i} className="flex flex-col gap-3 rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-muted-foreground">{itemName(i)}</span>
                  <IconButton
                    icon="minus"
                    label={`Quitar ${itemName(i).toLowerCase()}`}
                    disabled={items.length <= field.min}
                    onClick={() => set(items.filter((__, j) => j !== i))}
                  />
                </div>
                <FieldView field={field.item} path={[...path, i]} ctx={ctx} label={field.item.kind === "group" ? "" : itemName(i)} />
              </li>
            ))}
          </ol>
          {items.length < field.max ? (
            <Button variant="ghost" size="sm" icon="plus" onClick={() => set([...items, emptyValue(field.item)])} className="self-start">
              Agregar {singular(field.label).toLowerCase()}
            </Button>
          ) : null}
        </section>
      );
    }
  }
}

/** «Beneficios» → «Beneficio», «Filas» → «Fila». Suficiente para las etiquetas del catálogo. */
function singular(label: string): string {
  const special: Record<string, string> = { Razones: "Razón", "Columnas de comparación": "Columna", "Textos de los videos": "Texto", Cifras: "Cifra", Elementos: "Elemento" };
  if (special[label]) return special[label];
  return label.endsWith("es") && !label.endsWith("ones") ? label.slice(0, -2) : label.endsWith("s") ? label.slice(0, -1) : label;
}
