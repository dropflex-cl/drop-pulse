import { describe, expect, it } from "vitest";
import { parseImageResponse, tokensOf } from "./response";

const PNG = Buffer.from("iVBORw0KGgo=", "base64");
const usage = { promptTokenCount: 1800, candidatesTokenCount: 1120, thoughtsTokenCount: 200 };

describe("parseImageResponse", () => {
  it("devuelve la primera imagen que no es un borrador del razonamiento", () => {
    const r = parseImageResponse({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ thought: true, inlineData: { data: "AAAA", mimeType: "image/png" } }, { text: "Aquí está" }, { inlineData: { data: PNG.toString("base64"), mimeType: "image/png" } }],
          },
        },
      ],
      usageMetadata: usage,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bytes.equals(PNG)).toBe(true);
      expect(r.mime).toBe("image/png");
      expect(r.tokens).toEqual({ inputTokens: 1800, outputTokens: 1320, textOutputTokens: 200 });
    }
  });

  it("un prompt bloqueado es de reglas de contenido", () => {
    const r = parseImageResponse({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 900 } });
    expect(r).toMatchObject({ ok: false, code: "blocked", reason: "PROHIBITED_CONTENT", tokens: { inputTokens: 900 } });
  });

  it("una imagen cortada por seguridad es de reglas de contenido", () => {
    expect(parseImageResponse({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] })).toMatchObject({ ok: false, code: "blocked" });
  });

  it("solo texto es sin imagen y conserva el texto para el log", () => {
    const r = parseImageResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "No puedo generar eso." }] } }] });
    expect(r).toMatchObject({ ok: false, code: "no_image", reason: "STOP", text: "No puedo generar eso." });
  });

  it("sin candidatos es sin imagen", () => {
    expect(parseImageResponse({})).toMatchObject({ ok: false, code: "no_image", reason: "NO_CANDIDATES" });
  });
});

describe("tokensOf", () => {
  it("separa el texto de salida cuando viene el detalle por modalidad", () => {
    expect(
      tokensOf({ promptTokenCount: 10, candidatesTokenCount: 1150, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }, { modality: "TEXT", tokenCount: 30 }] }),
    ).toEqual({ inputTokens: 10, outputTokens: 1150, textOutputTokens: 30 });
  });

  it("sin metadatos, todo en cero", () => {
    expect(tokensOf(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, textOutputTokens: 0 });
  });
});
