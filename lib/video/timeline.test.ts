import { describe, expect, it } from "vitest";
import type { UgcScript } from "./schemas";
import { scriptTimeline } from "./timeline";

const script = {
  a_roll: [
    { key: "A1", keyframe: "K1", seconds: 6, line: "¿Te maquillas en siete minutos?", delivery: "", acting: "", motion: "" },
    { key: "A2", keyframe: "K2", seconds: 5, line: "Tres gotas y listo.", delivery: "", acting: "", motion: "" },
  ],
  b_roll: [
    { key: "B1", keyframe: "K3", anchor: "Gotas", cut_s: 1.8, motion: "" },
    { key: "B2", keyframe: "K4", anchor: "minutos", cut_s: 1.2, motion: "" },
    { key: "B3", keyframe: "K4", anchor: "nada", cut_s: 1, motion: "" },
  ],
  text_beats: [
    { anchor: "minutos", until: null, text: "¿7 MIN?" },
    { anchor: "gotas", until: null, text: "3 GOTAS" },
    { anchor: "ninguna", until: null, text: "OFERTA" },
  ],
} as unknown as UgcScript;

describe("scriptTimeline", () => {
  it("pone cada inserto después de la toma hablada que dice su palabra, sin tildes ni mayúsculas", () => {
    expect(scriptTimeline(script).map((t) => `${t.n}:${t.key}`)).toEqual(["1:A1", "2:B2", "3:A2", "4:B1", "5:B3"]);
  });

  it("suma los segundos de las habladas y reparte los textos en pantalla", () => {
    const [a1, , a2] = scriptTimeline(script);
    expect([a1.start, a1.seconds, a2.start]).toEqual([0, 6, 6]);
    expect(a1.beats).toEqual([0]);
    expect(a2.beats).toEqual([1, 2]);
  });
});
