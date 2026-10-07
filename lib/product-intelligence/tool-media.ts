import type { ImageContent } from "@modelcontextprotocol/sdk/types.js";

// Bytes efímeros del resultado autorizado. No se duplican en JSON ni se persisten.
const images = new WeakMap<object, ImageContent>();
export function attachToolImage<T extends object>(envelope: T, image: ImageContent): T {
  images.set(envelope, image);
  return envelope;
}
export function toolImage(envelope: unknown): ImageContent | undefined {
  return envelope && typeof envelope === "object" ? images.get(envelope) : undefined;
}
