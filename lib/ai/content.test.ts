import { describe, expect, it } from "vitest";
import { retryableContent } from "./content";

describe("mensaje con lo fijo en caché", () => {
  const image = { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: "AAAA" } };

  it("pone el punto de caché al final de lo fijo y deja afuera lo que cambia en cada intento", () => {
    const blocks = retryableContent([image], "FICHA …", "Tu respuesta anterior no cumple las reglas: …");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe(image);
    expect(blocks[1]).toMatchObject({ type: "text", text: "FICHA …", cache_control: { type: "ephemeral" } });
    expect(blocks[2]).toEqual({ type: "text", text: "Tu respuesta anterior no cumple las reglas: …" });
  });

  it("lo fijo es idéntico entre intentos: solo cambia el último bloque", () => {
    const first = retryableContent([image], "contexto", "Propón.");
    const retry = retryableContent([image], "contexto", "Corrige esto. Propón.");
    expect(retry.slice(0, 2)).toEqual(first.slice(0, 2));
    expect(retry[2]).not.toEqual(first[2]);
  });
});
