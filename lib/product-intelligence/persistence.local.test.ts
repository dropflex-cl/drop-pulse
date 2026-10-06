/** Opt-in. Nunca usa el proyecto remoto: fixtures propios en 127.0.0.1:55321. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createContextRepository, contextAccess } from "./repository";
import { createContextExecutor } from "./service";
import { createProductIntelligenceExecutor, PERSISTED_INTELLIGENCE_TOOLS } from "./knowledge-service";
import { requestFixture } from "./test-fixtures";
import { parseToolInput, parseToolOutput } from "./validation";
import { parseContextRead, prepareProductContext } from "./context";
import { commandHash } from "./concurrency";
import { PI_SCOPES, type Principal } from "./policy";
import { createMcpAuthenticator, type McpAuthentication, type McpConfiguration } from "./oauth";
import { createMcpHttpHandler } from "./http";
import { savePricingPlan } from "@/lib/pricing/store";
import type { ToolInputs } from "./schemas";

const enabled = process.env.PI_LOCAL_TEST === "1";
const signal = () => AbortSignal.timeout(10000);
describe.runIf(enabled)("PI · transacciones reales en Supabase local", () => {
  let db: SupabaseClient, repository: ReturnType<typeof createContextRepository>, execute: ReturnType<typeof createContextExecutor>;
  let owner: Principal, other: Principal, productId: string, otherProductId: string, imageId: string, otherImageId: string;
  const users: string[] = [], clients: string[] = [];
  async function checked<T extends { error: unknown }>(request: PromiseLike<T>) {
    const result = await request;
    if (result.error) throw new Error(`Falló la operación local: ${(result.error as { code?: string }).code ?? "unknown"}`);
    return result;
  }
  async function rpc(name: string, args: Record<string, unknown>) { return (await checked(db.rpc(name, args))).data; }
  async function merchant() {
    const password = randomBytes(32).toString("base64url"), email = `pi-context-${randomBytes(8).toString("hex")}@example.test`;
    const created = await checked(db.auth.admin.createUser({ email, password, email_confirm: true }));
    const id = created.data.user!.id; users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id: id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" }));
    return { principal: { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES } as Principal, email, password };
  }
  let ownerLogin: Awaited<ReturnType<typeof merchant>>;
  async function read(principal = owner, at_revision?: number) {
    const result = parseToolOutput("get_product_context", await execute(principal, { tool: "get_product_context", input: parseToolInput("get_product_context", { product_id: productId, ...(at_revision === undefined ? {} : { at_revision }) }) }, signal()));
    if (!result.ok) throw new Error("Respuesta inválida"); return result;
  }
  function input(revision: number, key = randomUUID()): ToolInputs["save_product_context"] {
    return parseToolInput("save_product_context", { product_id: productId, schema_version: "1.0", expected_revision: revision, idempotency_key: key,
      context: { display_name: "Producto explícito", description: "Descripción del comerciante", supplier_text: "Texto proveedor" },
      pricing: { mode: "recommended", unit_cost_minor: 4000 } });
  }
  async function save(request: ToolInputs["save_product_context"], principal = owner) {
    const result = parseToolOutput("save_product_context", await execute(principal, { tool: "save_product_context", input: request }, signal()));
    if (!result.ok) throw new Error("Respuesta inválida"); return result;
  }
  async function count(table: string) {
    const result = await checked(db.from(table).select("*", { count: "exact", head: true }).eq("product_id", productId)); return result.count;
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    repository = createContextRepository(db); execute = createContextExecutor(repository);
    ownerLogin = await merchant(); owner = ownerLogin.principal; other = (await merchant()).principal;
    productId = randomUUID(); otherProductId = randomUUID(); imageId = randomUUID(); otherImageId = randomUUID();
    await checked(db.from("products").insert([
      { id: productId, user_id: owner.userId, shopify_product_id: "pi-local-1", title: "Catálogo conservado", currency: "CLP" },
      { id: otherProductId, user_id: other.userId, shopify_product_id: "pi-local-2", title: "Otro tenant", currency: "CLP" },
    ]));
    await checked(db.from("product_reference_images").insert([
      { id: imageId, product_id: productId, user_id: owner.userId, source: "shopify", url: "https://cdn.shopify.com/pi-fixture.webp", is_cover: true },
      { id: otherImageId, product_id: otherProductId, user_id: other.userId, source: "shopify", url: "https://cdn.shopify.com/pi-other.webp", is_cover: true },
    ]));
  }, 20000);
  afterAll(async () => {
    for (const clientId of clients) await checked(db.auth.admin.oauth.deleteClient(clientId));
    for (const userId of users) await checked(db.auth.admin.deleteUser(userId));
  }, 20000);

  it("revisión cero no importa análisis viejo ni crea filas al leer", async () => {
    const result = await read(); expect(result.revision).toBe(0); expect(result.data.product.context).toBeNull();
    expect(await count("product_intelligence")).toBe(0);
    await expect(read(other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("dry_run no crea cabeza, snapshot, precio, audit ni receipt", async () => {
    expect(await save({ ...input(0), dry_run: true })).toMatchObject({ revision: 0, data: { applied: false, no_op: false } });
    for (const table of ["product_intelligence", "pi_revisions", "pi_audit_events", "pi_idempotency_records", "product_pricing"]) expect(await count(table)).toBe(0);
  });
  let initialInput: ToolInputs["save_product_context"], initialResult: Awaited<ReturnType<typeof save>>;
  it("confirma contexto, precio, snapshot y receipt en una sola transacción", async () => {
    initialInput = input(0); initialResult = await save(initialInput);
    expect(initialResult.revision).toBe(1);
    const result = await read(); expect(result.data.product.context?.display_name).toBe("Producto explícito");
    expect(result.data.product.catalog_title).toBe("Catálogo conservado");
    expect(result.data.product.pricing?.packs).toHaveLength(3);
    expect(result.data.product.pricing).toEqual(initialResult.data.pricing);
    expect(await count("pi_revisions")).toBe(2); expect(await count("pi_audit_events")).toBe(1); expect(await count("pi_idempotency_records")).toBe(1);
    expect((await checked(db.from("products").select("price").eq("id", productId).single())).data?.price).toBe(0);
    expect(await count("ai_generations")).toBe(0);
  });
  it("no-op conserva revisión y registra receipt sin audit extra", async () => {
    expect(await save(input(1))).toMatchObject({ revision: 1, data: { no_op: true, applied: false } });
    expect(await count("pi_revisions")).toBe(2); expect(await count("pi_audit_events")).toBe(1);
  });
  it("historia y audit son inmutables incluso para un writer de servidor", async () => {
    expect((await db.from("pi_revisions").update({ snapshot_hash: "b".repeat(64) }).eq("product_id", productId)).error?.message).toBe("PI_VALIDATION_ERROR");
    expect((await db.from("pi_audit_events").delete().eq("product_id", productId)).error?.message).toBe("PI_VALIDATION_ERROR");
    expect((await read(owner, 1)).data.product.context?.display_name).toBe("Producto explícito");
  });
  it("CAS concurrente permite exactamente un escritor", async () => {
    const outcomes = await Promise.allSettled(["A", "B"].map((description) => save({ ...input(1), context: { description } })));
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "REVISION_CONFLICT" }); expect((await read()).revision).toBe(2);
  });
  it("replay devuelve resultado original antes de CAS aunque avanzó la revisión", async () => {
    expect(await save(initialInput)).toEqual(initialResult);
    await expect(save({ ...initialInput, context: { description: "Otra solicitud" } })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect((await read()).revision).toBe(2);
  });
  it("dos llamadas simultáneas con la misma clave confirman un único cambio", async () => {
    const request = { ...input(2), context: { description: "Idempotente" } };
    const results = await Promise.all([save(request), save(request)]);
    expect(results[0]).toEqual(results[1]); expect((await read()).revision).toBe(3);
  });
  it("una falla de constraint revierte contexto, head, audit y receipt", async () => {
    const request = { ...input(3), context: { description: "No debe guardarse" } };
    const loaded = parseContextRead(await repository.load({ p_access: contextAccess(owner), p_product_id: productId }, signal()));
    const prepared = prepareProductContext(loaded, request, randomUUID());
    const counts = await Promise.all([count("pi_revisions"), count("pi_audit_events"), count("pi_idempotency_records")]);
    await expect(repository.commit({ p_access: contextAccess(owner), p_product_id: productId, p_expected_revision: 3, p_stamp: loaded.stamp,
      p_key: request.idempotency_key, p_hash: commandHash("save_product_context", request), p_context: prepared.context,
      p_pricing: { ...prepared.pricing, currency: "CLP", unit_cost: -1 }, p_base_image: null, p_result: prepared.result, p_dry_run: false }, signal())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await Promise.all([count("pi_revisions"), count("pi_audit_events"), count("pi_idempotency_records")])).toEqual(counts);
    expect((await read()).data.product.context?.description).toBe("Idempotente"); expect((await read()).revision).toBe(3);
  });
  it("imagen ajena se rechaza, elegir la propia reactiva y comparte base con UI", async () => {
    await expect(save({ ...input(3), context: { base_reference_image_id: otherImageId } })).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await checked(db.from("product_reference_images").update({ excluded: true }).eq("id", imageId));
    expect((await read()).revision).toBe(4);
    await save({ ...input(4), context: { base_reference_image_id: imageId } });
    const image = (await checked(db.from("product_reference_images").select("is_base,excluded").eq("id", imageId).single())).data;
    expect(image).toEqual({ is_base: true, excluded: false }); expect((await read()).revision).toBe(5);
    await save({ ...input(5), context: { base_reference_image_id: null } });
    expect((await checked(db.from("product_reference_images").select("is_base").eq("id", imageId).single())).data?.is_base).toBe(false);
    expect((await read()).revision).toBe(6);
  });
  it("Precio y packs de UI usa el mismo comando, invalida CAS y conserva historia", async () => {
    const current = (await read()).data.product.pricing!;
    const result = await savePricingPlan(owner.userId, { id: productId, currency: "CLP" }, {
      unitCost: 4500, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75,
      salePrice: current.sale_price_minor, compareAtPrice: current.compare_at_price_minor, extraUnitDiscount: 50,
    }, current.pricing_stamp);
    expect(result?.unitCost).toBe(4500); expect((await read()).revision).toBe(7);
    await expect(savePricingPlan(owner.userId, { id: productId, currency: "CLP" }, {
      unitCost: 4000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75,
      salePrice: current.sale_price_minor, compareAtPrice: current.compare_at_price_minor, extraUnitDiscount: 50,
    }, current.pricing_stamp)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await read()).data.product.pricing?.unit_cost_minor).toBe(4500);
    await expect(save(input(6))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await read(owner, 1)).data.product.pricing?.unit_cost_minor).toBe(4000);
    expect((await read(owner, 0)).data.product.context).toBeNull();
  });
  it("cambios operacionales sin pasar por MCP también generan snapshot consistente", async () => {
    await checked(db.from("products").update({ title: "Catálogo actualizado" }).eq("id", productId));
    expect((await read()).revision).toBe(8);
    await checked(db.from("merchant_settings").update({ return_days: 30 }).eq("user_id", owner.userId));
    expect((await read()).revision).toBe(9); expect((await read()).data.product.policies.returns).toBe("30 días");
    expect((await read(owner, 1)).data.product.policies.returns).toBeNull();
    const before = await read();
    await checked(db.from("merchant_settings").update({ updated_at: new Date().toISOString() }).eq("user_id", owner.userId));
    expect((await read()).revision).toBe(before.revision);
  });

  let auth: McpAuthentication, bearer: string, nativeResearch: ToolInputs["save_research"], nativePackLabels: ToolInputs["save_pack_labels"];
  const config: McpConfiguration = { resourceUrl: "http://localhost:3000/api/mcp", issuer: "http://127.0.0.1:55321/auth/v1", jwksUrl: "http://127.0.0.1:55321/auth/v1/.well-known/jwks.json", allowedOrigins: ["http://localhost:3000"] };
  async function live(identity: McpAuthentication["identity"]) {
    return rpc("pi_check_oauth_grant", { p_user_id: identity.userId, p_client_id: identity.clientId, p_session_id: identity.sessionId,
      p_token_session_id: identity.tokenSessionId, p_version: identity.grantVersion, p_resource_url: identity.resourceUrl });
  }
  it("OAuth nativo + SDK HTTP recuperan y guardan contexto persistente", async () => {
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!; expect(publicKey).toBeTruthy();
    const merchantClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await checked(merchantClient.auth.signInWithPassword({ email: ownerLogin.email, password: ownerLogin.password }));
    const registered = await checked(db.auth.admin.oauth.createClient({ client_name: "PI persistencia local", redirect_uris: ["http://localhost:3000/pi-test-callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "email offline_access" }));
    const clientId = registered.data!.client_id; clients.push(clientId);
    const verifier = randomBytes(32).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url");
    const response = await fetch(`${config.issuer}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId,
      redirect_uri: "http://localhost:3000/pi-test-callback", scope: "email offline_access", resource: config.resourceUrl,
      code_challenge: challenge, code_challenge_method: "S256", prompt: "consent" })}`, { redirect: "manual", headers: { Authorization: `Bearer ${login.data.session!.access_token}` } });
    expect(response.status).toBe(302);
    const authorizationId = new URL(response.headers.get("location")!).searchParams.get("authorization_id")!;
    await checked(merchantClient.auth.oauth.getAuthorizationDetails(authorizationId));
    await rpc("pi_prepare_oauth_grant", { p_user_id: owner.userId, p_client_id: clientId, p_authorization_id: authorizationId, p_resource_url: config.resourceUrl, p_scopes: PI_SCOPES });
    const consent = await checked(merchantClient.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }));
    await rpc("pi_activate_oauth_grant", { p_user_id: owner.userId, p_client_id: clientId, p_authorization_id: authorizationId });
    const tokenResponse = await fetch(`${config.issuer}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: new URL(consent.data!.redirect_url).searchParams.get("code")!,
        code_verifier: verifier, redirect_uri: "http://localhost:3000/pi-test-callback", resource: config.resourceUrl }) });
    expect(tokenResponse.ok).toBe(true); bearer = (await tokenResponse.json()).access_token;
    const authenticate = createMcpAuthenticator(config, live);
    auth = await authenticate(new Request(config.resourceUrl, { headers: { Authorization: `Bearer ${bearer}` } }));
    const handler = createMcpHttpHandler(config, authenticate, execute, { availableTools: PERSISTED_INTELLIGENCE_TOOLS, executorForAuthentication: (session) => createProductIntelligenceExecutor(repository, session.identity) });
    const client = new Client({ name: "pi-real-persistence", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(config.resourceUrl), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } }, fetch: async (url, init) => handler(new Request(url, init)) }));
      const listed: string[] = []; let cursor: string | undefined;
      do { const page = await client.listTools(cursor ? { cursor } : undefined); listed.push(...page.tools.map((tool) => tool.name)); cursor = page.nextCursor; } while (cursor);
      expect(listed).toEqual(PERSISTED_INTELLIGENCE_TOOLS);
      const found = parseToolOutput("get_product_context", (await client.callTool({ name: "get_product_context", arguments: { product_id: productId } })).structuredContent);
      expect(found).toMatchObject({ ok: true, revision: 9 });
      const expired = createContextExecutor(repository, { ...auth.identity, tokenExpiresAt: Math.floor(Date.now() / 1000) - 1 });
      await expect(expired(auth.principal, { tool: "get_product_context", input: parseToolInput("get_product_context", { product_id: productId }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      const metrics = parseToolOutput("get_product_context", (await client.callTool({ name: "get_product_context", arguments: { product_id: productId, include: ["performance"] } })).structuredContent);
      expect(metrics.ok && metrics.data.blocks[0].availability).toBe("unknown");
      await checked(db.from("pi_access_grants").update({ scopes: ["product_intelligence:read", "product_intelligence:write"] }).eq("user_id", owner.userId).eq("client_id", clientId));
      await expect(createContextExecutor(repository, auth.identity)(auth.principal, { tool: "get_product_context", input: parseToolInput("get_product_context", { product_id: productId, include: ["performance"] }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await checked(db.from("pi_access_grants").update({ scopes: [...PI_SCOPES] }).eq("user_id", owner.userId).eq("client_id", clientId));
      const request = { ...input(9), context: { description: "Guardado desde SDK MCP" } };
      const saved = parseToolOutput("save_product_context", (await client.callTool({ name: "save_product_context", arguments: request })).structuredContent);
      expect(saved).toMatchObject({ ok: true, revision: 10 });
      expect((await read()).data.product.context?.description).toBe("Guardado desde SDK MCP");
      expect((await client.callTool({ name: "save_product_context", arguments: request })).structuredContent).toEqual(saved);
      const strategy = await client.callTool({ name: "get_product_strategy", arguments: { product_id: productId } });
      expect(strategy.structuredContent).toMatchObject({ ok: true, data: null });
      nativeResearch = parseToolInput("save_research", { ...requestFixture("propose-research").payload as object, product_id: productId, expected_revision: 10, idempotency_key: randomUUID() });
      const research = await client.callTool({ name: "save_research", arguments: nativeResearch });
      expect(research.structuredContent).toMatchObject({ ok: true, revision: 11 });
      expect((await client.callTool({ name: "save_research", arguments: nativeResearch })).structuredContent).toEqual(research.structuredContent);
      const expiredKnowledge = createProductIntelligenceExecutor(repository, { ...auth.identity, tokenExpiresAt: Math.floor(Date.now() / 1000) - 1 });
      await expect(expiredKnowledge(auth.principal, { tool: "save_research", input: nativeResearch }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      const landing = parseToolOutput("get_landing_content", (await client.callTool({ name: "get_landing_content", arguments: { product_id: productId } })).structuredContent);
      if (!landing.ok) throw new Error("landing read");
      const landingRequest = { product_id: productId, schema_version: "1.0", expected_revision: landing.revision, expected_landing_etag: landing.data.landing_etag,
        idempotency_key: randomUUID(), entries: [{ component: "listing", content: { title: "Organizador para tu escritorio", short_name: "Organizador",
          short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.", offer_line: "Organiza tu escritorio · Paga al recibir",
          seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." } }] };
      const landed = await client.callTool({ name: "save_landing_content", arguments: landingRequest });
      expect(parseToolOutput("save_landing_content", landed.structuredContent)).toMatchObject({ ok: true, revision: 11, data: { applied: true } });
      expect((await client.callTool({ name: "save_landing_content", arguments: landingRequest })).structuredContent).toEqual(landed.structuredContent);
      const packs = parseToolOutput("get_pack_labels", (await client.callTool({ name: "get_pack_labels", arguments: { product_id: productId } })).structuredContent);
      if (!packs.ok) throw new Error("packs read");
      nativePackLabels = parseToolInput("save_pack_labels", { product_id: productId, schema_version: "1.0", expected_revision: packs.revision,
        expected_pack_labels_etag: packs.data.pack_labels_etag, idempotency_key: randomUUID(), labels: [1, 2, 3].map((units) => ({ units,
          label: units === 1 ? "Uno para ti" : "Para compartir", support: null, badge: null, basis: "sharing", reason: "Unidades para compartir." })) });
      const packed = await client.callTool({ name: "save_pack_labels", arguments: nativePackLabels });
      expect(packed.structuredContent).toMatchObject({ ok: true, revision: 12, data: { status: "generated" } });
      expect((await client.callTool({ name: "save_pack_labels", arguments: nativePackLabels })).structuredContent).toEqual(packed.structuredContent);
      await expect(expiredKnowledge(auth.principal, { tool: "save_pack_labels", input: nativePackLabels }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(expiredKnowledge(auth.principal, { tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: productId }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await client.close(); }
  }, 20000);
  it("revocar después de autenticar bloquea lectura, replay y commit dentro del dominio", async () => {
    const delegated = createContextExecutor(repository, auth.identity);
    const request = { ...input(12), context: { description: "Revoke race" } };
    const loaded = await repository.load({ p_access: contextAccess(auth.principal, auth.identity), p_product_id: productId }, signal());
    expect(parseContextRead(loaded).revision).toBe(12);
    await rpc("pi_revoke_oauth_grant", { p_user_id: owner.userId, p_client_id: auth.identity.clientId });
    await expect(delegated(auth.principal, { tool: "save_product_context", input: request }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(delegated(auth.principal, { tool: "save_product_context", input: initialInput }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(delegated(auth.principal, { tool: "get_product_context", input: parseToolInput("get_product_context", { product_id: productId }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const candidate = prepareProductContext(parseContextRead(loaded), request, randomUUID());
    await expect(repository.commit({ p_access: contextAccess(auth.principal, auth.identity), p_product_id: productId, p_expected_revision: 12,
      p_stamp: parseContextRead(loaded).stamp, p_key: request.idempotency_key, p_hash: commandHash("save_product_context", request), p_context: candidate.context,
      p_pricing: candidate.pricing, p_base_image: null, p_result: candidate.result, p_dry_run: false }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const knowledge = createProductIntelligenceExecutor(repository, auth.identity);
    await expect(knowledge(auth.principal, { tool: "get_pack_labels", input: { product_id: productId } }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(knowledge(auth.principal, { tool: "save_pack_labels", input: nativePackLabels }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(knowledge(auth.principal, { tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: productId }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(knowledge(auth.principal, { tool: "save_research", input: nativeResearch }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(knowledge(auth.principal, { tool: "get_product_context", input: parseToolInput("get_product_context", { product_id: productId }) }, signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await read()).revision).toBe(12);
  });
  it("RLS/ACL impiden leer receipts o ejecutar RPC desde una sesión SaaS", async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await checked(client.auth.signInWithPassword({ email: ownerLogin.email, password: ownerLogin.password }));
    const head = await checked(client.from("product_intelligence").select("product_id,user_id"));
    expect(head.data).toEqual([{ product_id: productId, user_id: owner.userId }]);
    expect((await client.from("pi_idempotency_records").select("*")).error?.code).toBe("42501");
    expect((await client.rpc("pi_load_context", { p_access: contextAccess(owner), p_product_id: productId })).error?.code).toBe("42501");
  });
  it("borrado en curso bloquea nuevos cambios; borrar dueño elimina todo el agregado", async () => {
    await rpc("pi_begin_product_deletion", { p_user_id: owner.userId, p_product_id: productId });
    await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(save(initialInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await checked(db.auth.admin.deleteUser(owner.userId)); users.splice(users.indexOf(owner.userId), 1);
    for (const table of ["product_intelligence", "pi_product_inputs", "pi_revisions", "pi_audit_events", "pi_idempotency_records", "product_pricing"]) expect(await count(table)).toBe(0);
  });
});
