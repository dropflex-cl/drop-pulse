import { describe, expect, it } from "vitest";
import { imageCostUsd, priceFor } from "./pricing";

describe("imageCostUsd", () => {
  it("cobra la imagen de Pro a 2K más los tokens de entrada", () => {
    // 0,134 + 2000 × US$2/MTok (costo-actual de v1: la entrada no se contaba).
    expect(imageCostUsd("gemini-3-pro-image", "2K", { inputTokens: 2000, textOutputTokens: 0, images: 1 })).toEqual({ usd: 0.138, estimated: false });
  });

  it("cobra 4K más caro y suma el razonamiento como texto de salida", () => {
    expect(imageCostUsd("gemini-3-pro-image", "4K", { inputTokens: 0, textOutputTokens: 500, images: 1 }).usd).toBeCloseTo(0.24 + 500 * 12e-6, 6);
  });

  it("usa el precio del respaldo Flash cuando lo generó Flash", () => {
    expect(imageCostUsd("gemini-3.1-flash-image", "2K", { inputTokens: 1000, textOutputTokens: 0, images: 1 })).toEqual({ usd: 0.1015, estimated: false });
  });

  it("una respuesta sin imagen cuesta solo la entrada", () => {
    expect(imageCostUsd("gemini-3-pro-image", "2K", { inputTokens: 1500, textOutputTokens: 0, images: 0 }).usd).toBeCloseTo(0.003, 6);
  });

  it("un modelo desconocido se cobra al precio de Pro y queda estimado", () => {
    expect(imageCostUsd("gemini-9-image", "2K", { inputTokens: 0, textOutputTokens: 0, images: 1 })).toEqual({ usd: 0.134, estimated: true });
  });

  it("una resolución que el modelo no publica queda estimada", () => {
    expect(imageCostUsd("gemini-3-pro-image", "0.5K", { inputTokens: 0, textOutputTokens: 0, images: 1 }).estimated).toBe(true);
  });
});

describe("priceFor", () => {
  it("reconoce el id con prefijo y sufijo de versión", () => {
    expect(priceFor("models/gemini-3-pro-image-preview")?.perImage["2K"]).toBe(0.134);
    expect(priceFor("gemini-3.1-flash-image-001")?.perImage["2K"]).toBe(0.101);
    expect(priceFor("gemini-2.5-flash")).toBeNull();
  });
});
