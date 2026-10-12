import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { carouselFixture } from "@/lib/ads/carousel-fixtures";
import { listMediaRows, toAdMedia } from "@/lib/ads/store";
import { createCarouselExecutor } from "./carousel-service";
import { createContextRepository, contextAccess } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { hydrateVisualState } from "./visual-state";
import { deleteProducts } from "@/lib/products/delete";
import { ProductIntelligenceError } from "./errors";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Carruseles · persistencia y archivos locales", () => {
  let db: SupabaseClient, owner: Principal, execute: ReturnType<typeof createCarouselExecutor>, carouselId: string;
  const product = randomUUID(), media = randomUUID(), file = randomUUID(), asset = randomUUID();
  let path: string;
  const content = carouselFixture();
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) { const r = await op; if (r.error) throw new Error(JSON.stringify(r.error)); return r; }
  async function save(raw: object) { return parseToolOutput("save_ad_carousel", await execute(owner, { tool: "save_ad_carousel", input: parseToolInput("save_ad_carousel", { product_id: product, schema_version: "1.0", ...raw }) }, AbortSignal.timeout(30000))); }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const user = await checked(db.auth.admin.createUser({ email: `carousel-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }));
    const id = user.data.user!.id; owner = { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES }; execute = createCarouselExecutor(createContextRepository(db));
    await checked(db.from("products").insert({ id: product, user_id: id, title: "Carrusel de prueba", shopify_product_id: product, currency: "CLP" }));
    const bytes = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "white" } }).jpeg().toBuffer();
    path = `${id}/${product}/card.jpg`; await checked(db.storage.from("ad-media").upload(path, bytes, { contentType: "image/jpeg" }));
    await checked(db.from("ad_media").insert({ id: media, user_id: id, product_id: product, kind: "image", name: "Tarjeta", storage_path: path, mime_type: "image/jpeg", width: 800, height: 1000, ratio: "4:5", size_bytes: bytes.length }));
    const canonical = `${id}/${product}/visual-${file}.webp`, canonicalBytes = await sharp(bytes).webp().toBuffer();
    await checked(db.storage.from("page-media").upload(canonical, canonicalBytes, { contentType: "image/webp" }));
    await checked(db.from("pi_visual_files").insert({ id: file, user_id: id, product_id: product, bucket: "page-media", storage_path: canonical, sha256: "a".repeat(64), original_sha256: "a".repeat(64), mime_type: "image/webp", width: 800, height: 1000, size_bytes: canonicalBytes.length }));
    await checked(db.from("pi_visual_records").insert({ id: asset, user_id: id, product_id: product, kind: "asset", version: 1, etag: "a".repeat(64), status: "in_review", payload: { file_id: file, dependencies: [] } }));
  });
  afterAll(async () => { if (db && owner) { await deleteProducts(owner.userId, [product]); await checked(db.auth.admin.deleteUser(owner.userId)); } });
  it("guarda un borrador sin imágenes, descubre destinos, simula y repite sin duplicar", async () => {
    const input = { content, idempotency_key: randomUUID() };
    expect(await save({ ...input, dry_run: true })).toMatchObject({ data: { applied: false } });
    expect((await listMediaRows(owner.userId, product)).filter(m => m.kind === "carousel")).toHaveLength(0);
    const saved = await save(input); if (!saved.ok) throw saved;
    carouselId = saved.data.carousel_id; expect(await save(input)).toEqual(saved);
    const repo = createContextRepository(db), state = await hydrateVisualState(await repo.readVisual({ p_access: contextAccess(owner), p_product_id: product }, AbortSignal.timeout(30000)), owner, product);
    expect(state.targets.filter(t => t.key.startsWith(`carousel:${carouselId}:`))).toHaveLength(2);
    const rows = await listMediaRows(owner.userId, product); expect(rows.find(m => m.id === carouselId)?.carousel).toMatchObject({ ready: false });
  });
  it("asigna un asset externo, prepara JPEG, conserva omisiones y orden, protege CAS", async () => {
    const assigned = { ...content, cards: [{ ...content.cards[1], asset_id: asset, enabled: false }, { ...content.cards[0], media_id: media }] };
    const saved = await save({ carousel_id: carouselId, content: assigned }); if (!saved.ok) throw saved;
    let rows = await listMediaRows(owner.userId, product); expect(rows.find(m => m.id === carouselId)?.carousel?.etag).toBe(saved.data.etag);
    const missingFiles = { ...assigned, primary_text: "Texto nuevo", cards: assigned.cards.map(c => ({ key: c.key, headline: c.headline, description: c.description, scene: c.scene, image_texts: c.image_texts, link: c.link })) };
    await save({ carousel_id: carouselId, content: missingFiles });
    rows = await listMediaRows(owner.userId, product); const carousel = rows.find(m => m.id === carouselId)!.carousel!;
    expect(carousel.cards.map(c => c.key)).toEqual(["oferta", "cuidado"]); expect(carousel.cards[0]).toMatchObject({ asset_id: asset, enabled: false }); expect(carousel.cards[0].storage_path).toMatch(/\.jpg$/);
    await expect(save({ carousel_id: carouselId, content, expected_etag: saved.data.etag })).rejects.toBeInstanceOf(ProductIntelligenceError);
    const ready = await save({ carousel_id: carouselId, content: { ...missingFiles, cards: missingFiles.cards.map(c => ({ ...c, enabled: true })) } }); expect(ready.ok).toBe(true);
    rows = await listMediaRows(owner.userId, product); expect((await toAdMedia(rows)).find(m => m.id === carouselId)?.carousel).toMatchObject({ ready: true });
  });
  it("binding explícito actualiza la tarjeta y deselección quita solo su archivo", async () => {
    const binding = randomUUID(), target = { type: "ad_carousel_card", carousel_id: carouselId, card_key: "cuidado", ratio: "4:5", slot: "image" };
    await checked(db.from("pi_visual_records").insert({ id: binding, user_id: owner.userId, product_id: product, kind: "binding", version: 1, etag: "b".repeat(64), status: "selected", payload: { asset_id: asset, target, selected: true } }));
    const selected = (await listMediaRows(owner.userId, product)).find(m => m.id === carouselId)!.carousel!;
    expect(selected.cards[1]).toMatchObject({ asset_id: asset, media_id: null });
    await checked(db.from("pi_visual_records").update({ status: "proposed" }).eq("id", binding));
    const unselected = (await listMediaRows(owner.userId, product)).find(m => m.id === carouselId)!.carousel!;
    expect(unselected.cards[1].asset_id).toBeNull(); expect(unselected.cards[0].asset_id).toBe(asset);
  });
  it("rechaza referencias ajenas y al borrar el producto elimina archivos y carrusel", async () => {
    await expect(save({ carousel_id: carouselId, content: { ...content, cards: content.cards.map(c => ({ ...c, media_id: randomUUID() })) } })).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await deleteProducts(owner.userId, [product]);
    expect((await checked(db.from("ad_media").select("id").eq("product_id", product))).data).toEqual([]);
    expect((await db.storage.from("ad-media").list(`${owner.userId}/${product}`)).data).toEqual([]);
  });
});
