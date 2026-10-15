import { PdpEmptyPreview } from "./pdp-empty";
import { settingsOf, px } from "@/lib/store-preview/settings";
import { ICON_PATHS } from "@/lib/store-preview/theme.generated";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

interface Content {
  gifs?: { heading?: string; text?: string; bullets?: { icon?: string; text?: string }[] }[];
}

/** Misma lista de demostraciones visibles que df-gif-strip-content.liquid. */
export function GifStripPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("gif-strip");
  const gifs = (facts.gifs ?? []).slice(0, 5);
  if (!gifs.length) return <PdpEmptyPreview component="gif-strip" />;
  return <df-gif-strip className="df df-gif-strip" style={{ "--df-gif-radius": px(s.radius), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties} lang="es" role="region" aria-label="El producto en acción">
    <div className="df-gif-strip__header">
      <div><p className="df-eyebrow">El producto en acción</p>{s.heading ? <p className="df-heading df-gif-strip__heading">{String(s.heading)}</p> : null}</div>
    </div>
    <ul className="df-gif-strip__list" role="list" aria-label="Demostraciones del producto">
      {gifs.map((src, index) => {
        const item = content.gifs?.[index];
        return <li key={index} className="df-gif-strip__item" aria-label={`Demostración ${index + 1} de ${gifs.length}`}>
          <figure className="df-gif-strip__figure">
            <div className="df-gif-strip__intro">
              <p className="df-gif-strip__number"><span>Demostración</span><span>0{index + 1} / 0{gifs.length}</span></p>
              {item?.heading ? <p className="df-gif-strip__lead">{item.heading}</p> : null}
            </div>
            <div className="df-gif-strip__frame" data-df-gif-frame="">
              {/* La URL original conserva la animación; las variantes de tamaño pueden aplanarla. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={item?.heading || facts.productName} loading="lazy" decoding="async" />
              <canvas hidden aria-hidden="true" />
              <button type="button" className="df-gif-strip__playback" data-df-gif-toggle="" hidden aria-label={`Pausar animación ${index + 1}`}>
                <span data-df-gif-pause=""><DfIcon name="pause" />Pausar</span>
                <span data-df-gif-play="" hidden><DfIcon name="play" />Reproducir</span>
              </button>
            </div>
            {item?.bullets?.length ? <figcaption className="df-gif-strip__caption"><ul className="df-gif-strip__bullets" role="list">{item.bullets.map((line, i) => <li key={i} className="df-gif-strip__bullet"><DfIcon name={line.icon && ICON_PATHS[line.icon] ? line.icon : "check"} /><span>{line.text}</span></li>)}</ul></figcaption>
              : item?.text ? <figcaption className="df-gif-strip__caption">{item.text}</figcaption> : null}
          </figure>
        </li>;
      })}
    </ul>
  </df-gif-strip>;
}
