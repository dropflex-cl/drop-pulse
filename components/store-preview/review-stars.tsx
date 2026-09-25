import { fill, reviewProof } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-review-stars.liquid con las reseñas aprobadas de la tienda: estrellas + «4,7 · 6
// reseñas», enlazado al ancla de las reseñas. Sin reseñas (o bajo el mínimo del bloque) no dibuja
// nada, como la tienda. El origen (review_summary.source_label) no está en los datos: no se muestra.

interface Content {
  label?: string;
}

export function ReviewStarsPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("review-stars");
  const rating = Math.min(5, Math.max(0, facts.rating ?? 0));
  const count = facts.count;
  if (rating <= 0 || count < (Number(s.min_reviews) || 0)) return null;

  // Igual que el Liquid: 4.6 → «4,6», 5 → «5,0»; 1234 → «1.234».
  const r10 = Math.round(rating * 10);
  const ratingText = `${Math.floor(r10 / 10)},${r10 % 10}`;
  const countText = count >= 1000 ? `${Math.floor(count / 1000)}.${String(count % 1000).padStart(3, "0")}` : String(count);

  const template = content.label || String(s.label ?? "");
  // Con pocas reseñas, la proporción; una plantilla sin {count} escribiría la cantidad a mano: la
  // tienda la descarta.
  const proof = reviewProof(facts.reviews);
  const label = proof
    ? `${ratingText} · ${proof}`
    : template.includes("{count}")
    ? fill(template.replaceAll("{count}", countText).replaceAll("{rating}", ratingText), facts)
    : `${ratingText} · ${countText} reseñas`;

  const aria = `Calificación ${ratingText} de 5, basada en ${countText} reseñas`;
  const anchor = String(s.anchor ?? "").replace(/#/g, "").trim();
  const inner = (
    <>
      <span aria-hidden className="df-review-stars__stars">
        <DfStars rating={rating} size={px(s.star_size)} />
      </span>
      {s.show_text ? (
        <span className="df-review-stars__label" aria-hidden>
          {label}
        </span>
      ) : null}
    </>
  );

  return (
    <df-review-stars
      className={`df df-review-stars df-review-stars--${s.alignment}`}
      style={
        {
          "--df-review-stars-text": px(s.text_size),
          "--df-review-stars-offset": px(s.scroll_offset),
          marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}`,
        } as React.CSSProperties
      }
    >
      {anchor ? (
        <a className="df-review-stars__row" href={`#${anchor}`} aria-label={`${aria}. Ir a las reseñas`} data-df-review-stars-link="">
          {inner}
        </a>
      ) : (
        <p className="df-review-stars__row" role="img" aria-label={aria}>
          {inner}
        </p>
      )}
    </df-review-stars>
  );
}
