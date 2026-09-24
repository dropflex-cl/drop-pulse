"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, Switch } from "@/components/df";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import {
  componentName,
  componentPitch,
  componentSummary,
  missingImages,
} from "@/lib/copy/page-ui";
import { componentById } from "@/lib/shopify/components/catalog";
import { exampleTokens, type StoreFacts } from "@/lib/store-preview/facts";
import type { CatalogImage, PageComponentView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { imagesBySlot } from "./component-editor";

// Un componente de la página: qué duda responde, cómo se ve en la tienda (vista previa recortada;
// tocarla abre la edición) y «Usar en la página». La vista previa es decorativa: al lado va lo que
// dice, en texto, para lectores de pantalla.

export interface ComponentCardProps {
  /** Id del catálogo. */
  id: string;
  /** Lo escrito; sin escribir (necesita reseñas o todavía no se escribe), undefined. */
  view?: PageComponentView;
  facts: StoreFacts;
  accent: string | null;
  catalog: CatalogImage[];
  /** Por qué no se puede usar todavía («Necesita 2 reseñas aprobadas»). */
  unavailable?: { reason: string; href: string; action: string };
  busy?: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}

export function ComponentCard({
  id,
  view,
  facts,
  accent,
  catalog,
  unavailable,
  busy,
  onToggle,
  onEdit,
}: ComponentCardProps) {
  const def = componentById(id)!;
  const name = componentName(id);
  const Preview = PREVIEWS[id];
  const examples = view
    ? exampleTokens(
        view.content,
        facts,
        id === "image-with-benefits" ? ["count"] : [],
      )
    : [];
  const missing = view ? missingImages(id, view.images) : [];
  // Sin sus fotos mínimas (las historias) el componente no se dibuja en la tienda: se dice en vez de un marco vacío.
  const needsPhotos = missing.find((s) => s.min > 0);
  const noImage = view?.enabled ? missing : [];
  const approved = view?.status === "aprobado";
  // El degradado de abajo solo cuando la vista previa de verdad se corta.
  const box = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [view?.content, view?.images]);

  return (
    <article
      aria-labelledby={`c-${id}`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        view?.enabled && "border-primary/40",
      )}
    >
      <header className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`c-${id}`} className="text-row font-semibold">
            {name}
          </h3>
          {view ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-caption",
                approved ? "text-success" : "text-muted-foreground",
              )}
            >
              <Icon name={approved ? "check" : "sparkle"} size="sm" />
              {approved
                ? view.edited
                  ? "Tu versión"
                  : "Aprobado"
                : "Propuesta de la IA"}
            </span>
          ) : null}
        </div>
        <p className="text-caption text-muted-foreground">
          {componentPitch(def)}
        </p>
      </header>

      {view ? (
        <>
          <p className="sr-only">Dice: {componentSummary(view.content)}</p>
          <div ref={box} className={cn("relative overflow-hidden rounded-md border", def.kind === "block" ? "max-h-72" : "max-h-112")}>
            {needsPhotos ? (
              <div
                aria-hidden
                className="flex min-h-32 flex-col items-center justify-center gap-1 bg-muted p-4 text-center text-small text-muted-foreground"
              >
                <Icon name="image" />
                Elige al menos {needsPhotos.min} fotos para ver{" "}
                {name.toLowerCase()}.
              </div>
            ) : (
              <StoreFrame accent={accent} scale={0.75}>
                <div className={def.kind === "block" ? "p-4" : undefined}>
                  <Preview
                    content={view.content}
                    facts={facts}
                    images={imagesBySlot(view.images, catalog)}
                  />
                </div>
              </StoreFrame>
            )}
            {clipped ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent" /> : null}
            {/* Tocar la vista previa también abre la edición; con teclado, el botón «Editar» de abajo. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={onEdit}
              className="absolute inset-0 cursor-pointer transition-colors duration-fast hover:bg-foreground/3"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {examples.length || noImage.length ? (
              <ul className="flex flex-wrap gap-2 text-caption">
                {examples.length ? (
                  <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    <Icon name="eye" size="sm" />
                    Con datos de ejemplo: tu tienda pone los reales
                  </li>
                ) : null}
                {noImage.map((s) => (
                  <li
                    key={s.key}
                    className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-warning"
                  >
                    <Icon name="image" size="sm" />
                    Falta imagen: {s.label.toLowerCase()}
                  </li>
                ))}
              </ul>
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="sm"
              icon="edit"
              onClick={onEdit}
              aria-label={`Editar ${name}`}
            >
              Editar
            </Button>
          </div>
          <Switch
            label="Usar en la página"
            hint={
              view.enabled
                ? "Va en tu tienda al publicar."
                : "No va en tu tienda."
            }
            ariaLabel={`Usar ${name} en la página`}
            checked={view.enabled}
            disabled={busy}
            onChange={onToggle}
            className="border-t pt-2"
          />
        </>
      ) : unavailable ? (
        <div className="flex flex-col items-start gap-2 rounded-md bg-muted p-3">
          <p className="text-small text-muted-foreground">
            {unavailable.reason}
          </p>
          <Button
            size="sm"
            variant="secondary"
            iconEnd="chevron-right"
            href={unavailable.href}
          >
            {unavailable.action}
          </Button>
        </div>
      ) : (
        <p className="rounded-md bg-muted p-3 text-small text-muted-foreground">
          Se escribe con el resto de la página.
        </p>
      )}
    </article>
  );
}
