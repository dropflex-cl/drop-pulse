import type { StoreFacts } from "@/lib/store-preview/facts";
import { formatMoney } from "@/lib/store-preview/facts";
import { DfIcon, DfStars } from "./primitives";

/* eslint-disable @next/next/no-img-element */

export function GoogleRatingPreview({ facts }: { facts: StoreFacts }) {
  const rating = facts.rating;
  if (rating == null || rating <= 0) return null;
  const url = facts.googleRating?.url ?? "";
  const label = <>Calificado {rating.toFixed(1).replace(".", ",")}/5 en Google<span className="df-google-rating__count">({facts.count.toLocaleString("es-CL")} reseñas hoy)</span></>;
  return (
    <div className="df df-google-rating" aria-label="Valoración del producto">
      <img src="/store-preview/df-google-logo.svg" alt="" width={20} height={20} />
      <DfStars rating={rating} size="1rem" />
      {url.startsWith("https://") ? <a href={url} target="_blank" rel="noopener noreferrer">{label}</a> : <span>{label}</span>}
    </div>
  );
}

export function PurchaseGiftCardsPreview({ facts }: { facts: StoreFacts }) {
  return <div>
      <p className="df-purchase-supports__heading">Con tu compra</p>
      <ul className="df-purchase-supports__gifts">
        <li className="df-purchase-supports__gift">
          <DfIcon name="truck" /><strong>Envío a domicilio</strong>
          {facts.policies.free_shipping ? facts.policies.threshold ? <span>Gratis desde {formatMoney(facts.policies.threshold, facts.currency)}</span> : <span className="df-purchase-supports__badge">Gratis</span> : <span>Consulta el costo al pedir</span>}
        </li>
        {facts.gift?.ready ? <li className="df-purchase-supports__gift">
          {facts.gift?.cover ? <img src={facts.gift.cover} alt="" width={64} height={64} /> : <DfIcon name="gift" />}
          <strong>{facts.gift?.title || `Guía de ${facts.productName}`}</strong>
          {facts.gift?.ready ? <><span className="df-purchase-supports__badge">Regalo con tu compra</span><span>Descarga en la confirmación del pedido</span></> : <span>Guía digital en preparación</span>}
        </li> : null}
      </ul>
  </div>;
}
