import { describe, expect, it } from "vitest";
import { reviewFlags } from "./flags";

describe("reviewFlags", () => {
  it("una reseña sobre el producto no lleva alertas", () => {
    expect(reviewFlags("Llegó bien y se ajusta perfecto. Después de una semana noto menos dolor en los hombros.")).toEqual([]);
  });

  it("las alertas del design system", () => {
    expect(reviewFlags("Mejor que el de la marca PostureX que tenía antes, y mucho más barato.")).toContain("Menciona otra marca");
    expect(reviewFlags("Buen producto, llegó en 20 días.")).toEqual(["Habla del envío", "Muy corta"]);
    expect(reviewFlags("Escríbeme al +56 9 1234 5678 si quieres uno igual, funciona muy bien")).toContain("Posible dato personal");
    expect(reviewFlags("Una mierda, se rompió al segundo día de usarlo en la oficina")).toContain("Lenguaje ofensivo");
  });

  it("sin texto es muy corta", () => {
    expect(reviewFlags("")).toEqual(["Muy corta"]);
  });
});
