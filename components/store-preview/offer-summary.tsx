import { RichPdpPreview } from "./rich-pdp";
import type { PreviewProps } from "./types";
export function OfferSummaryPreview(props: PreviewProps) {
  return <RichPdpPreview component="offer-summary" {...props} />;
}
