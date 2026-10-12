import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createCarouselExecutor } from "./carousel-service";
import { carouselFixture } from "@/lib/ads/carousel-fixtures";
import { parseToolInput } from "./validation";
import { PI_SCOPES } from "./policy";

const product = randomUUID(), id = randomUUID(), principal = { userId: randomUUID(), actorId: "merchant", actorKind: "merchant" as const, scopes: PI_SCOPES };
describe("MCP de carruseles", () => {
  it("recupera contrato y guarda con CAS interno sin pedir revisiones al comerciante", async () => {
    const commitCarousel = vi.fn().mockResolvedValue({ ok: true, product_id: product, revision: 2, request_id: randomUUID(), data: { applied: true, dry_run: false, carousel_id: id, etag: "b".repeat(64), next_action: "Guardado" } });
    const execute = createCarouselExecutor({ loadCarousel: vi.fn().mockResolvedValue({ revision: 1, carousels: [{ id, content: carouselFixture(), etag: "a".repeat(64) }] }), commitCarousel });
    const result = await execute(principal, { tool: "get_ad_carousels", input: { product_id: product, offset: 0 } }, AbortSignal.timeout(1000));
    expect(result).toMatchObject({ ok: true, data: { carousels: [{ id }] } });
    const input = parseToolInput("save_ad_carousel", { product_id: product, carousel_id: id, schema_version: "1.0", content: carouselFixture() });
    await execute(principal, { tool: "save_ad_carousel", input }, AbortSignal.timeout(1000));
    expect(commitCarousel.mock.calls[0][0]).toMatchObject({ p_carousel_id: id, p_etag: "a".repeat(64), p_content: carouselFixture(), p_dry_run: false });
  });
  it("reproduce una escritura antes de preparar archivos o intentar CAS", async () => {
    const response = { ok: true, product_id: product, revision: 2, request_id: randomUUID(), data: { applied: true, dry_run: false, carousel_id: id, etag: "b".repeat(64), next_action: "Guardado" } };
    const commitCarousel = vi.fn(), execute = createCarouselExecutor({ loadCarousel: vi.fn().mockResolvedValue({ replay: response }), commitCarousel });
    const input = parseToolInput("save_ad_carousel", { product_id: product, carousel_id: id, schema_version: "1.0", content: carouselFixture() });
    expect(await execute(principal, { tool: "save_ad_carousel", input }, AbortSignal.timeout(1000))).toEqual(response); expect(commitCarousel).not.toHaveBeenCalled();
  });
  it("pagina piezas completas dentro del límite de respuesta", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const execute = createCarouselExecutor({ loadCarousel: vi.fn().mockResolvedValue({ revision: 1, carousels: ids.map(id => ({ id, content: carouselFixture(), etag: "a".repeat(64) })) }), commitCarousel: vi.fn() });
    expect(await execute(principal, { tool: "get_ad_carousels", input: { product_id: product, offset: 1 } }, AbortSignal.timeout(1000))).toMatchObject({ data: { carousels: [{ id: ids[1] }], next_offset: 2 } });
    expect(await execute(principal, { tool: "get_ad_carousels", input: { product_id: product, offset: 2 } }, AbortSignal.timeout(1000))).toMatchObject({ data: { carousels: [{ id: ids[2] }], next_offset: null } });
  });

});
