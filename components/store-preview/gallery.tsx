"use client";

import { useState } from "react";
import type { StoreFacts } from "@/lib/store-preview/facts";

/** Foto a todo el ancho y miniaturas, igual que la galería del theme. */
export function GalleryPreview({
  facts,
}: {
  facts: StoreFacts;
}) {
  const photos = facts.productImages?.length
    ? facts.productImages
    : facts.productImage
      ? [facts.productImage]
      : [];
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && photos.includes(picked) ? picked : photos[0];
  return (
    <div className="df-gallery-preview">
      <div className="df-gallery-preview__hero">
        <div className="df-gallery-preview__image">
          {/* eslint-disable-next-line @next/next/no-img-element -- mismos archivos que la tienda. */}
          {selected ? <img src={selected} alt={facts.productName} /> : null}
        </div>
      </div>
      {photos.length > 1 ? (
        <div
          className="df-gallery-preview__thumbnails"
          role="group"
          aria-label="Imágenes del producto"
        >
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              className="df-gallery-preview__thumbnail"
              aria-label={`Ver imagen ${i + 1}`}
              aria-pressed={selected === photo}
              onClick={(event) => {
                setPicked(photo);
                const strip = event.currentTarget.parentElement!;
                strip.scrollTo({
                  left: event.currentTarget.offsetLeft - strip.offsetLeft,
                  behavior: "instant",
                });
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas de la tienda. */}
              <img src={photo} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
