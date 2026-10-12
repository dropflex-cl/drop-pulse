import { fill, type StoreReview } from "@/lib/store-preview/facts";
import { contentReview, type ReviewContent } from "@/lib/store-preview/review-content";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { PDP_EMPTY_STATES } from "@/lib/shopify/components/_shared/pdp-empty";
import { DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-review-slider.liquid en su primer estado: la primera reseña a la vista, sin rotar (el
// navegación por dots y deslizamiento; sin avance automático).

interface Item extends ReviewContent {
  excerpt_mode?: "verbatim" | "condensed" | "translated";
}

interface Content {
  heading?: string;
  items?: Item[];
}

interface Pick {
  review: StoreReview;
  excerpt: string;
  mode: string;
}

export function ReviewSliderPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("review-slider");
  const picks: Pick[] = (content.items ?? []).flatMap((item, index) => {
    const review = contentReview(item, facts.reviews, index);
    return review ? [{ review, excerpt: item.excerpt || review.body, mode: item.excerpt_mode ?? "verbatim" }] : [];
  });
  const total = picks.length;
  if (!total) return <div className="df df-placeholder" data-df-empty="review-slider">{PDP_EMPTY_STATES["review-slider"].body}</div>;

  let heading = content.heading || String(s.heading ?? "");
  if (heading.includes("{rating}") && !facts.rating)
    heading = String(s.heading ?? "");
  heading = fill(heading, facts);
  const photoStyle = s.style !== "compact";

  return (
    <df-review-slider
      className={`df df-review-slider df-review-slider--${s.style}`}
      style={
        {
          "--df-review-lines": String(s.text_lines),
          marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}`,
        } as React.CSSProperties
      }
    >
      {heading && (
        <p className="df-heading df-review-slider__heading">{heading}</p>
      )}

      <df-slider
        data-loop=""
        data-dot-label="Ir a la reseña"
        role="region"
        aria-roledescription="carrusel"
        aria-label="Reseñas de compradores"
      >
        <div className="df-slider__track" data-df-track="" data-df-review-order="">
          {picks.map(({ review, excerpt, mode }, i) => {
            const author = review.author || "Comprador";
            const photo = review.photos[0];
            return (
              <div key={`${review.id}-${i}`} className="df-review-slider__card" data-review-id={review.id} role="group" aria-roledescription="reseña" aria-label={`${i + 1} de ${total}`}>
                {photoStyle && (
                  <div className="df-review-slider__avatar">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt={`Foto de la reseña de ${author}`}
                        width={62}
                        height={62}
                        loading="lazy"
                      />
                    ) : (
                      <span aria-hidden>
                        {author.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                <div className="df-review-slider__body">
                  <p className="df-review-slider__meta">
                    <span className="df-review-slider__author">{author}</span>
                    {review.rating > 0 && <DfStars rating={review.rating} size="0.875rem" />}
                  </p>
                  <blockquote className="df-review-slider__text">
                    <p>{excerpt}</p>
                  </blockquote>
                  {(mode !== "verbatim" || s.show_date) && (
                    <div className="df-review-slider__foot">
                      {mode !== "verbatim" && review.body && (
                        <details className="df-review-slider__full">
                          <summary>
                            {mode === "translated" ? "Traducida" : "Resumida"} ·
                            ver completa
                          </summary>
                          <p>{review.body}</p>
                        </details>
                      )}
                      {s.show_date && review.iso && <time dateTime={review.iso}>{review.iso.split("-").reverse().join("/")}</time>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {total > 1 && <div className="df-slider__controls">
          <div className="df-slider__dots" data-df-dots="">
            {picks.map((_, index) => <button key={index} type="button" className="df-slider__dot" aria-label={`Ir a la reseña ${index + 1}`} aria-current={index === 0 ? "true" : "false"} />)}
          </div>
        </div>}
      </df-slider>
    </df-review-slider>
  );
}
