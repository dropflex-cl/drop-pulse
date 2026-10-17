import { PdpEmptyPreview } from "./pdp-empty";
import { settingsOf, px } from "@/lib/store-preview/settings";
import { Bold, SectionWave } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-pain-block.liquid: título, 3 momentos (marca del acento, título y texto) y el remate.
// Sin momentos con título la tienda no muestra la sección (el editor usa sus bloques, que aquí no hay).

interface Moment {
  slot?: number;
  title?: string;
  text?: string;
}

interface Content {
  heading?: string;
  moments?: Moment[];
  bridge?: string;
}

export function PainBlockPreview({ content }: PreviewProps<Content>) {
  const s = settingsOf("pain-block");
  const moments = (content.moments ?? [])
    .slice(0, 3)
    .filter((m) => (m.title ?? "").trim());
  if (!moments.length) return <PdpEmptyPreview component="pain-block" />;

  const heading = content.heading || String(s.heading ?? "");
  const bridge = content.bridge || String(s.bridge ?? "");

  const tinted = !s.background_color && !s.text_color;
  return (
    <div
      className={`df df-pain-block df-pain-block--${s.layout}${tinted ? " df-pain-block--tinted df-section-tone" : ""}`}
      style={
        {
          "--df-pain-pt": px(s.padding_top),
          "--df-pain-pb": px(s.padding_bottom),
          "--df-pain-heading": px(s.heading_size),
          ...(s.background_color ? { "--df-bg": s.background_color, "--df-pain-bg": s.background_color } : {}),
          ...(s.text_color ? { "--df-fg": s.text_color } : {}),
        } as React.CSSProperties
      }
    >
      <div className="df-pain-block__inner">
        {heading.trim() ? (
          <h2 className="df-heading df-pain-block__heading" data-df-reveal="">
            <Bold
              text={heading}
              mark={(part, i) => (
                <span key={i} className="df-pain-block__hl">
                  {part}
                </span>
              )}
            />
          </h2>
        ) : null}
        <ul className="df-pain-block__list" role="list">
          {moments.map((m, i) => (
            <li key={i} className="df-pain-block__item" data-df-reveal="">
              <span className="df-pain-block__marker" aria-hidden />
              <div className="df-pain-block__body">
                <h3 className="df-pain-block__title">{m.title}</h3>
                {(m.text ?? "").trim() ? (
                  <p className="df-text df-pain-block__text">
                    <Bold
                      text={m.text ?? ""}
                      mark={(part, k) => <strong key={k}>{part}</strong>}
                    />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {bridge.trim() ? (
          <p className="df-pain-block__bridge" data-df-reveal="line">
            <Bold
              text={bridge}
              mark={(part, k) => <strong key={k}>{part}</strong>}
            />
          </p>
        ) : null}
      </div>
      {tinted ? <SectionWave /> : null}
    </div>
  );
}
