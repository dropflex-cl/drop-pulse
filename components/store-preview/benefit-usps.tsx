import { fill, policyActive } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { ICON_PATHS } from "@/lib/store-preview/theme.generated";
import { Bold, DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// blocks/df-benefit-usps.liquid: la lista de beneficios con las políticas que la tienda tiene
// activas (los ítems con una política apagada se ocultan, como en la tienda). Sin ítems en el
// contenido, los 5 del bloque. Sin ningún ítem visible no dibuja nada.

interface Item {
  icon?: string;
  text?: string;
  policy?: string;
}

interface Content {
  items?: Item[];
}

export function BenefitUspsPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("benefit-usps");
  const source: Item[] = content.items?.length
    ? content.items.slice(0, 5)
    : [1, 2, 3, 4, 5].map((i) => ({ icon: s[`item_${i}_icon`] as string | undefined, text: s[`item_${i}_text`] as string | undefined, policy: "none" }));

  const items = source
    .filter((it) => it?.text && policyActive(it.policy, facts))
    .map((it) => ({ icon: it.icon && ICON_PATHS[it.icon] ? it.icon : "check", text: fill(it.text, facts) }));
  if (!items.length) return null;

  return (
    <ul
      className={`df df-benefit-usps df-benefit-usps--${s.layout} df-benefit-usps--${s.style} df-benefit-usps--icon-${s.icon_color}`}
      style={
        {
          "--df-usps-icon": px(s.icon_size),
          "--df-usps-text": px(s.text_size),
          "--df-usps-gap": px(s.gap),
          marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}`,
        } as React.CSSProperties
      }
      role="list"
    >
      {items.map((it, i) => (
        <li key={i} className="df-benefit-usps__item">
          <span className="df-benefit-usps__icon">
            <DfIcon name={it.icon} />
          </span>
          <span className="df-benefit-usps__text">
            <Bold text={it.text} mark={(part, k) => <strong key={k}>{part}</strong>} />
          </span>
        </li>
      ))}
    </ul>
  );
}
