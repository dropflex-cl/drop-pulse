import { describe, expect, it } from "vitest";

import { classifyGemini429 } from "./quota";

/** Lo que `@google/genai` pone en `ApiError.message` para un 429. */
function body(quotaId: string, extra = ""): string {
  return `got status: 429 Too Many Requests. ${JSON.stringify({
    error: {
      code: 429,
      message: `You exceeded your current quota, please check your plan and billing details. ${extra}`,
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId }],
        },
      ],
    },
  })}`;
}

describe("classifyGemini429", () => {
  it("una ventana por minuto es pasajera", () => {
    // Todo 429 dice «check your plan and billing details»: «billing» no decide nada.
    expect(
      classifyGemini429(body("GenerateRequestsPerMinutePerProjectPerModel")),
    ).toBe("rate");
  });

  it("un «try again later» genérico es pasajero", () => {
    expect(
      classifyGemini429("Resource has been exhausted. Please try again later."),
    ).toBe("rate");
  });

  it("un tope diario es cuota agotada", () => {
    expect(
      classifyGemini429(body("GenerateRequestsPerDayPerProjectPerModel")),
    ).toBe("quota");
  });

  it("el tope diario gana aunque venga uno por minuto", () => {
    const message = `${body("GenerateRequestsPerMinutePerProjectPerModel")} ${body("GenerateRequestsPerDayPerProjectPerModel")}`;
    expect(classifyGemini429(message)).toBe("quota");
  });

  it("un modelo sin cuota (limit: 0) es cuota agotada", () => {
    expect(
      classifyGemini429(
        "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3-pro-image",
      ),
    ).toBe("quota");
  });

  it("los créditos prepagados agotados son cuota agotada", () => {
    expect(
      classifyGemini429(
        "Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.",
      ),
    ).toBe("quota");
  });

  it("sin pruebas en el cuerpo, cuota agotada", () => {
    expect(classifyGemini429("")).toBe("quota");
    expect(classifyGemini429("429 Too Many Requests")).toBe("quota");
  });
});
