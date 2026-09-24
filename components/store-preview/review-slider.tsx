import { fill, type StoreReview } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon, DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-review-slider.liquid en su primer estado: la primera reseña a la vista, sin rotar (el
// autoplay y la pausa son del JS). Con menos reseñas que el mínimo, el aviso del editor.

interface Item {
  review_id?: string;
  excerpt?: string;
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
  const maxItems = Number(s.max_items) || 0;
  const minRating = Number(s.min_rating) || 0;

  // Como la tienda: las reseñas que eligió la IA (un id que no existe se omite)…
  const picks: Pick[] = [];
  for (const item of content.items ?? []) {
    if (picks.length >= maxItems) break;
    const review = item?.review_id ? facts.reviews.find((r) => r.id === item.review_id) : undefined;
    if (review) picks.push({ review, excerpt: item.excerpt || review.body, mode: item.excerpt_mode || "condensed" });
  }
  // …o, sin ninguna, las primeras aprobadas con la calificación mínima y el texto completo.
  if (!picks.length) {
    for (const review of facts.reviews) {
      if (picks.length >= maxItems) break;
      if (review.rating >= minRating && review.body && !(s.only_with_photo && !review.photos.length)) {
        picks.push({ review, excerpt: review.body, mode: "verbatim" });
      }
    }
  }

  const total = picks.length;
  if (!total || facts.count < Number(s.min_reviews)) {
    return (
      <div className="df df-placeholder">
        {`Carrusel de reseñas: se muestra cuando el producto tiene al menos ${s.min_reviews} reseñas aprobadas en DropFlex.`}
      </div>
    );
  }

  let heading = content.heading || String(s.heading ?? "");
  if (heading.includes("{rating}") && !facts.rating) heading = String(s.heading ?? "");
  heading = fill(heading, facts);
  const autoplay = Boolean(s.autoplay) && total > 1;
  const photoStyle = s.style === "photo";
  const sourceLabel = String(s.source_label ?? "");

  return (
    <df-review-slider
      className={`df df-review-slider df-review-slider--${s.style}`}
      style={{ "--df-review-lines": String(s.text_lines), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      {heading && <p className="df-heading df-review-slider__heading">{heading}</p>}

      <df-slider data-autoplay={autoplay ? Number(s.autoplay_delay) * 1000 : undefined} data-loop="">
        <div className="df-slider__track" data-df-track="">
          {picks.map(({ review, excerpt, mode }, i) => {
            const author = review.author || "Comprador";
            const photo = review.photos[0];
            return (
              <div key={`${review.id}-${i}`} className="df-review-slider__card">
                {photoStyle && (
                  <div className="df-review-slider__avatar">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" width={62} height={62} loading="lazy" />
                    ) : (
                      <span aria-hidden>{author.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                )}
                <div className="df-review-slider__body">
                  <p className="df-review-slider__meta">
                    <span className="df-review-slider__author">{author}</span>
                    <DfStars rating={review.rating || 5} size="0.875rem" />
                    {s.show_country && review.country && <span className="df-review-slider__country">{review.country}</span>}
                  </p>
                  <blockquote className="df-review-slider__text">
                    <p>{excerpt}</p>
                  </blockquote>
                  {(mode !== "verbatim" || s.show_date) && (
                    <div className="df-review-slider__foot">
                      {mode !== "verbatim" && review.body && (
                        <details className="df-review-slider__full">
                          <summary>{mode === "translated" ? "Traducida" : "Resumida"} · ver completa</summary>
                          <p>{review.body}</p>
                        </details>
                      )}
                      {s.show_date && review.date && <time>{review.date}</time>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {total > 1 && (
          <div className="df-slider__controls">
            {photoStyle ? (
              <button type="button" className="df-slider__arrow" data-df-prev="">
                <DfIcon name="chevron-left" />
              </button>
            ) : (
              // Los puntos los crea df-slider.js al cargar: uno por reseña, el primero activo.
              <div className="df-slider__dots" data-df-dots="">
                {picks.map((_, i) => (
                  <button key={i} type="button" className="df-slider__dot" aria-current={i === 0 ? "true" : "false"} />
                ))}
              </div>
            )}
            {autoplay && (
              <button type="button" className="df-slider__arrow df-review-slider__pause" data-df-pause="" aria-pressed="false">
                <DfIcon name="pause" className="df-review-slider__icon-pause" />
                <DfIcon name="play" className="df-review-slider__icon-play" />
              </button>
            )}
            {photoStyle && (
              <button type="button" className="df-slider__arrow" data-df-next="">
                <DfIcon name="chevron-right" />
              </button>
            )}
          </div>
        )}
      </df-slider>

      {sourceLabel && <p className="df-review-slider__source">{sourceLabel}</p>}
    </df-review-slider>
  );
}
