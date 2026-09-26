import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { GeminiError, geminiGeneration, toGeminiError } from "./client";

const api = (status: number, message: string) => new ApiError({ status, message });

describe("toGeminiError", () => {
  it("un 429 por minuto es pasajero y se reintenta", () => {
    const e = toGeminiError(api(429, '{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel"}'));
    expect([e.code, e.retryable]).toEqual(["busy", true]);
  });

  it("un 429 diario es cuota agotada y no se reintenta", () => {
    const e = toGeminiError(api(429, '{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}'));
    expect([e.code, e.retryable]).toEqual(["no_credits", false]);
  });

  it("clave, 5xx y 400", () => {
    expect(toGeminiError(api(403, "PERMISSION_DENIED")).code).toBe("invalid_key");
    expect(toGeminiError(api(503, "The model is overloaded")).code).toBe("unavailable");
    expect(toGeminiError(api(400, "Invalid argument")).code).toBe("bad_request");
  });

  it("una conexión que no salió se reintenta; un timeout no (pudo cobrarse)", () => {
    expect(toGeminiError(new TypeError("fetch failed")).retryable).toBe(true);
    const t = toGeminiError(new Error("The operation was aborted due to timeout"));
    expect([t.code, t.retryable]).toEqual(["timeout", false]);
  });
});

describe("geminiGeneration", () => {
  const usage = { model: "gemini-3-pro-image", inputTokens: 2000, outputTokens: 1120, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.138, latencyMs: 24000 };

  it("un intento logrado va con su modelo y su costo", () => {
    const g = geminiGeneration({ bytes: Buffer.alloc(1), mime: "image/png", width: 2048, height: 2048, model: "gemini-3.1-flash-image", fallback: true, size: "2K", usage, costEstimated: false });
    expect(g).toEqual({ provider: "google", model: "gemini-3.1-flash-image", usage, error: null, costEstimated: false });
  });

  it("una respuesta bloqueada se registra fallida con lo que se cobró", () => {
    const g = geminiGeneration(new GeminiError("blocked", "…", undefined, { ...usage, costUsd: 0.004 }, "gemini-3-pro-image"));
    expect(g).toMatchObject({ provider: "google", error: "blocked", usage: { costUsd: 0.004 } });
  });

  it("una falla antes de responder no tiene costo", () => {
    expect(geminiGeneration(api(503, "overloaded"))).toMatchObject({ error: "unavailable", usage: undefined });
  });
});
