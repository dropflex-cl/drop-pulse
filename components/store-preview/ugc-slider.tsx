import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { Bold, DfIcon, DfStars } from "./primitives";
import type { PreviewProps } from "./types";
import { PdpEmptyPreview } from "./pdp-empty";

// blocks/df-ugc-slider.liquid + snippets/df-ugc-slider-card.liquid con la pista cerrada: las
// tarjetas sin póster (los videos los sube el comerciante después), el play y los textos. El
// reproductor (<dialog>) no se dibuja: solo se abre al tocar una tarjeta.

interface Content {
  heading?: string;
  captions?: string[];
}

export function UgcSliderPreview({ content, facts, images }: PreviewProps<Content>) {
  const s = settingsOf("ugc-slider");
  const captions = content.captions ?? [];
  const videos = images.videos ?? [];
  const total = videos.length;
  if (!total) return <PdpEmptyPreview component="ugc-slider" />;
  const perView = String(s.cards_visible || "3");
  const shape = String(s.shape);

  // Valoración compartida de la PDP para {count}, {rating} y la fila de estrellas.
  const hasReviews = (facts.rating ?? 0) > 0 && facts.count >= 0;
  let heading = content.heading || String(s.heading ?? "");
  // Sin valoración, un título con cifra no se muestra.
  if (/\{(count|rating)\}/.test(heading)) heading = hasReviews ? fill(heading, facts) : "";
  const showRating = Boolean(s.show_rating);
  const ratingText = fill("{rating}", facts);
  const countText = fill("{count}", facts);

  const showControls = total > 1 && (Boolean(s.show_arrows) || s.pagination !== "none");
  // df-ugc-slider.js marca data-fits cuando la pista no se desplaza (las tarjetas caben) y
  // entonces el CSS oculta los controles; la barra muestra la parte visible de la pista.
  const fits = shape !== "circle" && total <= Number(perView);
  const thumb = Math.min(1, Number(perView) / total);

  const classes = ["df", "df-ugc-slider", `df-ugc-slider--${shape}`, `df-ugc-slider--play-${s.play_style}`];
  if (s.boxed) classes.push("df-ugc-slider--boxed");

  return (
    <df-ugc-slider
      className={classes.join(" ")}
      data-player={String(s.player)}
      data-preview-motion={String(s.preview_motion)}
      data-fits={fits ? "" : undefined}
      style={
        {
          "--df-ugc-per-view": perView,
          marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}`,
        } as React.CSSProperties
      }
    >
      {(heading || showRating) && (
        <div className="df-ugc-slider__header">
          {heading && (
            <p className="df-heading df-ugc-slider__heading">
              <Bold
                text={heading}
                mark={(part, key) => (
                  <strong key={key} className="df-ugc-slider__highlight">
                    {part}
                  </strong>
                )}
              />
            </p>
          )}
          {showRating && (
            <p className="df-ugc-slider__rating" hidden={!hasReviews}>
              <DfStars rating={facts.rating ?? 0} size="1rem" />
              <span aria-hidden>{`${ratingText} · ${countText} reseñas hoy`}</span>
            </p>
          )}
        </div>
      )}

      <df-slider data-dot-label="Ir al video" role="region" aria-roledescription="carrusel" aria-label="Videos del producto">
        <div className="df-slider__track" data-df-track="">
          {Array.from({ length: total }, (_, i) => {
            const caption = captions[i] || "";
            return (
              <button key={i} type="button" className="df-ugc-slider__card df-press" data-df-ugc-card="" data-src={videos[i]} data-caption={caption} aria-label={`Ver video ${i + 1} de ${total}${caption ? `: ${caption}` : ""}`} aria-haspopup="dialog">
                <span className="df-ugc-slider__media" data-df-ugc-media="">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {images.posters?.[i] ? <img src={images.posters[i]} alt="" loading="lazy" /> : null}
                </span>
                <span className="df-ugc-slider__play" aria-hidden>
                  <DfIcon name="play" />
                </span>
                {caption && shape !== "circle" && (
                  <span className="df-ugc-slider__caption" aria-hidden>
                    {caption}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {showControls && (
          <div className="df-slider__controls df-ugc-slider__controls">
            {s.show_arrows && (
              // Sin data-loop, df-slider.js deshabilita la flecha anterior en la primera tarjeta.
              <button type="button" className="df-slider__arrow" data-df-prev="" disabled>
                <DfIcon name="chevron-left" />
              </button>
            )}
            {s.pagination === "dots" && (
              <div className="df-slider__dots" data-df-dots="">
                {Array.from({ length: total }, (_, i) => (
                  <button key={i} type="button" className="df-slider__dot" aria-current={i === 0 ? "true" : "false"} />
                ))}
              </div>
            )}
            {s.pagination === "bar" && (
              <div className="df-ugc-slider__bar" data-df-ugc-bar="" aria-hidden style={{ "--df-ugc-thumb": thumb.toFixed(3), "--df-ugc-scroll": "0" } as React.CSSProperties}>
                <span />
              </div>
            )}
            {s.show_arrows && (
              <button type="button" className="df-slider__arrow" data-df-next="">
                <DfIcon name="chevron-right" />
              </button>
            )}
          </div>
        )}
      </df-slider>

      {s.sponsored && <p className="df-ugc-slider__note">Incluye contenido patrocinado</p>}
    </df-ugc-slider>
  );
}
