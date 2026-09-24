import type { ReactNode } from "react";
import type { Listing } from "@/lib/copy/listing";
import type { ListingSlot } from "@/lib/copy/page-ui";
import { formatMoney, type StorePack } from "@/lib/store-preview/facts";
import type { PreviewProps } from "./types";

// La ficha en la tienda, en el orden de la PDP del tema (templates/product.json): foto, título, la
// bajada (df-subtitle), el precio con el ahorro (df-price), la oferta sobre los packs
// (df-pack-offers) y el botón. No es un componente del catálogo: repite el marcado de los bloques de
// lib/shopify/components/_landing para que el CSS generado del tema lo dibuje igual.

function PackOffers({ heading, packs, currency }: { heading?: string; packs: StorePack[]; currency: string }) {
  let badgeUsed = false;
  return (
    <div className="df df-pack-offers">
      <fieldset className="df-pack-offers__set">
        <legend className="df-visually-hidden">{heading || "Elige tu pack"}</legend>
        {heading ? (
          <p className="df-pack-offers__heading" aria-hidden="true">
            <span>{heading}</span>
          </p>
        ) : null}
        {packs.map((p, i) => {
          const badge = p.badge && !badgeUsed ? p.badge : undefined;
          if (badge) badgeUsed = true;
          const save = p.compareAt && p.compareAt > p.price ? p.compareAt - p.price : 0;
          const support = p.support || (save > 0 ? `Ahorras ${formatMoney(save, currency)}` : undefined);
          return (
            <label key={p.units} className={`df-pack-offers__card${badge ? " df-pack-offers__card--badge" : ""}`}>
              <input type="radio" className="df-pack-offers__radio" name="df-pack-preview" defaultChecked={i === 0} tabIndex={-1} />
              {badge ? <span className="df-pack-offers__badge">{badge}</span> : null}
              <span className="df-pack-offers__body">
                <span className="df-pack-offers__label">{p.label || `${p.units} ${p.units === 1 ? "unidad" : "unidades"}`}</span>
                {support ? <span className="df-pack-offers__support">{support}</span> : null}
              </span>
              <span className="df-pack-offers__prices">
                <span className="df-pack-offers__price">{formatMoney(p.price, currency)}</span>
                {save > 0 ? <s className="df-pack-offers__was">{formatMoney(p.compareAt!, currency)}</s> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

export interface ListingPreviewProps extends PreviewProps<Partial<Listing>> {
  /** Los bloques en uso, ya dibujados, en su lugar de la ficha (LISTING_SLOTS). */
  slots?: Partial<Record<ListingSlot, ReactNode>>;
}

export function ListingPreview({ content, facts, slots }: ListingPreviewProps) {
  const save = facts.compareAt && facts.compareAt > facts.price ? facts.compareAt - facts.price : 0;
  const packs = facts.packs ?? [];
  return (
    <div className="df flex flex-col gap-3 pb-4">
      <div className="aspect-square w-full bg-(--df-surface)">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista de la tienda: la foto tal cual, como en el tema. */}
        {facts.productImage ? <img src={facts.productImage} alt="" className="size-full object-cover" /> : null}
      </div>
      <div className="flex flex-col gap-3 px-4">
        {slots?.top}
        <p className="df df-heading df-title">{content.title || facts.productName}</p>
        {content.short_description ? <p className="df df-subtitle">{content.short_description}</p> : null}
        <hr className="m-0 border-0 border-t border-(--df-hairline)" />
        <div className="df df-price">
          <span className="df-price__now">{formatMoney(facts.price, facts.currency)}</span>
          {save > 0 ? (
            <>
              <span className="df-price__was">
                <s>{formatMoney(facts.compareAt!, facts.currency)}</s>
              </span>
              <span className="df-price__badge">Ahorras {formatMoney(save, facts.currency)}</span>
            </>
          ) : null}
        </div>
        {slots?.afterPrice}
        {packs.length > 1 ? (
          <PackOffers heading={content.offer_line} packs={packs} currency={facts.currency} />
        ) : content.offer_line ? (
          <p className="text-small font-semibold text-(--df-accent-ink)">{content.offer_line}</p>
        ) : null}
        <div className="grid h-12 place-items-center rounded-(--df-radius) bg-(--df-accent) text-small font-semibold text-(--df-on-accent)">Agregar al carrito</div>
        {slots?.afterButton}
      </div>
    </div>
  );
}
