import { describe, expect, it } from "vitest";
import { wallAuthor, wallDate } from "./review-wall";

describe("reseñas aprobadas", () => {
  it("conserva el autor anonimizado y no genera una identidad cuando falta", () => {
    expect(wallAuthor("M***a")).toBe("M***a");
    expect(wallAuthor(undefined)).toBe("Comprador");
    expect(wallAuthor(" ")).toBe("Comprador");
  });
  it("mantiene las fechas originales sin inventarlas", () => {
    expect(wallDate("2026-08-13", "2026")).toEqual({ long: "13 de agosto", short: "13 ago" });
    expect(wallDate("2025-01-02", "2026")).toEqual({ long: "2 de enero de 2025", short: "2 ene 2025" });
    expect(wallDate(undefined, "2026")).toEqual({ long: "", short: "" });
  });
});
