import { RichPdpPreview } from "./rich-pdp";
import type { PreviewProps } from "./types";
export function BeforeAfterPreview(props: PreviewProps) {
  return <RichPdpPreview component="before-after" {...props} />;
}
