import { describe, expect, it } from "vitest";
import { avatarStamp, differentiatorStamp, staleReasons, type CopyContextStamp } from "./stale";

const briefs = [{ id: "b1", edited_at: null }];
const diff = differentiatorStamp({ versus: "cremas", claim: "resuelve la piel tirante", basis: "x" });
const context: CopyContextStamp = { avatar: avatarStamp({ id: "a1", edited_at: null }), brief: "f1", differentiator: diff, prompt_version: 6 };
const current = { briefs, avatar: context.avatar, context: { brief: "f1", differentiator: diff, prompt_version: 6 } };

describe("staleReasons", () => {
  it("nada cambió", () => {
    expect(staleReasons([{ avatar_id: "a1", briefs, context }], current)).toEqual([]);
  });

  it("junta lo que cambió en cualquiera de las escrituras de la página, en orden", () => {
    const older = { ...context, prompt_version: 5, differentiator: null };
    expect(staleReasons([{ avatar_id: "a1", briefs, context }, { avatar_id: "a1", briefs: [{ id: "b0", edited_at: null }], context: older }], current)).toEqual([
      "angles",
      "differentiator",
      "prompt",
    ]);
  });

  it("la ficha y el cliente ideal editado", () => {
    const now = { ...current, avatar: avatarStamp({ id: "a1", edited_at: "2026-09-25" }), context: { ...current.context, brief: "f2" } };
    expect(staleReasons([{ avatar_id: "a1", briefs, context }], now)).toEqual(["avatar", "brief"]);
  });

  it("sin cliente ideal aprobado hoy no lo compara", () => {
    expect(staleReasons([{ avatar_id: "a1", briefs, context }], { ...current, avatar: null })).toEqual([]);
  });

  it("una escritura de antes de la huella: la forma de escribir cambió y, si hay diferenciador, también", () => {
    expect(staleReasons([{ avatar_id: "a1", briefs }], current)).toEqual(["differentiator", "prompt"]);
    expect(staleReasons([{ avatar_id: "a0", briefs }], { ...current, context: { ...current.context, differentiator: null } })).toEqual(["avatar", "prompt"]);
  });
});
