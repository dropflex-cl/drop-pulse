import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import { LISTING_INFO, listingSchema } from "@/lib/copy/listing";
import { pageProblems } from "@/lib/copy/page-schema";
import { allowedAmounts } from "@/lib/copy/schemas";
import { pricingPlanFromRow, type PricingRow } from "@/lib/pricing/rows";
import { fromRow } from "@/lib/settings/policies";
import { commandHash } from "./concurrency";
import { ProductIntelligenceError } from "./errors";
import { emptyGraph, usageRestrictions } from "./graph";
import { factRecordSchema, evidenceLinkRecordSchema } from "./schemas";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { requireScopes, toolScopes } from "./policy";
import { contextAccess, type LandingRepository } from "./repository";
import { parseToolInput, parseToolOutput } from "./validation";

const readSchema = z.object({ revision: z.number().int().nonnegative(), stamp: z.string(), landing_etag: z.string(),
  context_stale: z.boolean(),
  snapshot: z.object({ pricing: z.record(z.string(), z.unknown()).nullable(), context: z.record(z.string(), z.unknown()).nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(), knowledge: z.object({ graph: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }) }),
  rows: z.array(z.object({ id: z.string().uuid(), component: z.string(), proposal: z.unknown(), content: z.unknown().nullable(),
    enabled: z.boolean(), status: z.string(), images: z.array(z.unknown()) })),
  reviews: z.array(z.object({ id: z.string().uuid(), body: z.string(), rating: z.number() })), review_count: z.number().int().nonnegative(),
});

export function createLandingExecutor(repository: LandingRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    if (command.tool !== "get_landing_content" && command.tool !== "save_landing_content") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de contenido de página.");
    const tool = command.tool;
    requireScopes(principal, toolScopes[tool]);
    const input = parseToolInput(tool, command.input), access = contextAccess(principal, identity);
    const write = tool === "save_landing_content" ? parseToolInput(tool, command.input) : null;
    const hash = write ? commandHash("save_landing_content", write) : null;
    const raw = await repository.loadLanding({ p_access: access, p_product_id: input.product_id, p_key: write?.idempotency_key ?? null,
      p_hash: hash, p_dry_run: write?.dry_run ?? false }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput("save_landing_content", raw.replay);
    const parsed = readSchema.safeParse(raw);
    if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer el contenido de la página.");
    const read = parsed.data;
    if (!write) {
      const id = parseToolInput("get_landing_content", command.input).component;
      const c = componentById(id), row = read.rows.find((r) => r.component === id);
      return parseToolOutput("get_landing_content", { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID(), data: {
        landing_etag: read.landing_etag, contract_version: "1.0",
        context_stale: read.context_stale,
        catalog: [{ component: "listing", name: LISTING_INFO.name, kind: "listing", min_reviews: 0, available: true },
          ...CATALOG.map((c) => ({ component: c.id, name: c.name, kind: c.kind, min_reviews: c.minReviews ?? 0, available: read.review_count >= (c.minReviews ?? 0) }))],
        contract: { component: id, name: c?.name ?? LISTING_INFO.name, placement: c?.placement ?? LISTING_INFO.placement,
          objection: c?.objection ?? LISTING_INFO.objection, schema: JSON.parse(JSON.stringify(z.toJSONSchema(c?.content ?? listingSchema, { unrepresentable: "any" }))),
          rules: c?.rules ?? ["Texto plano. La frase de oferta usa el precio real y cierra con el pago al recibir."],
          forbidden: c?.forbidden ?? ["HTML, cifras inventadas, promesas no respaldadas."], real_data: c?.realData ?? ["Precio y packs calculados en el servidor."],
          image_slots: c?.imageSlots ?? [], examples: c?.examples.slice(0, 1) ?? [] },
        current: row ? { id: row.id, content: row.content ?? row.proposal, enabled: row.enabled, status: row.status, images: row.images } : null,
        approved_reviews: read.reviews, review_count: read.review_count, pricing: read.snapshot.pricing, policies: read.snapshot.settings ? fromRow(read.snapshot.settings) : null,
        next_action: "Escribe en el chat usando este contrato y get_product_context/get_product_strategy. Guarda con save_landing_content y revisa en la UI antes de publicar.",
      } });
    }
    if (!read.snapshot.pricing) throw new ProductIntelligenceError("VALIDATION_ERROR", "Guarda Precio y packs antes de escribir la página.", { missing_fields: ["pricing"] });
    const pricing = pricingPlanFromRow(read.snapshot.pricing as unknown as PricingRow);
    const ids = write.entries.map((e) => e.component);
    const parts = Object.fromEntries(write.entries.map((e) => [e.component, e.content]));
    // Solo facts aprobados/verificados respaldan números de uso. Hipótesis y texto del proveedor no son prueba.
    const graph = emptyGraph();
    graph.Fact = (read.snapshot.knowledge.graph.Fact ?? []).map((f) => ({ userId: principal.userId, productId: input.product_id, value: factRecordSchema.parse(f) }));
    graph.EvidenceLink = (read.snapshot.knowledge.graph.EvidenceLink ?? []).map((e) => ({ userId: principal.userId, productId: input.product_id, value: evidenceLinkRecordSchema.parse(e) }));
    const restricted = new Set(usageRestrictions(graph).map((r) => r.fact_id));
    const factText = graph.Fact.map(({ value }) => value).filter((f) => !restricted.has(f.id))
      .map((f) => `${f.statement}: ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)}`).join("\n");
    const problems = pageProblems({ listing: parts.listing ?? null, components: parts }, ids,
      { currency: pricing.currency, amounts: allowedAmounts(pricing), reviewIds: read.reviews.map((r) => r.id), factText });
    for (const id of ids) if (read.review_count < (componentById(id)?.minReviews ?? 0)) problems.push(`${id}: aprueba más reseñas antes de escribir este componente.`);
    if (problems.length) throw new ProductIntelligenceError("VALIDATION_ERROR", problems[0], { fields: problems.slice(0, 100).map((p) => p.split(":")[0].slice(0, 256)) });
    return parseToolOutput("save_landing_content", await repository.commitLanding({ p_access: access, p_product_id: write.product_id,
      p_expected_revision: write.expected_revision, p_etag: write.expected_landing_etag, p_stamp: read.stamp,
      p_key: write.idempotency_key, p_hash: hash, p_entries: write.entries, p_dry_run: write.dry_run }, signal));
  };
}
