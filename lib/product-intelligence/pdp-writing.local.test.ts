import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import type { ToolName } from "./schemas";
import fixture from "./fixtures/pdp-writing.json";
import { preparePublish } from "@/lib/pipeline/publish";
import { getEffectiveProductContent } from "@/lib/data/product-content";
import { productMetafields } from "@/lib/shopify/publish/mapping";
import { componentById } from "@/lib/shopify/components/catalog";
import { PREVIEWS } from "@/components/store-preview/registry";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Dirección PDP · contrato a contenido efectivo", () => {
  let db: SupabaseClient, owner: Principal, execute: ReturnType<typeof createProductIntelligenceExecutor>;
  const product = randomUUID();
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) {
    const result = await op;
    if (result.error) throw new Error(JSON.stringify(result.error));
    return result;
  }
  async function call(tool: ToolName, args: Record<string, unknown>) {
    const result = parseToolOutput(tool, await execute(owner, { tool, input: parseToolInput(tool, { product_id: product, ...args }) } as Parameters<typeof execute>[1], AbortSignal.timeout(25000)));
    if (!result.ok) throw result.error;
    return result;
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const user = await checked(db.auth.admin.createUser({ email: `pdp-writing-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }));
    owner = { userId: user.data.user!.id, actorId: user.data.user!.id, actorKind: "merchant", scopes: PI_SCOPES };
    execute = createProductIntelligenceExecutor(createContextRepository(db));
    await checked(db.from("merchant_settings").insert({ user_id: owner.userId, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", free_shipping: true, market_confirmed_at: new Date().toISOString() }));
    await checked(db.from("products").insert({ id: product, user_id: owner.userId, title: "POC local", shopify_product_id: product, currency: "CLP" }));
    await call("save_product_context", { schema_version: "1.0", context: { display_name: "Tónico de la POC", description: "Fixture editorial de un tónico con gotero." }, pricing: { mode: "manual", unit_cost_minor: 4000, sale_price_minor: 29990, compare_at_price_minor: 38990 } });
  }, 30000);
  afterAll(async () => { if (owner) await checked(db.auth.admin.deleteUser(owner.userId)); }, 20000);

  it("descubre contratos y guarda la POC conservando sus textos en preview y payload, sin generar ni publicar", async () => {
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    for (const row of fixture.rows) {
      const response = await call("get_component_generation_context", { component: row.component });
      const context = response.data as { component: { schema: object; argument_job: string }; instructions: string[] };
      const validate = ajv.compile(context.component.schema);
      expect(validate(row.content), `${row.component}: ${JSON.stringify(validate.errors)}`).toBe(true);
      if (row.component === "benefit-usps") expect(context.component.argument_job).toContain("condiciones vigentes");
    }
    await call("save_landing_content", { schema_version: "1.1", entries: fixture.rows });
    const prepared = await preparePublish(owner.userId, product);
    const page = await getEffectiveProductContent(owner.userId, product);
    expect(page.input).toEqual(prepared.input);
    expect(prepared.input.listing).toMatchObject(fixture.rows.find(row => row.component === "listing")!.content);
    const payload = productMetafields(prepared.input, new Map());
    for (const row of fixture.rows.filter(row => row.component !== "listing")) {
      const component = prepared.input.components.find(component => component.id === row.component)!;
      expect(component.content).toEqual(row.content);
      const metafield = payload.set.find(field => field.key === componentById(row.component)!.metafield!.key)!;
      expect(JSON.parse(metafield.value)).toEqual(row.content);
      if (["pain-block", "mechanism", "usage-steps"].includes(row.component)) {
        const html = renderToStaticMarkup(createElement(PREVIEWS[row.component], { content: component.content, facts: page.facts, images: {} }));
        expect(html).toContain(row.content.heading);
      }
    }
    expect((await checked(db.from("ai_generations").select("id").eq("product_id", product))).data).toEqual([]);
    expect((await checked(db.from("product_publications").select("product_id").eq("product_id", product))).data).toEqual([]);
  }, 30000);
});
