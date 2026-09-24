import { Fragment } from "react";
import { fill, tokenValues, type StoreFacts } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon, DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-stats-with-image.liquid + snippets/df-stats-with-image-image.liquid en la ficha del
// producto: el botón va dentro de <df-buy-link> (en la tienda baja al formulario de compra).

type Fact = "rating" | "review_count" | "return_days" | "warranty_months" | "delivery_days_max";

interface Content {
  heading?: string;
  description?: string;
  bullets?: string[];
  cta_label?: string;
  rating_label?: string;
  review_id?: string;
  stats?: { fact?: Fact; label?: string }[];
}

/** Como `split: '**'` del Liquid, pero solo la primera parte destacada lleva `mark`. */
function firstMark(text: string, mark: (part: string) => React.ReactNode) {
  return text.split("**").map((part, i) => (i === 1 ? <Fragment key={i}>{mark(part)}</Fragment> : part));
}

/** El valor de una cifra con el dato real; vacío si la tienda no lo tiene (la cifra se oculta). */
function statValue(fact: Fact | undefined, facts: StoreFacts, hasRating: boolean): string {
  const values = tokenValues(facts);
  switch (fact) {
    case "rating":
      return hasRating ? `${values.rating.value}/5` : "";
    case "review_count":
      return hasRating ? values.count.value : "";
    case "return_days":
      return (facts.policies.return_days ?? 0) > 0 ? String(facts.policies.return_days) : "";
    case "warranty_months":
      return (facts.policies.warranty_months ?? 0) > 0 ? String(facts.policies.warranty_months) : "";
    case "delivery_days_max":
      return facts.logistics ? String(facts.logistics.max) : "";
    default:
      return "";
  }
}

/** `truncate: 240` de Liquid: el total, con los puntos suspensivos, no pasa de 240. */
const truncate = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 3)}...` : text);

export function StatsWithImagePreview({ content, facts, images }: PreviewProps<Content>) {
  const s = settingsOf("stats-with-image");
  const heading = content.heading || String(s.heading ?? "");
  const description = content.description || String(s.description ?? "");
  const ctaLabel = content.cta_label || String(s.button_label ?? "");
  const ratingLabel = content.rating_label || String(s.rating_label ?? "");
  const reviewId = content.review_id || String(s.review_id ?? "");

  // Calificación real, solo con suficientes reseñas.
  const hasRating = (facts.rating ?? 0) > 0 && facts.count >= Number(s.min_reviews);
  const showRating = Boolean(s.show_rating) && hasRating && Boolean(ratingLabel);

  // Testimonio real, elegido por id (tal cual, recortado a 240).
  const review = s.show_testimonial && reviewId ? facts.reviews.find((r) => r.id === reviewId) : undefined;

  // Fotos: las elegidas para el collage; si no, las del producto (hasta max_images).
  const chosen = (images.collage ?? []).slice(0, 4);
  const photos = chosen.length ? chosen : facts.productImage ? [facts.productImage].slice(0, Number(s.max_images) || 1) : [];

  const bullets = content.bullets?.length
    ? content.bullets.slice(0, 4)
    : [s.bullet_1, s.bullet_2, s.bullet_3, s.bullet_4].map((b) => String(b ?? ""));
  const bulletTexts = bullets.map((b) => (b || "").trim()).filter(Boolean);

  const stats = s.show_stats
    ? (content.stats ?? [])
        .slice(0, 3)
        .map((st) => ({ value: statValue(st?.fact, facts, hasRating), label: st?.label || "" }))
        .filter((st) => st.value && st.label)
    : [];

  if (!heading) {
    return (
      <div className="df df-stats-with-image" style={{ "--df-swi-pt": px(s.padding_top), "--df-swi-pb": px(s.padding_bottom) } as React.CSSProperties}>
        <p className="df-placeholder">Hero y cifras: escribe un título en los ajustes o genera el contenido desde DropFlex.</p>
      </div>
    );
  }

  const classes = ["df", "df-stats-with-image"];
  if (photos.length) classes.push("df-stats-with-image--media");
  if (s.image_position === "right") classes.push("df-stats-with-image--reverse");
  if (!s.mobile_image_first) classes.push("df-stats-with-image--media-last");

  return (
    <div
      className={classes.join(" ")}
      style={{ "--df-swi-pt": px(s.padding_top), "--df-swi-pb": px(s.padding_bottom), "--df-swi-radius": px(s.card_radius) } as React.CSSProperties}
    >
      <div className="df-stats-with-image__card">
        {photos.length > 0 && (
          <div className={`df-stats-with-image__collage df-stats-with-image__collage--${photos.length}`}>
            {photos.map((src, i) => (
              <div key={i} className="df-stats-with-image__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="df-stats-with-image__img" src={src} alt="" />
              </div>
            ))}
          </div>
        )}
        <div className="df-stats-with-image__body">
          {showRating && (
            <div className="df-stats-with-image__rating">
              <span aria-hidden>
                <DfStars rating={facts.rating ?? 0} size="1.125rem" />
              </span>
              <p className="df-stats-with-image__rating-text">{fill(ratingLabel, facts)}</p>
            </div>
          )}
          <h2 className="df-heading df-stats-with-image__heading">
            {firstMark(fill(heading, facts), (part) => (
              <span className="df-stats-with-image__hl">{part}</span>
            ))}
          </h2>
          {description && (
            <p className="df-text df-stats-with-image__description">{firstMark(fill(description, facts), (part) => <strong>{part}</strong>)}</p>
          )}
          {bulletTexts.length > 0 && (
            <ul className="df-stats-with-image__bullets" role="list">
              {bulletTexts.map((text, i) => (
                <li key={i} className="df-stats-with-image__bullet">
                  <DfIcon name="check-circle" />
                  <span>{fill(text, facts)}</span>
                </li>
              ))}
            </ul>
          )}
          {stats.length > 0 && (
            <ul className="df-stats-with-image__stats" role="list">
              {stats.map((st, i) => (
                <li key={i} className="df-stats-with-image__stat">
                  <span className="df-stats-with-image__stat-value">{st.value}</span>
                  <span className="df-stats-with-image__stat-label">{fill(st.label, facts)}</span>
                </li>
              ))}
            </ul>
          )}
          {review?.body && (
            <figure className="df-stats-with-image__review">
              <span className="df-stats-with-image__avatar" aria-hidden>
                {review.author.trim().slice(0, 1).toUpperCase()}
              </span>
              <div className="df-stats-with-image__review-body">
                <blockquote className="df-stats-with-image__quote">
                  <p>{`«${truncate(review.body.trim(), 240)}»`}</p>
                </blockquote>
                <figcaption className="df-stats-with-image__review-meta">
                  <DfStars rating={review.rating} size="0.875rem" />
                  <span className="df-stats-with-image__author">
                    {review.author}
                    {review.country ? ` · ${review.country}` : ""}
                  </span>
                </figcaption>
              </div>
            </figure>
          )}
          {ctaLabel && (
            <df-buy-link className="df-stats-with-image__cta-wrap">
              <a className="df-stats-with-image__cta" href="#">
                <span>{ctaLabel}</span>
                <DfIcon name="arrow-right" />
              </a>
            </df-buy-link>
          )}
        </div>
      </div>
    </div>
  );
}
