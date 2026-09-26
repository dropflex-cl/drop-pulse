import { describe, expect, it } from "vitest";
import { IMAGE_COST_BY_PROVIDER, costSource, pickImageProvider } from "./image-provider";

describe("pickImageProvider", () => {
  it("respeta lo guardado mientras siga disponible", () => {
    expect(pickImageProvider("gemini", { higgsfield: true, gemini: true })).toBe("gemini");
    expect(pickImageProvider("higgsfield", { higgsfield: true, gemini: true })).toBe("higgsfield");
  });

  it("si lo guardado ya no está, usa el otro", () => {
    expect(pickImageProvider("gemini", { higgsfield: true, gemini: false })).toBe("higgsfield");
    expect(pickImageProvider("higgsfield", { higgsfield: false, gemini: true })).toBe("gemini");
  });

  it("sin elección: Higgsfield si está conectado, si no Gemini", () => {
    expect(pickImageProvider(null, { higgsfield: true, gemini: true })).toBe("higgsfield");
    expect(pickImageProvider(null, { higgsfield: false, gemini: true })).toBe("gemini");
    expect(pickImageProvider(null, { higgsfield: false, gemini: false })).toBeNull();
  });
});

describe("costos", () => {
  it("Gemini se estima con la imagen de Pro a 2K más la entrada", () => {
    expect(IMAGE_COST_BY_PROVIDER.gemini).toBe(0.138);
  });

  it("solo Higgsfield se cobra de la cuenta del comerciante", () => {
    expect(costSource("higgsfield")).toBe(" de tu cuenta de Higgsfield");
    expect(costSource("gemini")).toBe("");
  });
});
