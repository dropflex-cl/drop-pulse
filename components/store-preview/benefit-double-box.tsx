import { fill, policyActive } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { ICON_PATHS } from "@/lib/store-preview/theme.generated";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-benefit-double-box.liquid: las dos tarjetas con las políticas que la tienda tiene
// activas (una tarjeta con su política apagada se oculta y la otra ocupa todo el ancho). Sin
// tarjetas en el contenido, las 2 del bloque.

interface Card {
  icon?: string;
  title?: string;
  body?: string;
  policy?: string;
}

interface Content {
  cards?: Card[];
}

export function BenefitDoubleBoxPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("benefit-double-box");
  const source: Card[] = content.cards?.length
    ? content.cards.slice(0, 2)
    : [1, 2].map((i) => ({
        icon: s[`card_${i}_icon`] as string | undefined,
        title: s[`card_${i}_title`] as string | undefined,
        body: s[`card_${i}_body`] as string | undefined,
        policy: "none",
      }));

  const cards = source
    .filter((c) => c?.title && policyActive(c.policy, facts))
    .map((c) => ({ icon: c.icon && ICON_PATHS[c.icon] ? c.icon : "check", title: fill(c.title, facts), body: fill(c.body, facts) }));
  if (!cards.length) return null;

  return (
    <ul
      className={`df df-benefit-double-box${s.border ? " df-benefit-double-box--border" : ""}${s.stack_on_mobile ? " df-benefit-double-box--stack" : ""}`}
      style={
        {
          "--df-dbox-radius": px(s.card_radius),
          "--df-dbox-padding": px(s.card_padding),
          "--df-dbox-icon": px(s.icon_height),
          "--df-dbox-title": px(s.title_size),
          marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}`,
        } as React.CSSProperties
      }
      lang="es"
      role="list"
    >
      {cards.map((c, i) => (
        <li key={i} className="df-benefit-double-box__card">
          <span className="df-benefit-double-box__media">
            <DfIcon name={c.icon} />
          </span>
          <p className="df-benefit-double-box__title">
            <strong>{c.title}</strong>
          </p>
          {c.body ? <p className="df-benefit-double-box__body">{c.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
