// Lectura de una respuesta de `generateContent` con salida de imagen. Puro (sin el SDK), con tests: los
// tipos son el subconjunto de GenerateContentResponse que usamos.

export interface GeminiResponseLike {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; text?: string; thought?: boolean }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
  modelVersion?: string;
}

export interface GeminiTokens {
  inputTokens: number;
  /** Todos los de salida (imagen + texto + razonamiento), para el registro. */
  outputTokens: number;
  /** Los de salida que no son imagen: se cobran por token (pricing.ts). */
  textOutputTokens: number;
}

export type ParsedImage =
  | { ok: true; bytes: Buffer; mime: string; tokens: GeminiTokens }
  /** `blocked`: lo rechazaron las reglas de contenido; `no_image`: respondió sin imagen (solo texto, cortado…). */
  | { ok: false; code: "blocked" | "no_image"; reason: string; text: string | null; tokens: GeminiTokens };

// Motivos de corte que son reglas de contenido (FinishReason y BlockedReason del SDK).
const SAFETY = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION"]);

export function tokensOf(meta: GeminiResponseLike["usageMetadata"]): GeminiTokens {
  const input = meta?.promptTokenCount ?? 0;
  const candidates = meta?.candidatesTokenCount ?? 0;
  const thoughts = meta?.thoughtsTokenCount ?? 0;
  // Sin el detalle por modalidad, todo `candidates` se toma como imagen (la imagen ya se cobra por
  // unidad): solo el razonamiento se suma por token.
  const text = (meta?.candidatesTokensDetails ?? []).filter((d) => d.modality === "TEXT").reduce((s, d) => s + (d.tokenCount ?? 0), 0);
  return { inputTokens: input, outputTokens: candidates + thoughts, textOutputTokens: text + thoughts };
}

/** La primera imagen de la respuesta (la de verdad, no un borrador del razonamiento), o por qué no hay. */
export function parseImageResponse(r: GeminiResponseLike): ParsedImage {
  const tokens = tokensOf(r.usageMetadata);
  const block = r.promptFeedback?.blockReason;
  if (block) return { ok: false, code: "blocked", reason: block, text: null, tokens };
  const candidate = r.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const image = parts.find((p) => !p.thought && p.inlineData?.data);
  if (image) return { ok: true, bytes: Buffer.from(image.inlineData!.data!, "base64"), mime: image.inlineData!.mimeType ?? "image/png", tokens };
  const reason = candidate?.finishReason ?? (candidate ? "NO_IMAGE" : "NO_CANDIDATES");
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("\n").trim() || null;
  return { ok: false, code: SAFETY.has(reason) ? "blocked" : "no_image", reason, text, tokens };
}
