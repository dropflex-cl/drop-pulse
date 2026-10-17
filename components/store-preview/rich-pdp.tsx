"use client";

import { useId, useState } from "react";
import { PDP_EMPTY_STATES } from "@/lib/shopify/components/_shared/pdp-empty";
import { imageOnlyPdpSlot } from "@/lib/shopify/components/_shared/pdp-content";
import type { PreviewProps } from "./types";
import { DfIcon, DfStars, SectionWave } from "./primitives";
import { PdpEmptyPreview } from "./pdp-empty";

interface Item {
  title?: string;
  body?: string;
  label?: string;
  review_id?: string;
  name?: string;
}
interface Content {
  display_mode?: string;
  image_alt?: string;
  heading?: string;
  body?: string;
  items?: Item[];
  steps?: Item[];
  cases?: Item[];
  stages?: Item[];
  stories?: Item[];
  before_label?: string;
  after_label?: string;
  footnote?: string;
  name?: string;
  credential?: string;
  quote?: string;
  cta_label?: string;
  fact_id?: string;
}
function Image({ src, alt = "" }: { src?: string; alt?: string }) {
  // Las referencias y las imágenes generadas comparten el mismo destino.
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="df-rich__image" src={src} alt={alt} loading="lazy" />
  ) : null;
}
export function RichPdpPreview({
  component,
  content: raw,
  facts,
  images,
}: PreviewProps & { component: string }) {
  const content = (raw ?? {}) as Content;
  const [position, setPosition] = useState(50);
  const id = useId();
  const imageOnlySlot = imageOnlyPdpSlot(component, content);
  const items = content.items ?? content.steps ?? [];
  const stories = (content.stories ?? []).flatMap((s, i) => {
    const review = s.body ? { id: `story-${i}`, body: s.body, author: s.name ?? "", photos: [] as string[], rating: null }
      : facts.reviews.find((r) => r.id === s.review_id);
    return review ? [{ ...s, review }] : [];
  });
  const policy = facts.policies;
  const valid =
    imageOnlySlot ? Boolean(images[imageOnlySlot]?.[0]) : component === "before-after"
      ? Boolean(images.before?.[0] && images.after?.[0])
      : component === "customer-stories"
        ? stories.length > 0
        : component === "expert-endorsement"
          ? Boolean(content.quote)
          : component === "guarantee"
            ? Boolean(
                policy.cod ||
                (policy.return_days ?? 0) > 0 ||
                (policy.warranty_months ?? 0) > 0 ||
                policy.free_shipping,
              )
            : component === "offer-summary"
              ? Boolean(facts.packs?.length)
              : component === "use-cases"
                ? Boolean(content.cases?.length)
                : component === "results-timeline"
                  ? Boolean(content.stages?.length)
                  : items.length > 0;
  if (!valid) return <PdpEmptyPreview component={component} />;
  if (imageOnlySlot) return (
    <section className={`df df-rich df-${component} df-container`} aria-label={content.image_alt}>
      <div className="df-rich__visual">
        <Image src={images[imageOnlySlot]?.[0]} alt={content.image_alt} />
      </div>
    </section>
  );
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: facts.currency,
      maximumFractionDigits: facts.currency === "CLP" ? 0 : 2,
    }).format(n);
  return (
    <section
      className={`df df-rich df-${component} df-container${component === "mechanism" ? " df-section-tone" : component === "guarantee" ? " df-section-tone df-section-tone--deep" : ""}`}
      aria-labelledby={id}
    >
      <h2 className="df-heading df-rich__heading" data-df-reveal="" id={id}>
        {content.heading || (["guarantee", "offer-summary"].includes(component) ? PDP_EMPTY_STATES[component]?.heading : "")}
      </h2>
      {["product-includes", "mechanism", "usage-steps"].includes(component) ? (
        <>
          {component === "mechanism" ? (
            <div className="df-rich__main-image" data-df-reveal="scale">
              <Image src={images.main?.[0]} alt={facts.productName} />
            </div>
          ) : null}
          <ol className="df-rich__grid" role="list">
            {items.map((item, i) => (
              <li className="df-rich__card" data-df-reveal="" key={i}>
                {component === "usage-steps" ? (
                  <span className="df-rich__number">{i + 1}</span>
                ) : null}
                <Image
                  src={
                    component === "mechanism" ? undefined : images[component === "usage-steps" ? "steps" : "items"]?.[i]
                  }
                  alt={item.title}
                />
                <h3 className="df-heading">{item.title}</h3>
                <p className="df-text">{item.body}</p>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {component === "use-cases" ? (
        <div className="df-rich__cases">
          {content.cases?.map((item, i) => (
            <details
              className="df-rich__case"
              name={`${id}-cases`}
              open={i === 0}
              key={i}
            >
              <summary>
                {item.title}
                <DfIcon name="chevron-right" />
              </summary>
              <div className="df-rich__case-body">
                <Image src={images.cases?.[i]} alt={item.title} />
                <p className="df-text">{item.body}</p>
              </div>
            </details>
          ))}
        </div>
      ) : null}
      {component === "before-after" ? (
        <>
          <div
            data-df-comparison
            data-df-comparison-ready="true"
            className="df-rich__comparison" data-df-reveal="scale"
            style={
              {
                "--df-comparison-position": `${position}%`,
              } as React.CSSProperties
            }
          >
            <div className="df-rich__comparison-images">
              <figure data-df-before>
                <Image src={images.before?.[0]} alt={content.before_label} />
                <figcaption>{content.before_label}</figcaption>
              </figure>
              <figure data-df-after>
                <Image src={images.after?.[0]} alt={content.after_label} />
                <figcaption>{content.after_label}</figcaption>
              </figure>
            </div>
            <label className="df-rich__range">
              Desliza para comparar
              <input
                type="range"
                min={0}
                max={100}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                aria-label="Proporción visible del antes y después"
              />
            </label>
          </div>
          <p className="df-text df-rich__note">{content.body}</p>
        </>
      ) : null}
      {component === "results-timeline" ? (
        <>
          <ol className="df-rich__timeline" role="list">
            {content.stages?.map((stage, i) => (
              <li key={i} className="df-rich__card" data-df-reveal="">
                <span className="df-rich__label">{stage.label}</span>
                <h3 className="df-heading">{stage.title}</h3>
                <p className="df-text">{stage.body}</p>
              </li>
            ))}
          </ol>
          <p className="df-text df-rich__note">{content.footnote}</p>
        </>
      ) : null}
      {component === "customer-stories" ? (
        <div className="df-rich__grid">
          {stories.map(({ title, review }) => (
            <article className="df-rich__card" data-df-reveal="" key={review.id}>
              <Image src={review.photos[0]} alt={title} />
              <h3 className="df-heading">{title}</h3>
              {review.rating !== null ? <DfStars rating={review.rating} /> : null}
              <blockquote className="df-text">{review.body}</blockquote>
              <p className="df-rich__label">{review.author}</p>
            </article>
          ))}
        </div>
      ) : null}
      {component === "expert-endorsement" ? (
        <figure className="df-rich__expert df-rich__card" data-df-reveal="">
          <Image src={images.portrait?.[0]} alt={content.name} />
          <div>
            <blockquote className="df-text">{content.quote}</blockquote>
            <figcaption>
              <strong>{content.name}</strong>
              <p className="df-text">{content.credential}</p>
            </figcaption>
          </div>
        </figure>
      ) : null}
      {component === "guarantee" ? (
        <>
          <p className="df-text df-rich__intro" data-df-reveal="">{content.body}</p>
          <ul className="df-rich__grid" role="list">
            {policy.cod ? (
              <li className="df-rich__card" data-df-reveal="">
                <DfIcon name="cash" />
                <h3 className="df-heading">Paga al recibir</h3>
                <p className="df-text">
                  Elige pago contra entrega al confirmar tu pedido.
                </p>
              </li>
            ) : null}
            {(policy.return_days ?? 0) > 0 ? (
              <li className="df-rich__card" data-df-reveal="">
                <DfIcon name="return" />
                <h3 className="df-heading">Cambios y devoluciones</h3>
                <p className="df-text">
                  {policy.return_days} días, según las condiciones de la tienda.
                </p>
              </li>
            ) : null}
            {(policy.warranty_months ?? 0) > 0 ? (
              <li className="df-rich__card" data-df-reveal="">
                <DfIcon name="shield" />
                <h3 className="df-heading">Garantía</h3>
                <p className="df-text">
                  {policy.warranty_months} meses, según las condiciones de la
                  tienda.
                </p>
              </li>
            ) : null}
            {policy.free_shipping ? (
              <li className="df-rich__card" data-df-reveal="">
                <DfIcon name="truck" />
                <h3 className="df-heading">Envío gratis</h3>
                <p className="df-text">
                  {policy.threshold
                    ? `Desde ${money(policy.threshold)}.`
                    : "En tu pedido."}
                </p>
              </li>
            ) : null}
          </ul>
          <div className="df-rich__policy-links">
            {facts.policyLinks?.refund ? <a href={facts.policyLinks.refund}>Lee las condiciones de devolución</a> : null}
            {facts.policyLinks?.shipping ? <a href={facts.policyLinks.shipping}>Consulta los envíos</a> : null}
          </div>
        </>
      ) : null}
      {component === "offer-summary" ? (
        <>
          <p className="df-text df-rich__intro" data-df-reveal="">{content.body}</p>
          <ul className="df-rich__grid" role="list">
            {facts.packs?.map((pack) => (
              <li className="df-rich__card" data-df-reveal="" key={pack.units}>
                {pack.badge ? (
                  <span className="df-rich__label">{pack.badge}</span>
                ) : null}
                <h3 className="df-heading">
                  {pack.label || `${pack.units} unidades`}
                </h3>
                <p className="df-rich__price">
                  {money(pack.price)}
                  {pack.compareAt && pack.compareAt > pack.price ? (
                    <>
                      {" "}
                      <s>{money(pack.compareAt)}</s>
                    </>
                  ) : null}
                </p>
                {pack.compareAt && pack.compareAt > pack.price ? (
                  <p className="df-text">
                    Ahorras {money(pack.compareAt - pack.price)}
                  </p>
                ) : null}
                {pack.support ? (
                  <p className="df-text">{pack.support}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <a className="df-rich__cta df-press" href="#df-product-purchase" data-df-purchase-link="">
            {content.cta_label || "Elegir mi pack"}
            <DfIcon name="arrow-right" />
          </a>
          {policy.cod ? (
            <p className="df-text df-rich__note">Paga al recibir tu pedido</p>
          ) : null}
        </>
      ) : null}
      {["mechanism", "guarantee"].includes(component) ? <SectionWave /> : null}
    </section>
  );
}
