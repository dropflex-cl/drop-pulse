import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-image-with-benefits.liquid + snippets/df-image-with-benefits-item.liquid: la foto al
// centro y los beneficios mitad a cada lado (con número impar, la izquierda lleva uno más).

interface Benefit {
  icon?: string;
  title?: string;
  body?: string;
}

interface Content {
  heading?: string;
  benefits?: Benefit[];
}

/** snippets/df-image-with-benefits-item.liquid: sin título no dibuja nada. */
function Item({ benefit }: { benefit: Benefit }) {
  const title = (benefit.title ?? "").trim();
  const body = (benefit.body ?? "").trim();
  if (!title) return null;
  return (
    <li className="df-image-with-benefits__item">
      <span className="df-image-with-benefits__icon">
        <DfIcon name={benefit.icon} />
      </span>
      <div>
        <h3 className="df-image-with-benefits__title">{title}</h3>
        {body ? <p className="df-text df-image-with-benefits__body">{body}</p> : null}
      </div>
    </li>
  );
}

export function ImageWithBenefitsPreview({ content, facts, images }: PreviewProps<Content>) {
  const s = settingsOf("image-with-benefits");
  // Sin beneficios la tienda no muestra la sección (el editor usa sus bloques de respaldo, que aquí no hay).
  const benefits = (content.benefits ?? []).slice(0, 6);
  const total = benefits.length;
  const leftCount = Math.floor((total + 1) / 2);
  const left = benefits.slice(0, leftCount);
  const right = benefits.slice(leftCount);
  if (!left.some((b) => (b.title ?? "").trim())) return null;

  const image = images.main?.[0] || (s.use_product_image ? facts.productImage : undefined);
  // {count} es la cantidad de beneficios (el Liquid lo reemplaza antes); el resto de los tokens, con fill.
  const heading = fill((content.heading || String(s.heading ?? "")).replaceAll("{count}", String(total)), facts);
  const rightHasItems = right.some((b) => (b.title ?? "").trim());

  return (
    <div
      className={`df df-image-with-benefits${image ? " df-image-with-benefits--image" : ""} df-image-with-benefits--align-${s.text_align} df-image-with-benefits--shape-${s.image_shape}`}
      style={
        {
          "--df-iwb-pt": px(s.padding_top),
          "--df-iwb-pb": px(s.padding_bottom),
          "--df-iwb-icon": px(s.icon_size),
          "--df-iwb-heading": px(s.heading_size),
        } as React.CSSProperties
      }
    >
      <div className="df-image-with-benefits__inner">
        {heading.trim() ? <h2 className="df-heading df-image-with-benefits__heading">{heading}</h2> : null}
        <div className="df-image-with-benefits__grid">
          {image ? (
            <div className="df-image-with-benefits__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="df-image-with-benefits__img" src={image} alt="" loading="lazy" />
            </div>
          ) : null}
          <ul className="df-image-with-benefits__list df-image-with-benefits__list--left" role="list">
            {left.map((b, i) => (
              <Item key={i} benefit={b} />
            ))}
          </ul>
          {rightHasItems ? (
            <ul className="df-image-with-benefits__list df-image-with-benefits__list--right" role="list">
              {right.map((b, i) => (
                <Item key={i} benefit={b} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
