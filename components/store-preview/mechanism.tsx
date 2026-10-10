import { RichPdpPreview } from "./rich-pdp";
import type { PreviewProps } from "./types";
export function MechanismPreview(props: PreviewProps) {
  return <RichPdpPreview component="mechanism" {...props} />;
}
