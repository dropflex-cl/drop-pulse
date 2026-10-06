import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildStrategySnapshot, validateSnapshotClosure } from "./strategy";
import { contextFixture, graphFixture, requestFixture } from "./test-fixtures";
import { parseToolInput } from "./validation";

function choiceFixture() {
  const choice = parseToolInput("set_product_strategy", requestFixture("strategy-select").payload);
  if (choice.action === "archive") throw new Error("fixture");
  return choice;
}

describe("PI · cierre de estrategia", () => {
  it("congela deseos, objeciones y respaldo sin convertir hipótesis en hechos", () => {
    const graph = graphFixture();
    const snapshot = buildStrategySnapshot(graph, "merchant-a", contextFixture().product_id, choiceFixture());
    expect(snapshot.desires[0].id).toBe(snapshot.angles[0].desire_ids[0]);
    expect(snapshot.sources[0].id).toBe(snapshot.evidence_links[0].source_id);
    expect(snapshot.persona.epistemic_status).toBe("hypothesis");
    graph.desire[0].value.desired_outcome = "Cambio posterior";
    expect(snapshot.desires[0].desired_outcome).not.toBe("Cambio posterior");
    expect(() => validateSnapshotClosure(snapshot)).not.toThrow();
  });
  it("incluye todos los JTBD y dolores referenciados por ángulos secundarios", () => {
    const graph = graphFixture(); const choice = choiceFixture();
    const job = structuredClone(graph.jtbd[0]); job.value.id = randomUUID(); job.value.priority = 2; graph.jtbd.push(job);
    const pain = structuredClone(graph.pain[0]); pain.value.id = randomUUID(); pain.value.priority = 2; graph.pain.push(pain);
    const angle = structuredClone(graph.angle[0]); angle.value.id = randomUUID(); angle.value.priority = 2;
    angle.value.jtbd_ids = [job.value.id]; angle.value.pain_ids = [pain.value.id]; graph.angle.push(angle);
    choice.secondary_angle_ids = [angle.value.id];
    const snapshot = buildStrategySnapshot(graph, "merchant-a", contextFixture().product_id, choice);
    expect(snapshot.related_jtbd.map((row) => row.id)).toEqual([job.value.id]);
    expect(snapshot.related_pains.map((row) => row.id)).toEqual([pain.value.id]);
    expect(snapshot.angles.map((row) => row.id)).toEqual([choice.primary_angle_id, angle.value.id]);
  });
  it("rechaza snapshots incompletos e identidades duplicadas", () => {
    const snapshot = contextFixture().strategy; snapshot.desires = [];
    expect(() => validateSnapshotClosure(snapshot)).toThrow();
    const duplicated = contextFixture().strategy; duplicated.related_jtbd.push(structuredClone(duplicated.jtbd));
    expect(() => validateSnapshotClosure(duplicated)).toThrow("duplicadas");
  });
  it("conserva claims pendientes como restringidos y permite oferta incompleta", () => {
    const graph = graphFixture(); graph.Fact[0].value.verification_status = "unverified"; graph.Fact[0].value.usage_status = "pending";
    const choice = choiceFixture(); choice.offer_id = null;
    const snapshot = buildStrategySnapshot(graph, "merchant-a", contextFixture().product_id, choice);
    expect(snapshot.offer).toBeNull(); expect(snapshot.facts[0].usage_status).toBe("pending");
  });
  it("no acepta grafo de otro dueño ni selección de dependencia archivada", () => {
    const graph = graphFixture(); graph.desire[0].userId = "merchant-b";
    expect(() => buildStrategySnapshot(graph, "merchant-a", contextFixture().product_id, choiceFixture())).toThrow();
    graph.desire[0].userId = "merchant-a"; graph.pain[0].value.lifecycle = "archived";
    expect(() => buildStrategySnapshot(graph, "merchant-a", contextFixture().product_id, choiceFixture())).toThrow();
  });
});
