import { Fragment, useId } from "react";
import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfStars } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-faq-and-text.liquid con el contenido del metafield: el texto a la izquierda y el
// acordeón nativo a la derecha, todas cerradas (open_first viene apagado). Sin el JSON-LD ni el JS
// de respaldo de «una abierta a la vez» (la exclusividad ya es nativa con `name`).

interface Item {
  question?: string;
  answer?: string;
  topic?: string;
}

interface Content {
  eyebrow?: string;
  heading?: string;
  heading_highlight?: string;
  body?: string;
  cta_label?: string;
  social_proof_text?: string;
  items?: Item[];
}

/** `newline_to_br` del Liquid. */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/** El título con la primera aparición de `highlight` en acento (replace_first del Liquid). */
function Heading({ text, highlight }: { text: string; highlight: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="df-faq-and-text__highlight">{highlight}</span>
      {text.slice(at + highlight.length)}
    </>
  );
}

export function FaqAndTextPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("faq-and-text");
  const group = `df-faq-${useId()}`;

  // Pregunta y respuesta con sus tokens llenos; una que quede con un token sin llenar no se muestra.
  const items = (content.items ?? [])
    .slice(0, 8)
    .map((it) => ({ question: fill(it.question, facts), answer: fill(it.answer, facts) }))
    .filter((it) => it.question && it.answer && !`${it.question}${it.answer}`.includes("{"));
  // Sin preguntas la sección no se muestra en la tienda.
  if (!items.length) return null;

  const eyebrow = fill(content.eyebrow, facts);
  const heading = fill(content.heading || String(s.heading ?? ""), facts);
  const highlight = fill(content.heading_highlight, facts);
  const body = fill(content.body, facts);
  const cta = fill(content.cta_label, facts);

  // Prueba social: solo con el resumen real de reseñas; sin él los tokens quedan y el texto se oculta.
  const hasSummary = facts.count > 0 && facts.rating != null;
  const socialRaw = s.show_social_proof ? content.social_proof_text || "" : "";
  const social = hasSummary ? fill(socialRaw, facts) : socialRaw;
  const showSocial = social && !social.includes("{");

  return (
    <df-faq-and-text
      className={`df df-faq-and-text df-faq-and-text--${s.item_style}${s.card ? " df-faq-and-text--card" : ""}`}
      style={{ paddingBlock: `${px(s.padding_top)} ${px(s.padding_bottom)}`, "--df-faq-left": `${Number(s.left_width) || 0}%` } as React.CSSProperties}
      {...(s.exclusive ? { "data-exclusive": "" } : {})}
    >
      <div className="df-faq-and-text__inner">
        <div className="df-faq-and-text__intro">
          {eyebrow ? <p className="df-eyebrow">{eyebrow}</p> : null}
          {heading ? (
            <h2 className="df-heading df-faq-and-text__heading">
              <Heading text={heading} highlight={highlight} />
            </h2>
          ) : null}
          {body ? (
            <p className="df-text df-faq-and-text__body">
              <Lines text={body} />
            </p>
          ) : null}

          {/* Los avatares (ajustes del editor) vienen vacíos por defecto. */}
          {showSocial ? (
            <div className="df-faq-and-text__proof">
              <div className="df-faq-and-text__proof-text">
                {hasSummary ? <DfStars rating={facts.rating ?? 0} size="0.875rem" /> : null}
                <p className="df-faq-and-text__proof-line">{social}</p>
              </div>
            </div>
          ) : null}

          {/* El destino real es la página del producto: aquí no navega. */}
          {cta ? <a className="df-faq-and-text__cta">{cta}</a> : null}
        </div>

        <div className="df-faq-and-text__list">
          {items.map((it, i) => (
            <details key={i} className="df-faq-and-text__item" name={s.exclusive ? group : undefined} open={Boolean(s.open_first) && i === 0}>
              <summary className="df-faq-and-text__question">
                <span>{it.question}</span>
                <span className="df-faq-and-text__sign" aria-hidden />
              </summary>
              <div className="df-faq-and-text__answer">
                <p className="df-text">
                  <Lines text={it.answer} />
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </df-faq-and-text>
  );
}
