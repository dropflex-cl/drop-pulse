import { fill, policyActive } from "@/lib/store-preview/facts";
import { DfIcon } from "./primitives";
import { PdpEmptyPreview } from "./pdp-empty";
import type { PreviewProps } from "./types";
import type { IconKey } from "@/lib/shopify/components/define";
interface Content { cards?: { icon: IconKey; title: string; body: string; policy: string }[] }
export function BenefitDoubleBoxPreview({ content, facts }: PreviewProps<Content>) {
  const cards=(content.cards ?? []).filter(c => {
    const text = c.title + c.body;
    return policyActive(c.policy, facts)
      && (!/\{min\}|\{max\}/.test(text) || Boolean(facts.logistics))
      && (!text.includes("{return_days}") || (facts.policies.return_days ?? 0) > 0)
      && (!text.includes("{warranty_months}") || (facts.policies.warranty_months ?? 0) > 0);
  });
  return cards.length ? <ul className="df df-benefit-double-box" role="list">{cards.map((c,i)=><li key={i} className="df-benefit-double-box__card"><DfIcon name={c.icon} /><strong>{fill(c.title,facts)}</strong><span>{fill(c.body,facts)}</span></li>)}</ul> : <PdpEmptyPreview component="benefit-double-box" />;
}
