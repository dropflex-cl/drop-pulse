import { settingsOf, px } from "@/lib/store-preview/settings";
import { ICON_PATHS } from "@/lib/store-preview/theme.generated";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-gif-strip.liquid: una fila por GIF con su línea arriba y su texto abajo. El GIF N lleva
// el texto N: con 3 GIF subidos se ven los 3 primeros textos, como en la tienda. Sin GIF (la tienda
// no dibuja el bloque) se muestran los textos con un marco vacío, para poder revisarlos.

interface Content {
  gifs?: { heading?: string; text?: string; bullets?: { icon?: string; text?: string }[] }[];
}

export function GifStripPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("gif-strip");
  const gifs = (facts.gifs ?? []).slice(0, 5);
  const items = content.gifs ?? [];
  const rows = gifs.length ? gifs.map((src, i) => ({ src, item: items[i] })) : items.map((item) => ({ src: undefined, item }));
  if (!rows.length) return null;

  return (
    <div
      className="df df-gif-strip"
      style={{ "--df-gif-radius": px(s.radius), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      {s.heading ? <p className="df-heading df-gif-strip__heading">{String(s.heading)}</p> : null}
      <ul className="df-gif-strip__list" role="list">
        {rows.map(({ src, item }, i) => {
          return (
            <li key={i} className="df-gif-strip__item">
              <figure className="df-gif-strip__figure">
                {item?.heading ? <p className="df-gif-strip__lead">{item.heading}</p> : null}
                <span className="df-gif-strip__frame" style={src ? undefined : { aspectRatio: "4 / 3" }}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage; animado (sin optimizar)
                    <img src={src} alt="" loading="lazy" decoding="async" />
                  ) : null}
                </span>
                {item?.bullets?.length ? (
                  <figcaption className="df-gif-strip__caption">
                    <ul className="df-gif-strip__bullets" role="list">
                      {item.bullets.map((line, j) => (
                        <li key={j} className="df-gif-strip__bullet">
                          {/* Un ícono desconocido cae a «check», como el Liquid. */}
                          <DfIcon name={line.icon && ICON_PATHS[line.icon] ? line.icon : "check"} />
                          <span>{line.text}</span>
                        </li>
                      ))}
                    </ul>
                  </figcaption>
                ) : item?.text ? (
                  <figcaption className="df-gif-strip__caption">{item.text}</figcaption>
                ) : null}
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
