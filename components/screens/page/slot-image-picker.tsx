"use client";

import { Button, ImageTile } from "@/components/df";
import type { ImageSlot } from "@/lib/shopify/components/define";
import type { CatalogImage, ImagePick } from "@/lib/types";

// Elegir las fotos de un componente (docs/spec-pagina-componentes.md › 4) de TODO el catálogo del
// producto: las fotos de Información base y las imágenes de la etapa Imágenes. Tocar una la agrega
// al final (su número es el orden en la tienda); tocarla otra vez la quita.

const RATIO: Record<ImageSlot["ratio"], string> = { "1:1": "cuadrada", "3:4": "vertical 3:4", "9:16": "vertical 9:16" };

export interface SlotImagePickerProps {
  slots: ImageSlot[];
  picks: ImagePick[];
  images: CatalogImage[];
  onChange: (picks: ImagePick[]) => void;
  /** La etapa Imágenes, para cuando el catálogo no alcanza. */
  imagesHref: string;
}

export function SlotImagePicker({ slots, picks, images, onChange, imagesHref }: SlotImagePickerProps) {
  const key = (p: { source: string; id: string }) => `${p.source}:${p.id}`;
  return (
    <div className="flex flex-col gap-6">
      {slots.map((slot) => {
        const mine = picks.filter((p) => p.slot === slot.key && images.some((i) => key(i) === key(p)));
        const full = mine.length >= slot.max;
        const toggle = (img: CatalogImage) => {
          const i = mine.findIndex((p) => key(p) === key(img));
          if (i >= 0) onChange(picks.filter((p) => !(p.slot === slot.key && key(p) === key(img))));
          else if (slot.max === 1) onChange([...picks.filter((p) => p.slot !== slot.key), { slot: slot.key, source: img.source, id: img.id }]);
          else if (!full) onChange([...picks, { slot: slot.key, source: img.source, id: img.id }]);
        };
        return (
          <section key={slot.key} aria-labelledby={`slot-${slot.key}`} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id={`slot-${slot.key}`} className="text-label">
                {slot.label}
              </h3>
              <span className="text-caption text-muted-foreground tabular-nums">
                {mine.length} de {slot.max === 1 ? "1" : `${slot.min || 1} a ${slot.max}`}
              </span>
            </div>
            <p className="-mt-1 text-caption text-muted-foreground">
              {slot.hint} Foto {RATIO[slot.ratio]}.
            </p>
            {images.length ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((img) => {
                  const order = mine.findIndex((p) => key(p) === key(img));
                  const selected = order >= 0;
                  return (
                    <li key={key(img)} className="flex flex-col gap-1">
                      <ImageTile
                        src={img.src}
                        alt={`${img.origin}${img.alt ? `: ${img.alt}` : ""}`}
                        state={selected ? "selected" : "idle"}
                        order={selected && slot.max > 1 ? order + 1 : undefined}
                        disabled={!selected && full && slot.max > 1}
                        onSelect={() => toggle(img)}
                      />
                      <span className="truncate text-micro text-muted-foreground">{img.origin}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4">
                <p className="text-small text-muted-foreground">Tu producto todavía no tiene imágenes para elegir.</p>
                <Button size="sm" variant="secondary" iconEnd="chevron-right" href={imagesHref}>
                  Ir a Imágenes
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
