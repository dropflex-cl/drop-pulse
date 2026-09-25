import { settingsOf, px } from "@/lib/store-preview/settings";
import { Bold } from "./primitives";
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
  const moments = (content.moments ?? []).slice(0, 3).filter((m) => (m.title ?? "").trim());
  if (!moments.length) return null;

  const heading = content.heading || String(s.heading ?? "");
  const bridge = content.bridge || String(s.bridge ?? "");

  return (
    <div
      className={`df df-pain-block df-pain-block--${s.layout}`}
      style={
        {
          "--df-pain-pt": px(s.padding_top),
          "--df-pain-pb": px(s.padding_bottom),
          "--df-pain-heading": px(s.heading_size),
        } as React.CSSProperties
      }
    >
      <div className="df-pain-block__inner">
        {heading.trim() ? (
          <h2 className="df-heading df-pain-block__heading">
            <Bold text={heading} mark={(part, i) => <span key={i} className="df-pain-block__hl">{part}</span>} />
          </h2>
        ) : null}
        <ul className="df-pain-block__list" role="list">
          {moments.map((m, i) => (
            <li key={i} className="df-pain-block__item">
              <span className="df-pain-block__marker" aria-hidden />
              <div className="df-pain-block__body">
                <h3 className="df-pain-block__title">{m.title}</h3>
                {(m.text ?? "").trim() ? (
                  <p className="df-text df-pain-block__text">
                    <Bold text={m.text ?? ""} mark={(part, k) => <strong key={k}>{part}</strong>} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {bridge.trim() ? (
          <p className="df-pain-block__bridge">
            <Bold text={bridge} mark={(part, k) => <strong key={k}>{part}</strong>} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
