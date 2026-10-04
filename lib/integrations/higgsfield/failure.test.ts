import { describe, expect, it } from "vitest";
import { failedMessage, providerDetail } from "./failure";

const texts = { nsfw: "Higgsfield la rechazó por sus reglas de contenido.", failed: "Higgsfield no pudo generarla. Toca Generar de nuevo." };

describe("el motivo de un trabajo fallido de Higgsfield", () => {
  it("se lee como texto o como objeto, sin espacios de más", () => {
    expect(providerDetail(null)).toBeNull();
    expect(providerDetail("  ")).toBeNull();
    expect(providerDetail({})).toBeNull();
    expect(providerDetail("Input image\n rejected")).toBe("Input image rejected");
    expect(providerDetail({ message: "audio generation failed" })).toBe("audio generation failed");
    expect(providerDetail({ code: 42 })).toBe('{"code":42}');
    expect(providerDetail("x".repeat(400))).toHaveLength(301);
  });

  it("el mensaje dice el motivo tal cual y, sin motivo, queda el de antes", () => {
    expect(failedMessage("failed", null, texts)).toBe(texts.failed);
    expect(failedMessage("failed", "Input image rejected", texts)).toBe(`${texts.failed} Motivo de Higgsfield: «Input image rejected».`);
    expect(failedMessage("nsfw", null, texts)).toBe(texts.nsfw);
  });

  it("si el motivo habla de créditos, lo dice", () => {
    expect(failedMessage("failed", "Insufficient credits", texts)).toMatch(/^Higgsfield no tiene créditos suficientes para esto \(motivo: «Insufficient credits»\)\. Recarga/);
  });
});
