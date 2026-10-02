import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { accountError, anthropicClient, AnthropicError } from "./client";
import { normalizeKey } from "./connection";

const headers = new Headers();
const KEY = `sk-ant-api03-${"a".repeat(40)}_b-c`;

describe("anthropicClient", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("nunca cae en ANTHROPIC_API_KEY: sin la clave del comerciante, falla", () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    expect(() => anthropicClient("")).toThrow(AnthropicError);
  });

  it("usa la clave que recibe", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-del-servidor";
    expect(anthropicClient(KEY).apiKey).toBe(KEY);
  });
});

describe("accountError", () => {
  it("401: la clave del comerciante no sirve", () => {
    expect(accountError(new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", headers))?.code).toBe("invalid_key");
  });

  it("sin saldo en su cuenta", () => {
    const e = new Anthropic.BadRequestError(400, undefined, "Your credit balance is too low to access the Anthropic API.", headers);
    expect(accountError(e)?.code).toBe("no_credits");
  });

  it("una clave de la organización (sin workspace)", () => {
    const e = new Anthropic.BadRequestError(400, undefined, "This API key is not scoped to a workspace", headers);
    expect(accountError(e)?.code).toBe("no_access");
  });

  it("lo que no es de la cuenta no se atribuye al comerciante", () => {
    expect(accountError(new Anthropic.BadRequestError(400, undefined, "messages: field required", headers))).toBeNull();
    expect(accountError(new Anthropic.RateLimitError(429, undefined, "rate limited", headers))).toBeNull();
  });
});

describe("normalizeKey", () => {
  it("acepta la clave como la copia la consola, con espacios, comillas o Bearer", () => {
    expect(normalizeKey(`  ${KEY}\n`)).toBe(KEY);
    expect(normalizeKey(`"${KEY}"`)).toBe(KEY);
    expect(normalizeKey(`Bearer ${KEY}`)).toBe(KEY);
  });

  it("quita lo invisible que se cuela al copiar: saltos de línea, espacios sin ancho, comillas tipográficas", () => {
    expect(normalizeKey(`${KEY.slice(0, 30)}\n${KEY.slice(30)}`)).toBe(KEY);
    expect(normalizeKey(`​${KEY} `)).toBe(KEY);
    expect(normalizeKey(`“${KEY}”`)).toBe(KEY);
  });

  it("no rechaza un prefijo nuevo de la consola: lo decide Anthropic", () => {
    expect(normalizeKey(`sk-ant-api04-${"a".repeat(40)}`)).not.toBeNull();
    expect(normalizeKey(`sk-ant-key01-${"a".repeat(40)}`)).not.toBeNull();
  });

  it("rechaza lo que no es una API key de Claude", () => {
    expect(normalizeKey("sk-ant-api03-corta")).toBeNull();
    expect(normalizeKey(`sk-ant-admin01-${"a".repeat(40)}`)).toBeNull();
    expect(normalizeKey(`AIza${"a".repeat(35)}`)).toBeNull();
    expect(normalizeKey("sk-ant-api03-Ab1cD...xYz9")).toBeNull();
  });
});
