// Fixtures ficticias para pruebas del dominio; no usa datos de producción.
import examples from "@/docs/product-intelligence/contracts/examples.json";
import exampleContext from "@/docs/product-intelligence/contracts/generation-context.example.json";
import { emptyGraph, type IntelligenceGraph, type RecordKind } from "./graph";
import { generationContextSchema, strategySchema, type ToolName } from "./schemas";
import type { Principal } from "./policy";
import { PI_SCOPES } from "./policy";

export const contextFixture = () => generationContextSchema.parse(structuredClone(exampleContext));
export const principalFixture = (): Principal => ({ userId: "merchant-a", actorId: "actor-a", actorKind: "merchant", scopes: [...PI_SCOPES] });
export const examplesFixture = examples;
export const strategyFixture = () => strategySchema.parse(structuredClone(examples.responses.find((entry) => entry.name === "selected-execution-context")!.payload.data));
export const requestFixture = (name: string): { tool: ToolName; payload: unknown } => {
  const request = examples.requests.find((entry) => entry.name === name)!;
  return { tool: request.tool as ToolName, payload: structuredClone(request.payload) };
};
export function graphFixture(): IntelligenceGraph {
  const context = contextFixture();
  const graph = emptyGraph();
  const add = <K extends RecordKind>(kind: K, value: IntelligenceGraph[K][number]["value"]) => { graph[kind].push({ userId: "merchant-a", productId: context.product_id, value } as IntelligenceGraph[K][number]); };
  const snapshot = context.strategy;
  add("persona", snapshot.persona); add("jtbd", snapshot.jtbd); add("pain", snapshot.pain);
  snapshot.related_jtbd.forEach((value) => add("jtbd", value));
  snapshot.related_pains.forEach((value) => add("pain", value));
  snapshot.desires.forEach((value) => add("desire", value));
  snapshot.angles.forEach((value) => add("angle", value));
  snapshot.objections.forEach((value) => add("objection", value));
  snapshot.customer_language.forEach((value) => add("customer_language", value));
  snapshot.facts.forEach((value) => add("Fact", value));
  snapshot.sources.forEach((value) => add("Source", value));
  snapshot.evidence_links.forEach((value) => add("EvidenceLink", value));
  if (snapshot.offer) add("offer", snapshot.offer);
  return graph;
}
