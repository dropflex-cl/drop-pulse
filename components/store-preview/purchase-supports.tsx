import type { StoreFacts } from "@/lib/store-preview/facts";
import { formatMoney } from "@/lib/store-preview/facts";
import { DfIcon, DfStars } from "./primitives";

/* eslint-disable @next/next/no-img-element */

export function PurchaseSupportsPreview({ facts }: { facts: StoreFacts }) {
  const google = facts.googleRating;
  return (
    <div className="df df-purchase-supports">
      <div className="df df-google-rating">
        <img src="/df-google-logo.svg" alt="Google" width={24} height={24} />
        <DfStars rating={4.4} size="1rem" />
        <span>Calificado 4,4/5 en Google{google && google.count > 0 && <span className="df-google-rating__count"> ({google.count} reseñas)</span>}</span>
      </div>
      <PurchaseGiftCardsPreview facts={facts} />
      <p className="df-purchase-supports__proof"><span className="df-purchase-supports__dot" aria-hidden="true" /><strong>{new Intl.NumberFormat("es-CL").format(facts.count)}</strong> reseñas de compradores</p>
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
        <li className="df-purchase-supports__gift">
          {facts.gift?.cover ? <img src={facts.gift.cover} alt="" width={64} height={64} /> : <DfIcon name="gift" />}
          <strong>{facts.gift?.title || `Guía de ${facts.productName}`}</strong>
          {facts.gift?.ready ? <><span className="df-purchase-supports__badge">Regalo con tu compra</span><span>Descarga en la confirmación del pedido</span></> : <span>Guía digital en preparación</span>}
        </li>
      </ul>
  </div>;
}
