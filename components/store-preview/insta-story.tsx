import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-insta-story.liquid en su estado inicial: la fila de círculos con el visor cerrado. El
// <dialog> va en el marcado igual que en la tienda (cerrado no se ve), sin su JS. Como el Liquid,
// una historia sin medio (sin foto en el espacio «stories») se salta.

interface Story {
  title?: string;
  caption_line_1?: string;
  caption_line_2?: string;
  cta_label?: string;
}

interface Content {
  heading?: string;
  stories?: Story[];
}

export function InstaStoryPreview({ content, facts, images }: PreviewProps<Content>) {
  const s = settingsOf("insta-story");
  const media = (images.stories ?? []).slice(0, 12);
  const stories = content.stories ?? [];

  // Una historia por medio, alineadas por índice; los textos de la historia i (o ninguno).
  const items = media
    .map((src, i) => ({ src, story: stories[i] ?? {} }))
    .filter((it) => it.src)
    .map((it, idx) => {
      const title = fill(it.story.title, facts) || `Historia ${idx + 1}`;
      const line1 = fill(it.story.caption_line_1, facts);
      return {
        src: it.src,
        title,
        line1,
        line2: fill(it.story.caption_line_2, facts),
        cta: fill(it.story.cta_label, facts),
        alt: line1 ? `${title}. ${line1}` : title,
      };
    });
  // Sin medios la sección no se muestra en la tienda.
  if (!items.length) return null;

  const heading = fill(content.heading || String(s.heading ?? ""), facts);
  const subheading = fill(String(s.subheading ?? ""), facts);

  return (
    <df-insta-story
      className={`df df-insta-story df-insta-story--ring-${s.ring_style}${s.card ? " df-insta-story--card" : ""}`}
      style={{ paddingBlock: `${px(s.padding_top)} ${px(s.padding_bottom)}`, "--df-story-size": px(s.circle_size) } as React.CSSProperties}
    >
      <div className="df-insta-story__inner">
        {heading || subheading ? (
          <div className="df-insta-story__header">
            {heading ? <h2 className="df-heading df-insta-story__heading">{heading}</h2> : null}
            {subheading ? <p className="df-text df-insta-story__subheading">{subheading}</p> : null}
          </div>
        ) : null}

        <ul className="df-insta-story__row" role="list">
          {items.map((it, i) => (
            <li key={i} className="df-insta-story__item" data-df-story={i}>
              <button type="button" className="df-insta-story__circle">
                <span className="df-insta-story__ring">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="df-insta-story__thumb" src={it.src} alt="" />
                </span>
                <span className="df-insta-story__label">{it.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <dialog className="df-insta-story__viewer" aria-label={heading || "Historias"}>
          <div className="df-insta-story__stage" data-df-stage>
            <div className="df-insta-story__bars" aria-hidden>
              {items.map((_, i) => (
                <span key={i} className="df-insta-story__bar">
                  <span className="df-insta-story__fill" data-df-fill />
                </span>
              ))}
            </div>

            <ol className="df-insta-story__slides">
              {items.map((it, i) => (
                <li key={i} className="df-insta-story__slide" data-df-slide data-type="image" data-label={it.title} hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="df-insta-story__media" src={it.src} alt={it.alt} loading="lazy" />
                  {it.line1 || it.line2 || it.cta ? (
                    <div className="df-insta-story__caption">
                      {it.line1 ? <p className="df-insta-story__line-1">{it.line1}</p> : null}
                      {it.line2 ? (
                        <p className="df-insta-story__line-2">
                          <span>{it.line2}</span>
                        </p>
                      ) : null}
                      {/* El destino real es la página del producto: aquí no navega. */}
                      {it.cta ? (
                        <a className="df-insta-story__cta" data-df-cta>
                          {it.cta}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="df-insta-story__controls">
              <button type="button" className="df-insta-story__control" data-df-pause aria-pressed="false">
                <DfIcon name="pause" className="df-insta-story__icon-pause" />
                <DfIcon name="play" className="df-insta-story__icon-play" />
              </button>
              <button type="button" className="df-insta-story__control" data-df-mute aria-pressed="true" hidden>
                <DfIcon name="volume" className="df-insta-story__icon-sound" />
                <DfIcon name="volume-off" className="df-insta-story__icon-muted" />
              </button>
              <button type="button" className="df-insta-story__control" data-df-close>
                <DfIcon name="x" />
              </button>
            </div>

            {items.length > 1 ? (
              <>
                <button type="button" className="df-insta-story__nav df-insta-story__nav--prev" data-df-prev>
                  <DfIcon name="chevron-left" />
                </button>
                <button type="button" className="df-insta-story__nav df-insta-story__nav--next" data-df-next>
                  <DfIcon name="chevron-right" />
                </button>
              </>
            ) : null}
          </div>
        </dialog>
      </div>
    </df-insta-story>
  );
}
