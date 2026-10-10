import { PDP_EMPTY_STATES } from "@/lib/shopify/components/_shared/pdp-empty";
import { DfIcon } from "./primitives";
export function PdpEmptyPreview({ component }: { component: string }) {
  const state = PDP_EMPTY_STATES[component];
  if (!state) return null;
  return (
    <div className="df df-pdp-empty" data-df-empty={component}>
      <DfIcon name={state.icon} />
      <div>
        <h2 className="df-heading">{state.heading}</h2>
        <p className="df-text">{state.body}</p>
      </div>
    </div>
  );
}
