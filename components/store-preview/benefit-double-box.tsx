import { fill, policyActive } from "@/lib/store-preview/facts";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";
import type { IconKey } from "@/lib/shopify/components/define";
interface Content { cards?: { icon: IconKey; title: string; body: string; policy: string }[] }
export function BenefitDoubleBoxPreview({ content, facts }: PreviewProps<Content>) {
  const cards=(content.cards ?? []).filter(c => policyActive(c.policy,facts) && (!(c.title+c.body).match(/\{min\}|\{max\}/) || Boolean(facts.logistics)));
  return cards.length ? <ul className="df df-benefit-double-box">{cards.map((c,i)=><li key={i} className="df-benefit-double-box__card"><DfIcon name={c.icon} /><strong>{fill(c.title,facts)}</strong><span>{fill(c.body,facts)}</span></li>)}</ul> : null;
}
