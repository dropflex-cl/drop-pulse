import type { StoreFacts } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";

/** Resumen operativo del template: mismas cifras, fotos y clases que df-social-proof.liquid. */
export function SocialProofPreview({ facts }: { facts: StoreFacts }) {
  if (facts.count < 1) return null;
  const s = settingsOf("social-proof");
  const eligible = facts.reviews.filter(review => review.rating >= 4);
  const avatars = [
    ...eligible.filter(review => review.photos[0]),
    ...eligible.filter(review => !review.photos[0]),
  ].slice(0, 3);
  return <df-social-proof className="df df-social-proof" style={{ marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` }}>
    <span className="df-social-proof__avatars" aria-hidden="true">
      {avatars.map(review => <span key={review.id} className="df-social-proof__avatar">
        {review.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.photos[0]} alt="" loading="lazy" />
        ) : <DfIcon name="users" />}
      </span>)}
    </span>
    <p className="df-social-proof__text"><strong data-df-rating-template="{count} opiniones">{facts.count.toLocaleString("es-CL")} opiniones</strong>
      {s.show_verified ? <span className="df-social-proof__verified"><DfIcon name="check-circle" /><span className="df-visually-hidden"> (reseñas revisadas por la tienda)</span></span> : null}
      {" de compradores"}
    </p>
  </df-social-proof>;
}
