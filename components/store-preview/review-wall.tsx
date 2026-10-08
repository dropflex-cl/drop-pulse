import { fill, reviewProof, type StoreReview } from "@/lib/store-preview/facts";
import { wallAuthor, wallDate } from "@/lib/store-preview/review-wall";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-review-wall.liquid al cargar: las primeras publicaciones a la vista y el botón para ver
// más (el «Ver más» de cada texto y el botón los maneja el JS). Autores anonimizados y fechas originales, como el Liquid.

interface Content {
  heading?: string;
  items?: { review_id?: string }[];
}

const THIS_YEAR = String(new Date().getFullYear());

// Los mismos dibujos del Liquid. Los colores de las reacciones van por clase (CSS del tema).
const Avatar = () => (
  <svg viewBox="0 0 40 40" fill="currentColor" aria-hidden>
    <circle cx="20" cy="15" r="6.4" />
    <path d="M20 23.5c-6.4 0-11.6 3.9-11.6 8.7V40h23.2v-7.8c0-4.8-5.2-8.7-11.6-8.7z" />
  </svg>
);
const Dots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </svg>
);
const Globe = () => (
  <svg className="df-review-wall__globe" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M1.75 8h12.5M8 1.75c1.9 1.7 2.9 3.8 2.9 6.25s-1 4.55-2.9 6.25C6.1 12.55 5.1 10.45 5.1 8S6.1 3.45 8 1.75z" />
  </svg>
);
export function ReviewWallPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("review-wall");

  // Como la tienda: las reseñas elegidas, en su orden; un id que no existe se omite.
  const picks: { review: StoreReview; ri: number }[] = [];
  for (const item of content.items ?? []) {
    if (picks.length >= 12) break;
    const ri = item?.review_id ? facts.reviews.findIndex((r) => r.id === item.review_id) : -1;
    const review = facts.reviews[ri];
    if (review && (review.body || review.photos.length)) picks.push({ review, ri });
  }

  if (!content.items) {
    const ordered = facts.reviews.map((review, ri) => ({ review, ri }))
      .filter(({ review }) => review.body || review.photos.length)
      .sort((a, b) => Number(b.review.photos.length > 0) - Number(a.review.photos.length > 0));
    picks.push(...ordered.slice(0, 12));
  }

  if (picks.length < 2 || facts.count < Number(s.min_reviews)) {
    return (
      <div className="df df-review-wall" style={{ "--df-rw-pt": px(s.padding_top), "--df-rw-pb": px(s.padding_bottom) } as React.CSSProperties}>
        <div className="df-review-wall__inner">
          <p className="df-placeholder">{`Testimonios: se muestra cuando lo usas en la página desde DropFlex y el producto tiene al menos ${s.min_reviews} reseñas aprobadas.`}</p>
        </div>
      </div>
    );
  }

  let heading = content.heading || String(s.heading ?? "");
  if (heading.includes("{rating}") && !facts.rating) heading = String(s.heading ?? "");
  heading = fill(heading, facts);
  const rating = facts.rating ?? 0;
  const ratingText = rating.toFixed(1).replace(".", ",");
  const proof = reviewProof(facts.reviews);
  const colsD = Number(s.columns_desktop) || 3;
  const initial = Number(s.initial_posts) || 6;
  const shown = picks.slice(0, initial);

  return (
    <df-review-wall
      className={`df df-review-wall df-review-wall--${s.background}`}
      style={
        {
          "--df-rw-pt": px(s.padding_top),
          "--df-rw-pb": px(s.padding_bottom),
          "--df-rw-cols-m": String(s.columns_mobile),
          "--df-rw-cols-t": String(Math.min(colsD, 3)),
          "--df-rw-cols-d": String(colsD),
          "--df-rw-lines": String(s.text_lines),
          "--df-rw-ratio": s.photo_ratio === "portrait" ? "4 / 5" : "1 / 1",
        } as React.CSSProperties
      }
    >
      <div className="df-review-wall__inner">
        {heading || s.show_rating ? (
          <div className="df-review-wall__head">
            {heading && <h2 className="df-heading df-review-wall__heading">{heading}</h2>}
            {s.show_rating && rating > 0 && (
              <p className="df-review-wall__rating">
                <DfStars rating={rating} size="1.125rem" />
                <span className="df-review-wall__score" aria-hidden>
                  {ratingText}
                </span>
                <span>{proof ? proof.charAt(0).toUpperCase() + proof.slice(1) : `${facts.count} ${facts.count === 1 ? "reseña" : "reseñas"}`}</span>
              </p>
            )}
          </div>
        ) : null}

        <ul className="df-review-wall__grid" role="list">
          {shown.map(({ review }) => {
            const author = wallAuthor(review.author);
            const date = s.show_date ? wallDate(review.iso, THIS_YEAR) : { long: "", short: "" };
            const photos = review.photos.slice(0, 3);
            return (
              <li key={review.id} className="df-review-wall__cell" data-df-rw-post="">
                <article className="df-review-wall__post" tabIndex={-1}>
                  <div className="df-review-wall__top">
                    <span className="df-review-wall__avatar" aria-hidden>
                      <Avatar />
                    </span>
                    <div className="df-review-wall__who">
                      <p className="df-review-wall__name">{author}</p>
                      {date.long && (
                        <p className="df-review-wall__date">
                          <time dateTime={review.iso}>
                            <span className="df-review-wall__date-short">{date.short}</span>
                            <span className="df-review-wall__date-long">{date.long}</span>
                          </time>
                          <span aria-hidden> · </span>
                          <Globe />
                        </p>
                      )}
                    </div>
                    <span className="df-review-wall__dots" aria-hidden>
                      <Dots />
                    </span>
                  </div>

                  {review.body && (
                    <>
                      <p className="df-review-wall__text" data-df-rw-text="">
                        {review.body}
                      </p>
                      <button type="button" className="df-review-wall__expand" data-df-rw-expand="" hidden>
                        Ver más
                      </button>
                    </>
                  )}

                  {photos.length > 0 && (
                    <div className={`df-review-wall__photos df-review-wall__photos--${photos.length}`}>
                      {photos.map((src, k) => (
                        <div key={k} className="df-review-wall__photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Foto de ${author}`} loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}

                </article>
              </li>
            );
          })}
        </ul>

        {picks.length > initial && (
          <div className="df-review-wall__more">
            <button type="button" className="df-review-wall__more-button" data-df-rw-more="" data-step={initial}>
              {String(s.more_label || "Ver más testimonios")}
            </button>
          </div>
        )}
      </div>
    </df-review-wall>
  );
}
