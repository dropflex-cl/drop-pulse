import { describe, expect, it } from "vitest";
import { pdpProofProblems } from "./pdp-proof";
const id = "00000000-0000-4000-8000-000000000001";
describe("prueba de la PDP", () => {
  it("exige un hecho utilizable para las características", () => {
    expect(
      pdpProofProblems("mechanism", { items: [{ fact_id: id }] }, new Map()),
    ).not.toEqual([]);
    expect(
      pdpProofProblems(
        "mechanism",
        { items: [{ fact_id: id }] },
        new Map([[id, "Filtro lavable"]]),
      ),
    ).toEqual([]);
  });
  it("un hecho del producto no autoriza inventar un experto ni su cita", () => {
    const content = {
      fact_id: id,
      name: "Ana Pérez",
      credential: "Especialista",
      quote: "Sigue las instrucciones de uso.",
    };
    expect(
      pdpProofProblems(
        "expert-endorsement",
        content,
        new Map([[id, "Filtro lavable"]]),
      ),
    ).toHaveLength(3);
    expect(
      pdpProofProblems(
        "expert-endorsement",
        content,
        new Map([
          [id, "Ana Pérez · Especialista: Sigue las instrucciones de uso."],
        ]),
      ),
    ).toEqual([]);
  });
  it("un plazo numérico se respalda en el hecho concreto elegido", () => {
    const content = {
      stages: [
        {
          fact_id: id,
          label: "En 30 días",
          title: "Revisa el resultado",
          body: "El resultado depende del uso.",
        },
      ],
    };
    expect(
      pdpProofProblems(
        "results-timeline",
        content,
        new Map([[id, "Uso diario"]]),
      ),
    ).toHaveLength(1);
    expect(
      pdpProofProblems(
        "results-timeline",
        content,
        new Map([[id, "Demostración observada a los 30 días"]]),
      ),
    ).toEqual([]);
  });
});
