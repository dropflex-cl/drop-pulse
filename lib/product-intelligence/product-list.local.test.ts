/** Opt-in: datos propios y Supabase local; no llama proveedores. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createContextRepository, contextAccess } from "./repository";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("PI · listado real de productos", () => {
  let db: SupabaseClient, repository: ReturnType<typeof createContextRepository>, execute: ReturnType<typeof createProductIntelligenceExecutor>;
  let owner: Principal, other: Principal;
  const users: string[] = [], ids = Array.from({ length: 6 }, () => randomUUID()).sort();
  async function checked<T extends { error: unknown }>(request: PromiseLike<T>) {
    const result = await request;
    if (result.error) throw new Error(`Error local: ${(result.error as { code?: string }).code}`);
    return result;
  }
  async function list(input: unknown = {}, principal = owner) {
    const result = parseToolOutput("list_products", await execute(principal, { tool: "list_products", input: parseToolInput("list_products", input) }, AbortSignal.timeout(10000)));
    if (!result.ok) throw new Error("Respuesta inválida");
    return result.data;
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    repository = createContextRepository(db); execute = createProductIntelligenceExecutor(repository);
    for (let index = 0; index < 2; index++) {
      const created = await checked(db.auth.admin.createUser({ email: `pi-list-${randomUUID()}@example.test`, email_confirm: true }));
      users.push(created.data.user!.id);
    }
    owner = { userId: users[0], actorId: users[0], actorKind: "merchant", scopes: PI_SCOPES };
    other = { userId: users[1], actorId: users[1], actorKind: "merchant", scopes: PI_SCOPES };
    await checked(db.from("products").insert(ids.map((id, index) => ({ id, user_id: index === 5 ? other.userId : owner.userId,
      shopify_product_id: `pi-list-${id}`, title: `Producto ${index}`, description: index === 0 ? "  Ordena\n tu escritorio.  " : index === 2 ? "á".repeat(400) : null,
      is_upsell: index === 3, pi_deleting_at: index === 4 ? new Date().toISOString() : null,
    }))));
    await checked(db.from("product_intelligence").insert({ product_id: ids[0], user_id: owner.userId }));
    await checked(db.from("pi_product_inputs").insert({ product_id: ids[0], user_id: owner.userId, display_name: "Organizador confirmado",
      description: "  Descripción\n confirmada.  ", last_revision: 1, created_by: owner.userId, updated_by: owner.userId }));
  }, 20000);
  afterAll(async () => { for (const userId of users) await checked(db.auth.admin.deleteUser(userId)); }, 20000);

  it("prioriza contexto, acota descripción y omite Upsell, borrados y otros dueños", async () => {
    const result = await list();
    expect(result.products).toEqual([
      { product_id: ids[0], name: "Organizador confirmado", description: "Descripción confirmada." },
      { product_id: ids[1], name: "Producto 1", description: null },
      { product_id: ids[2], name: "Producto 2", description: "á".repeat(299) + "…" },
    ]);
    expect(result.next_cursor).toBeNull();
    expect((await list({}, other)).products.map(p => p.product_id)).toEqual([ids[5]]);
  });
  it("pagina sin duplicados y termina con lista vacía", async () => {
    const first = await list({ page_size: 2 });
    expect(first.products.map(p => p.product_id)).toEqual(ids.slice(0, 2));
    expect(first.next_cursor).toBe(ids[1]);
    const last = await list({ page_size: 2, cursor: first.next_cursor });
    expect(last.products.map(p => p.product_id)).toEqual([ids[2]]);
    expect(last.next_cursor).toBeNull();
    expect(await list({ cursor: ids[5] })).toEqual({ products: [], next_cursor: null });
  });
  it("permite incluir Upsell y usa Shopify cuando no hay contexto", async () => {
    expect((await list({ include_upsell: true })).products.map(p => p.product_id)).toEqual(ids.slice(0, 4));
    await checked(db.from("products").update({ description: "Descripción de Shopify" }).eq("id", ids[1]));
    expect((await list()).products[1].description).toBe("Descripción de Shopify");
  });
  it("revalida scope e identidad también en la base y niega RPC anónimo", async () => {
    await expect(list({}, { ...owner, scopes: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.listProducts({ p_access: { ...contextAccess(owner), scopes: [] } }, AbortSignal.timeout(10000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.listProducts({ p_access: { ...contextAccess(owner), actor_id: other.actorId } }, AbortSignal.timeout(10000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.listProducts({ p_access: contextAccess(owner), p_page_size: 51 }, AbortSignal.timeout(10000))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await anon.rpc("pi_list_products", { p_access: contextAccess(owner) })).error?.code).toBe("42501");
  });
});
