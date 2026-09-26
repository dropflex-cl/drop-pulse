import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEM_MARKS, INITIALS, MASC_MARKS, MEN, MONTHS, SHORT_MONTHS, WOMEN, wallAuthor, wallCounters, wallDate } from "./review-wall";

const LIQUID = readFileSync(join(__dirname, "../shopify/components/review-wall/sections/df-review-wall.liquid"), "utf8");

/** La lista de un `assign <name> = '…' | split: '|'` del Liquid. */
function liquidList(name: string): string[] {
  const m = LIQUID.match(new RegExp(`assign ${name} = '([^']*)' \\| split: '\\|'`));
  if (!m) throw new Error(`df-review-wall.liquid no tiene la lista ${name}`);
  return m[1].split("|");
}

describe("review-wall: espejo del Liquid", () => {
  it("las listas son las mismas que en la sección", () => {
    expect(WOMEN).toEqual(liquidList("women"));
    expect(MEN).toEqual(liquidList("men"));
    expect(INITIALS).toEqual(liquidList("initials"));
    expect(FEM_MARKS).toEqual(liquidList("fem_marks"));
    expect(MASC_MARKS).toEqual(liquidList("masc_marks"));
    expect(MONTHS).toEqual(liquidList("months"));
    expect(SHORT_MONTHS).toEqual(liquidList("short_months"));
  });

  it("50 nombres por lista: el índice (ri × 37 + semilla) % 50 no repite en 30 reseñas", () => {
    expect(WOMEN).toHaveLength(50);
    expect(MEN).toHaveLength(50);
    const names = Array.from({ length: 30 }, (_, ri) => wallAuthor("", ri, 4121).split(" ")[0]);
    expect(new Set(names).size).toBe(30);
  });
});

describe("wallAuthor", () => {
  it("el texto decide la lista: nadie llamado Juan escribe «quedé encantada»", () => {
    for (let ri = 0; ri < 10; ri++) {
      expect(WOMEN).toContain(wallAuthor("Quedé encantada, llegó rápido.", ri, 17).split(" ")[0]);
      expect(MEN).toContain(wallAuthor("Se lo regalé a mi esposa y le gustó", ri, 17).split(" ")[0]);
    }
  });

  it("siempre el mismo nombre para la misma reseña y producto, con una inicial", () => {
    expect(wallAuthor("Muy bueno", 3, 88)).toBe(wallAuthor("Muy bueno", 3, 88));
    expect(wallAuthor("Muy bueno", 3, 88)).toMatch(/^\p{L}+ [A-Z]\.$/u);
  });
});

describe("wallDate", () => {
  it("como Facebook: sin año si es de este año; corta para la tarjeta angosta", () => {
    expect(wallDate("2026-08-13", "2026")).toEqual({ long: "13 de agosto", short: "13 ago" });
    expect(wallDate("2025-01-02", "2026")).toEqual({ long: "2 de enero de 2025", short: "2 ene 2025" });
  });

  it("vacía si la fecha no sirve", () => {
    const empty = { long: "", short: "" };
    expect(wallDate(undefined, "2026")).toEqual(empty);
    expect(wallDate("ago 2026", "2026")).toEqual(empty);
    expect(wallDate("2026-13-01", "2026")).toEqual(empty);
  });
});

describe("wallCounters", () => {
  it("en rango y con la abreviatura de Facebook", () => {
    for (let ri = 0; ri < 30; ri++) {
      const { reactions, comments } = wallCounters(ri, 5000);
      expect(reactions).toMatch(/^(\d{3}|\d(,\d)? mil)$/);
      expect(comments).toBeGreaterThanOrEqual(8);
      expect(comments).toBeLessThanOrEqual(46);
    }
    expect(wallCounters(0, 0)).toEqual({ reactions: "320", comments: 8 });
    expect(wallCounters(0, 680)).toEqual({ reactions: "1 mil", comments: 25 });
    expect(wallCounters(0, 930)).toEqual({ reactions: "1,2 mil", comments: 41 });
  });
});
