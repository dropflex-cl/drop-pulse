import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { carouselContentSchema } from "@/lib/ads/carousel";
import { commandHash } from "./concurrency";
import { serverToken } from "./current-content";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { hydrateVisualState } from "./visual-state";
import { findVisual } from "./visual-domain";
import { ensureVisualRenditions } from "./visual-renditions";
import { contextAccess, type VisualRepository, type CarouselRepository } from "./repository";
import { requireScopes, toolScopes } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";

const readSchema = z.object({ revision: z.number().int().nonnegative(), carousels: z.array(z.object({ id: z.string().uuid(), content: carouselContentSchema, etag: z.string() })) });
export function createCarouselExecutor(repository: CarouselRepository & Partial<VisualRepository>, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    if (command.tool !== "get_ad_carousels" && command.tool !== "save_ad_carousel") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de carrusel.");
    const tool = command.tool, input = parseToolInput(tool, command.input);
    requireScopes(principal, toolScopes[tool]);
    const access = contextAccess(principal, identity);
    const write = "content" in input ? input : null;
    const hash = write ? commandHash(tool, write) : null;
    const raw = await repository.loadCarousel({ p_access: access, p_product_id: input.product_id,
      p_carousel_id: input.carousel_id ?? null, p_key: write?.idempotency_key ?? null, p_hash: hash, p_dry_run: write?.dry_run ?? false }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(tool, raw.replay);
    const read = readSchema.parse(raw);
    if (!write) return parseToolOutput(tool, { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID(), data: {
      carousels: read.carousels.slice("offset" in input ? input.offset : 0, ("offset" in input ? input.offset : 0) + 1), next_offset: ("offset" in input ? input.offset : 0) + 1 < read.carousels.length ? ("offset" in input ? input.offset : 0) + 1 : null, contract: JSON.parse(JSON.stringify(z.toJSONSchema(carouselContentSchema))), rules: [
        "Un carrusel es un solo anuncio con 2 a 10 tarjetas. El orden del array es el orden elegido.",
        "Guarda escenas, dirección artística y textos exactos antes de generar desde el chat. No se genera ni publica al guardar.",
        "Usa la imagen base real como entrada de cada generación; conserva la identidad y desarrolla un argumento distinto en cada tarjeta.",
        "Genera una imagen por tarjeta. Todas comparten ratio 1:1 o 4:5. No subas una plancha o captura de Instagram.",
        "Omitir asset_id, media_id y enabled conserva sus decisiones; null quita el archivo; enabled false deja la tarjeta fuera de uso.",
        "Descubre destinos ad_carousel_card en get_visual_generation_context y asigna imágenes existentes mediante bind_visual_asset.",
        "asset_id identifica una pieza visual del chat; media_id permite usar una imagen subida a Anuncios. Ambos deben pertenecer al producto.",
        "ABO y CBO crean el carrusel como un anuncio independiente. Meta conserva su orden y no añade una tarjeta final automática.",
      ],
    } });
    const current = read.carousels.find(c => c.id === write.carousel_id);
    const assigned = write.content.cards.filter(c => c.asset_id && current?.content.cards.find(v => v.key === c.key)?.asset_id !== c.asset_id);
    if (!write.dry_run && assigned.length) {
      if (!repository.readVisual) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Actualiza el servidor para asignar imágenes al carrusel.");
      const state = await hydrateVisualState(await repository.readVisual({ p_access: access, p_product_id: input.product_id }, signal), principal, input.product_id);
      for (const card of assigned) {
        const asset = findVisual(state, card.asset_id!, "asset");
        if (["archived", "rejected"].includes(asset.status)) throw new ProductIntelligenceError("INVALID_REFERENCE", "Recupera la imagen antes de asignarla al carrusel.");
        await ensureVisualRenditions(state, asset, { type: "ad_carousel_card", carousel_id: write.carousel_id ?? randomUUID(), card_key: card.key, ratio: write.content.ratio, slot: "image" }, principal.userId);
      }
    }
    return parseToolOutput(tool, await repository.commitCarousel({ p_access: access, p_product_id: input.product_id,
      p_carousel_id: write.carousel_id, p_etag: serverToken(write.expected_etag, current?.etag ?? ""),
      p_key: write.idempotency_key, p_hash: hash, p_content: write.content, p_dry_run: write.dry_run }, signal));
  };
}
