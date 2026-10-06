/** Datos ficticios propios. Opt-in y guard de URL exacta: jamás producción. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProductIntelligenceExecutor, PERSISTED_INTELLIGENCE_TOOLS } from "./knowledge-service";
import { createContextRepository, contextAccess } from "./repository";
import { parseContextRead } from "./context";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { requestFixture } from "./test-fixtures";
import type { ToolInputs, ToolName } from "./schemas";
import { createProductIntelligenceServer } from "./mcp";
import { graphRecords, graphMutationResult, mutationContext, parseKnowledgeRead } from "./knowledge";
import { prepareResearchMutation } from "./mutations";
import { commandHash } from "./concurrency";

const enabled = process.env.PI_LOCAL_TEST === "1";
const signal = () => AbortSignal.timeout(15000);
describe.runIf(enabled)("PI · conocimiento y estrategia transaccionales en Supabase local", () => {
  let db: SupabaseClient, repository: ReturnType<typeof createContextRepository>, execute: ReturnType<typeof createProductIntelligenceExecutor>;
  let owner: Principal, other: Principal, product: string, image: string;
  const users: string[] = [];
  const mapping: Record<string, string> = {};
  async function checked<T extends { error: unknown }>(request: PromiseLike<T>) {
    const result = await request; if (result.error) throw new Error(`Local fixture: ${JSON.stringify(result.error)}`); return result;
  }
  async function call<K extends ToolName>(tool: K, input: unknown, principal = owner) {
    return parseToolOutput(tool, await execute(principal, { tool, input: parseToolInput(tool, input) } as Parameters<typeof execute>[1], signal()));
  }
  async function revision() { const r = await call("get_product_context", { product_id: product }); if (!r.ok) throw new Error("context"); return r.revision; }
  async function rawRead(principal = owner) { return parseKnowledgeRead((await checked(db.rpc("pi_load_knowledge", { p_access: contextAccess(principal), p_product_id: product }))).data, principal, product); }
  function envelope(rev: number) { return { product_id: product, schema_version: "1.0", expected_revision: rev, idempotency_key: randomUUID() }; }
  async function counts() {
    return Promise.all(["pi_sources", "pi_facts", "pi_fact_evidence", "pi_personas", "pi_angles", "pi_revisions", "pi_audit_events", "pi_idempotency_records", "pi_strategy_versions", "pi_strategy_events"].map(async (table) => (await checked(db.from(table).select("*", { count: "exact", head: true }).eq("product_id", product))).count));
  }
  async function merchant() {
    const password = randomBytes(32).toString("base64url"), email = `pi-knowledge-${randomBytes(8).toString("hex")}@example.test`;
    const created = await checked(db.auth.admin.createUser({ email, password, email_confirm: true }));
    const id = created.data.user!.id; users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id: id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString() }));
    return { principal: { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES } as Principal, email, password };
  }
  let ownerLogin: Awaited<ReturnType<typeof merchant>>;
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    repository = createContextRepository(db);
    execute = createProductIntelligenceExecutor(repository, undefined, "x".repeat(40));
    ownerLogin = await merchant(); owner = ownerLogin.principal; other = (await merchant()).principal;
    product = randomUUID(); image = randomUUID();
    await checked(db.from("products").insert({ id: product, user_id: owner.userId, shopify_product_id: "pi-knowledge-fixture", title: "Catálogo", currency: "CLP" }));
    await checked(db.from("product_reference_images").insert({ id: image, product_id: product, user_id: owner.userId, source: "shopify", url: "https://cdn.shopify.com/pi-knowledge.webp", is_cover: true }));
  }, 20000);
  afterAll(async () => { for (const id of users) await checked(db.auth.admin.deleteUser(id)); }, 20000);

  it("lectura vacía no crea cabeza ni deriva selección de legacy", async () => {
    expect(await revision()).toBe(0);
    expect((await counts()).every((n) => n === 0)).toBe(true);
    const strategy = await call("get_product_strategy", { product_id: product });
    expect(strategy).toMatchObject({ ok: true, data: null, warnings: [{ code: "NO_SELECTED_STRATEGY" }] });
    await expect(call("get_product_context", { product_id: product }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("un snapshot anterior sin knowledge no crea una revisión por cambiar solo formato", async () => {
    const previousProduct = randomUUID();
    await checked(db.from("products").insert({ id: previousProduct, user_id: owner.userId, shopify_product_id: "pi-before-knowledge", title: "Anterior al conocimiento", currency: "CLP" }));
    const raw = await repository.load({ p_access: contextAccess(owner), p_product_id: previousProduct }, signal()) as { snapshot: Record<string, unknown> };
    const snapshot = { ...raw.snapshot }; delete snapshot.knowledge;
    await checked(db.from("product_intelligence").insert({ product_id: previousProduct, user_id: owner.userId }));
    await checked(db.from("pi_revisions").insert({ product_id: previousProduct, user_id: owner.userId, revision: 0, snapshot, snapshot_hash: "a".repeat(64), actor_id: owner.actorId }));
    await checked(db.from("products").update({ title: "Anterior al conocimiento" }).eq("id", previousProduct));
    const after = parseContextRead(await repository.load({ p_access: contextAccess(owner), p_product_id: previousProduct }, signal()));
    expect(after.current_revision).toBe(0);
    const history = (await checked(db.from("pi_revisions").select("snapshot").eq("product_id", previousProduct).eq("revision", 0).single())).data!.snapshot;
    expect(history).not.toHaveProperty("knowledge");
  });
  let researchInput: ToolInputs["save_research"], researchResult: unknown;
  it("research dry_run valida todo y no consume clave ni asigna IDs públicos", async () => {
    researchInput = parseToolInput("save_research", { ...requestFixture("propose-research").payload as object, ...envelope(0) });
    const r = await call("save_research", { ...researchInput, dry_run: true });
    expect(r).toMatchObject({ ok: true, revision: 0, data: { id_map: {}, applied: false } });
    expect((await counts()).every((n) => n === 0)).toBe(true);
  });
  it("research guarda fuentes/hechos/enlaces, revisión y receipt atómicos", async () => {
    const r = await call("save_research", researchInput); researchResult = r;
    if (!r.ok) throw new Error("research"); Object.assign(mapping, r.data.id_map);
    expect(r.revision).toBe(1);
    const read = await rawRead(); expect(read.graph.Fact[0].value.usage_status).toBe("pending");
    expect(read.graph.EvidenceLink[0].value.fact_id).toBe(mapping.compartments_fact);
    expect(read.graph.Source[0].value.retrieved_at).toBe("2026-10-06T15:00:00.000Z");
    expect((await counts()).slice(0, 3)).toEqual([1, 1, 1]);
    expect((await checked(db.from("pi_facts").select("verified_by,verified_at,verification_hash").eq("id", mapping.compartments_fact).single())).data).toEqual({ verified_by: null, verified_at: null, verification_hash: null });
  });
  it("aislamiento impide mutar, leer, reproducir e invocar RPC de otro dueño", async () => {
    await expect(call("save_research", researchInput, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("get_product_strategy", { product_id: product, strategy_id: randomUUID() }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("configuración de producto reutiliza precio y conserva research", async () => {
    const r = await call("save_product_context", { ...envelope(1), context: { display_name: "Organizador", description: "Organizador con tres compartimentos.", base_reference_image_id: image }, pricing: { mode: "recommended", unit_cost_minor: 4000 } });
    expect(r).toMatchObject({ revision: 2 }); expect((await rawRead()).graph.Source).toHaveLength(1);
    expect(await call("save_research", researchInput)).toEqual(researchResult);
    await expect(call("save_research", { ...researchInput, sources: [{ ...researchInput.sources![0], title: "Cambio" }] })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  let analysisInput: ToolInputs["save_product_analysis"];
  it("análisis guarda cuatro personas con entidades y relaciones tipadas", async () => {
    analysisInput = parseToolInput("save_product_analysis", { ...requestFixture("analysis-four-personas").payload as object, ...envelope(2) });
    analysisInput.analysis.angles!.forEach((a) => { if ("client_ref" in a) a.fact_refs = [{ id: mapping.compartments_fact }]; });
    const r = await call("save_product_analysis", analysisInput); if (!r.ok) throw new Error("analysis"); Object.assign(mapping, r.data.id_map);
    expect(r.revision).toBe(3); const read = await rawRead(); expect(read.graph.persona).toHaveLength(4); expect(read.graph.angle).toHaveLength(8);
    expect(read.graph.angle[0].value.jtbd_ids).toHaveLength(1); expect(read.graph.persona.every(({ value }) => value.epistemic_status === "hypothesis")).toBe(true);
    expect((await checked(db.from("pi_angle_jtbd").select("*").eq("product_id", product))).data).toHaveLength(8);
    expect((await checked(db.from("ai_generations").select("*", { count: "exact", head: true }).eq("product_id", product))).count).toBe(0);
  });
  it("merge omitido o [] conserva registros y no incrementa revisión", async () => {
    const r = await call("save_product_analysis", { ...envelope(3), analysis: { personas: [] } });
    expect(r).toMatchObject({ revision: 3, data: { no_op: true } }); expect((await rawRead()).graph.angle).toHaveLength(8);
  });
  it("partial patch cambia un hook, conserva relaciones y captura historia", async () => {
    const r = await call("patch_product_analysis", { ...envelope(3), operations: [{ op: "update", entity: "angle", id: mapping.angle_1_1, changes: { hook: "¿Dónde dejaste ese lápiz?" } }] });
    expect(r).toMatchObject({ revision: 4 });
    const read = await rawRead(); expect(read.graph.angle.find(({ value }) => value.id === mapping.angle_1_1)?.value.hook).toBe("¿Dónde dejaste ese lápiz?");
    const history = await call("get_product_context", { product_id: product, at_revision: 3, include: ["angles"], view: "full" });
    if (!history.ok) throw new Error("history"); expect(history.data.blocks[0].items.some((v) => "hook" in v && v.id === mapping.angle_1_1 && v.hook === "¿Otra vez buscando ese lápiz?")).toBe(true);
  });
  let verificationInput: ToolInputs["save_research"], verificationResult: unknown;
  it("permiso write no verifica; verify exige respaldo y razón", async () => {
    const writeOnly = { ...owner, scopes: owner.scopes.filter((s) => s !== "product_intelligence:verify") };
    await expect(call("save_research", { ...envelope(4), facts: [{ id: mapping.compartments_fact, verification_status: "verified", usage_status: "approved", reason: "Revisé el respaldo" }] }, writeOnly)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await revision()).toBe(4);
    verificationInput = parseToolInput("save_research", { ...envelope(4), facts: [{ id: mapping.compartments_fact, verification_status: "verified", usage_status: "approved", reason: "Revisé el atributo y su fuente" }] });
    const r = await call("save_research", verificationInput); verificationResult = r;
    expect(r).toMatchObject({ revision: 5 });
    const fact = (await checked(db.from("pi_facts").select("verification_hash,verified_by,verified_at").eq("id", mapping.compartments_fact).single())).data;
    expect(fact?.verification_hash).toMatch(/^[a-f0-9]{64}$/); expect(fact?.verified_by).toBe(owner.userId);
    expect(await call("save_research", verificationInput)).toEqual(verificationResult);
    await expect(call("save_research", verificationInput, writeOnly)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("cambiar fuente revisada exige verify y revisión explícita del hecho", async () => {
    const source = { id: mapping.supplier_source, title: "Fuente revisada" };
    await expect(call("save_research", { ...envelope(5), sources: [source] }, { ...owner, scopes: ["product_intelligence:write"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call("save_research", { ...envelope(5), sources: [source] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await revision()).toBe(5);
  });
  function selection(rev: number, action: "select" | "create_draft" = "select") {
    return { ...envelope(rev), based_on_revision: rev, action, primary_persona_id: mapping.persona_1, primary_jtbd_id: mapping.job_1,
      primary_pain_id: mapping.pain_1, primary_angle_id: mapping.angle_1_1, secondary_angle_ids: [mapping.angle_1_2], offer_id: mapping.offer_main,
      positioning: "Organización cotidiana", rationale: "Hipótesis elegida para probar; sin resultados de performance." };
  }
  let selectedId: string;
  it("select congela cierre, conserva hipótesis y no se marca stale por seleccionar", async () => {
    const r = await call("set_product_strategy", selection(5)); if (!r.ok) throw new Error("selection"); selectedId = r.data.strategy!.id;
    expect(r.revision).toBe(6); expect(r.data.strategy).toMatchObject({ state: "selected", analysis_revision: 5, selection_revision: 6, readiness: { stale: false, needs_review: false } });
    expect(r.data.strategy!.snapshot.persona.epistemic_status).toBe("hypothesis");
    const get = await call("get_product_strategy", { product_id: product, include: "execution" }); if (!get.ok) throw new Error("get"); expect(get.data).toEqual(r.data.strategy);
  });
  it("selección idéntica es no-op; draft no sustituye selección", async () => {
    expect(await call("set_product_strategy", selection(6))).toMatchObject({ revision: 6, data: { no_op: true } });
    const draft = await call("set_product_strategy", selection(6, "create_draft"));
    expect(draft).toMatchObject({ revision: 7, data: { active_strategy_id: selectedId, strategy: { state: "draft", readiness: { stale: false, ready_for_execution: false } } } });
    expect((await rawRead()).activeStrategyId).toBe(selectedId);
  });
  it("archivar dependencia seleccionada se rechaza sin efectos parciales", async () => {
    const before = await counts();
    await expect(call("patch_product_analysis", { ...envelope(7), operations: [{ op: "archive", entity: "angle", id: mapping.angle_1_1, reason: "Cambio" }] })).rejects.toMatchObject({ code: "DEPENDENCY_IN_USE" });
    expect(await counts()).toEqual(before);
  });
  it("contradicción nueva se admite con write y restringe hoy una lectura histórica aprobada", async () => {
    const r = await call("save_research", { ...envelope(7), evidence_links: [{ client_ref: "contradiction", fact_ref: { id: mapping.compartments_fact }, source_ref: { id: mapping.supplier_source }, relation: "contradicts", fragment: "tres compartimentos" }] }, { ...owner, scopes: ["product_intelligence:write"] });
    expect(r).toMatchObject({ revision: 8 });
    const get = await call("get_product_strategy", { product_id: product }); expect(get).toMatchObject({ data: { readiness: { needs_review: true } } });
    const history = await call("get_product_context", { product_id: product, at_revision: 6, include: ["facts"], view: "full" });
    if (!history.ok) throw new Error("history"); expect(history.data.current_usage_restrictions[0].fact_id).toBe(mapping.compartments_fact);
    expect(history.data.blocks[0].items[0]).toMatchObject({ verification_status: "verified", usage_status: "approved" });
  });
  it("paginación fija revisión, orden y límites totales; cursor ajeno o alterado se rechaza", async () => {
    const input = { product_id: product, include: ["personas", "angles"], view: "full", page_size: 3 };
    const first = await call("get_product_context", input); if (!first.ok) throw new Error("page");
    expect(first.data.blocks.reduce((n, b) => n + b.items.length, 0)).toBe(3); expect(first.data.next_cursor).toBeTruthy();
    await call("patch_product_analysis", { ...envelope(8), operations: [{ op: "update", entity: "angle", id: mapping.angle_2_1, changes: { hook: "Cambio sin tocar la selección" } }] });
    const next = await call("get_product_context", { ...input, cursor: first.data.next_cursor }); if (!next.ok) throw new Error("page");
    expect(next.revision).toBe(8); expect(next.data.current_revision).toBe(9);
    expect(next.data.blocks.reduce((n, b) => n + b.items.length, 0)).toBe(3);
    await expect(call("get_product_context", { ...input, cursor: first.data.next_cursor, view: "summary" })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    await expect(call("get_product_context", { ...input, cursor: first.data.next_cursor + "x" })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    await expect(call("get_product_context", { ...input, cursor: first.data.next_cursor }, other)).rejects.toMatchObject({ code: "CURSOR_INVALID" });
  });
  it("dos writers de knowledge comparten CAS y una clave concurrente reproduce el resultado", async () => {
    const outcomes = await Promise.allSettled(["A", "B"].map((hook) => call("patch_product_analysis", { ...envelope(9), operations: [{ op: "update", entity: "angle", id: mapping.angle_2_1, changes: { hook } }] })));
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")[0]).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    const input = { ...envelope(10), operations: [{ op: "update", entity: "angle", id: mapping.angle_2_1, changes: { hook: "Una sola escritura" } }] };
    const responses = await Promise.all([call("patch_product_analysis", input), call("patch_product_analysis", input)]);
    expect(responses[0]).toEqual(responses[1]); expect(await revision()).toBe(11);
  });
  it("la RPC verifica scope sensible aunque un caller omita la validación de dominio", async () => {
    const read = await rawRead(); const input = parseToolInput("save_research", { ...envelope(11), facts: [{ id: mapping.compartments_fact, usage_status: "prohibited", reason: "Retirar permiso de uso" }] });
    const prepared = prepareResearchMutation(mutationContext(read, owner, product, randomUUID), input);
    const result = graphMutationResult(read, prepared, product, randomUUID(), mutationContext(read, owner, product, randomUUID).pricing);
    const args = { p_access: contextAccess({ ...owner, scopes: ["product_intelligence:write"] }), p_product_id: product, p_expected_revision: 11, p_stamp: read.stamp,
      p_tool: "save_research", p_key: input.idempotency_key, p_hash: commandHash("save_research", input), p_graph: graphRecords(prepared.graph), p_notes: prepared.methodologicalNotes,
      p_reviewed_ids: [mapping.compartments_fact], p_strategy: null, p_archive: null, p_result: result };
    const before = await counts(); await expect(repository.commitKnowledge(args, signal())).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(await counts()).toEqual(before);
    // Relación inválida revierte incluso cuando el actor tiene todos los permisos.
    const broken = (args.p_graph.EvidenceLink as { fact_id: string; relation: string; last_revision: number }[]).find((link) => link.relation === "contradicts")!;
    broken.fact_id = randomUUID(); broken.last_revision = 12; args.p_access = contextAccess(owner);
    await expect(repository.commitKnowledge(args, signal())).rejects.toMatchObject({ code: "INVALID_REFERENCE" }); expect(await counts()).toEqual(before);
  });
  it("archive limpia selección sin inferir otra y conserva snapshots/eventos", async () => {
    const r = await call("set_product_strategy", { ...envelope(11), action: "archive", strategy_id: selectedId, reason: "Revisar nueva evidencia" });
    expect(r).toMatchObject({ revision: 12, data: { active_strategy_id: null, strategy: { state: "archived" } } });
    expect(await call("get_product_strategy", { product_id: product })).toMatchObject({ data: null });
    const old = await call("get_product_strategy", { product_id: product, strategy_id: selectedId, include: "execution" }); expect(old).toMatchObject({ data: { state: "archived", snapshot: { persona: { epistemic_status: "hypothesis" } } } });
    expect(await call("set_product_strategy", { ...envelope(12), action: "archive", strategy_id: selectedId, reason: "Ya archivada" })).toMatchObject({ revision: 12, data: { no_op: true } });
  });
  it("RLS limita las lecturas al dueño; SQL directo no puede editar versiones ni entidades", async () => {
    expect((await db.from("pi_personas").update({ name: "Writer fuera de RPC" }).eq("product_id", product)).error?.code).toBe("42501");
    expect((await db.from("pi_strategy_versions").update({ created_by: "Otro" }).eq("product_id", product)).error?.code).toBe("42501");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await checked(client.auth.signInWithPassword({ email: ownerLogin.email, password: ownerLogin.password }));
    expect((await checked(client.from("pi_personas").select("id").eq("product_id", product))).data).toHaveLength(4);
    expect((await client.rpc("pi_load_knowledge", { p_access: contextAccess(owner), p_product_id: product })).error?.code).toBe("42501");
  });
  it("SDK MCP descubre siete tools y ejecuta investigación/contexto sin llamar IA", async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const server = createProductIntelligenceServer(owner, execute, { availableTools: PERSISTED_INTELLIGENCE_TOOLS });
    const client = new Client({ name: "pi-knowledge-local", version: "1.0" });
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const listed: string[] = []; let cursor: string | undefined;
      do { const page = await client.listTools(cursor ? { cursor } : undefined); listed.push(...page.tools.map((t) => t.name)); cursor = page.nextCursor; } while (cursor);
      expect(listed).toEqual([...PERSISTED_INTELLIGENCE_TOOLS]);
      const r = await client.callTool({ name: "get_product_context", arguments: { product_id: product, include: ["facts", "research"], view: "full" } });
      expect(r.isError).not.toBe(true); expect(r.structuredContent).toMatchObject({ ok: true, revision: 12 });
    } finally { await client.close(); await server.close(); }
  });
  it("el borrado central bloquea reads/replays/writes y la cascada elimina conocimiento/historia", async () => {
    await checked(db.rpc("pi_begin_product_deletion", { p_user_id: owner.userId, p_product_id: product }));
    await expect(call("get_product_context", { product_id: product })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("save_research", researchInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await checked(db.auth.admin.deleteUser(owner.userId)); users.splice(users.indexOf(owner.userId), 1);
    expect((await counts()).every((n) => n === 0)).toBe(true);
  });
});
