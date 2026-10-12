import type { ReactNode } from "react";
import type { Listing } from "@/lib/copy/listing";
import type { ListingSlot } from "@/lib/copy/page-ui";
import { formatMoney, type StorePack, type StoreFacts } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";
import { GalleryPreview } from "./gallery";
import { ProductBenefitsPreview } from "./product-benefits";
import { GoogleRatingPreview } from "./purchase-supports";

// La ficha sigue templates/product.json: galería, Google, reseñas, badges, título, bajada,
// tres beneficios y packs; luego precio, condiciones y botón. Repite el marcado de los bloques de
// lib/shopify/components/_landing para que el CSS generado del tema lo dibuje igual.

export function PackOffersPreview({ heading: requested, packs, facts }: { heading?: string; packs: StorePack[]; facts: StoreFacts }) {
  const s = settingsOf("pack-offers");
  const heading = requested || String(s.heading ?? "");
  const currency = facts.currency;
  let badgeUsed = false;
  return (
    <df-pack-offers className="df df-pack-offers" style={{ marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` }}>
      <fieldset className="df-pack-offers__set">
        <legend className="df-visually-hidden">{heading || "Elige tu pack"}</legend>
        {heading ? (
          <p className="df-pack-offers__heading" aria-hidden="true">
            <span>{heading}</span>
          </p>
        ) : null}
        {packs.slice(0, 4).map((p, i) => {
          const badge = p.badge && !badgeUsed ? p.badge : undefined;
          if (badge) badgeUsed = true;
          const save = p.compareAt && p.compareAt > p.price ? p.compareAt - p.price : 0;
          const support = p.support || (save > 0 && s.show_savings ? String(s.savings_label).replaceAll("{amount}", formatMoney(save, currency)) : undefined);
          return (
            <label key={p.units} className={`df-pack-offers__card df-press${badge ? " df-pack-offers__card--badge" : ""}`}>
              <input type="radio" className="df-pack-offers__radio" name="df-pack-preview" value={p.units} defaultChecked={i === 0} disabled={facts.inventory?.available === false} tabIndex={-1} />
              <span className="df-pack-offers__mark" aria-hidden="true">
                <DfIcon name="check" />
              </span>
              {badge ? <span className="df-pack-offers__badge">{badge}</span> : null}
              {facts.productImage && s.show_image ? <span className="df-pack-offers__media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="df-pack-offers__img" src={facts.productImage} alt="" loading="lazy" />
              </span> : null}
              <span className="df-pack-offers__body">
                <span className="df-pack-offers__label">{p.label || `${p.units} ${p.units === 1 ? "unidad" : "unidades"}`}</span>
                {facts.inventory?.available === false ? <span className="df-pack-offers__support">Agotado</span> : support ? <span className="df-pack-offers__support">{support}</span> : null}
              </span>
              <span className="df-pack-offers__prices">
                <span className="df-pack-offers__price">{formatMoney(p.price, currency)}</span>
                {save > 0 ? <s className="df-pack-offers__was">{formatMoney(p.compareAt!, currency)}</s> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="df-pack-offers__notice" role="note" data-df-notice="" hidden />
    </df-pack-offers>
  );
}

export function PricePreview({ facts }: { facts: StoreFacts }) {
  const s = settingsOf("price");
  const save = facts.compareAt && facts.compareAt > facts.price ? facts.compareAt - facts.price : 0;
  const template = String(s.badge_label || "Ahorras {amount}");
  const badge = template.replaceAll("{amount}", formatMoney(save, facts.currency)).replaceAll("{percent}", String(facts.compareAt ? Math.round(save * 100 / facts.compareAt) : 0));
  return <df-price className="df df-price" style={{ "--df-price-size": px(s.price_size), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}>
    <span className="df-price__now" data-df-now="">{formatMoney(facts.price, facts.currency)}</span>
    <span className="df-price__was" data-df-was-wrap="" hidden={save <= 0}>
      <span className="df-visually-hidden">Precio normal</span><s data-df-was="">{save > 0 ? formatMoney(facts.compareAt!, facts.currency) : null}</s>
    </span>
    {s.show_badge ? <span className="df-price__badge" data-df-badge="" hidden={save <= 0}>{badge}</span> : null}
  </df-price>;
}

export interface ListingPreviewProps extends PreviewProps<Partial<Listing>> {
  /** Los bloques en uso, ya dibujados, en su lugar de la ficha (LISTING_SLOTS). */
  slots?: Partial<Record<ListingSlot, ReactNode>>;
}

export function ListingPreview({ content, facts, slots }: ListingPreviewProps) {
  const packs = facts.packs ?? [];
  const title = settingsOf("title"), subtitle = settingsOf("subtitle");
  return (
    <div className="df df-listing-preview">
      <GalleryPreview facts={facts} />
      <div className="df-listing-preview__details">
        <GoogleRatingPreview facts={facts} />
        {facts.policies.cod ? <p className="df df-hype-badge df-hype-badge--solid"><span className="df-hype-badge__text">Pagas al recibir</span></p> : null}
        <h1 className="df df-heading df-title" style={{ marginBlock: `${px(title.margin_top)} ${px(title.margin_bottom)}` }}>{content.title || facts.productName}</h1>
        {content.short_description ? <p className="df df-subtitle" style={{ "--df-subtitle-size": px(subtitle.text_size), marginBlock: `${px(subtitle.margin_top)} ${px(subtitle.margin_bottom)}` } as React.CSSProperties}>{content.short_description}</p> : null}
        <ProductBenefitsPreview benefits={content.gallery_benefits} />
        {packs.length > 1 ? (
          <PackOffersPreview heading={content.offer_line} packs={packs} facts={facts} />
        ) : null}
        <div className="df-listing-preview__divider"><hr /></div>
        <PricePreview facts={facts} />
        {slots?.afterPrice}
        <div className="grid h-12 place-items-center rounded-(--df-radius) bg-(--df-accent) text-small font-semibold text-(--df-on-accent)">Pedir y pagar en casa</div>
        {slots?.afterButton}
      </div>
    </div>
  );
}
