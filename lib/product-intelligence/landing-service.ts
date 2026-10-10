import { PDP_EMPTY_STATES } from "@/lib/shopify/components/_shared/pdp-empty";
import { pdpProofProblems } from "@/lib/copy/pdp-proof";
import { isEmptyContent } from "@/lib/copy/page-schema";
import { pdpBindingSchema } from "./pdp-bindings";
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import { LISTING_INFO, listingSchema } from "@/lib/copy/listing";
import { strictSchema } from "@/lib/copy/page-schema";
import { contentVariants } from "@/lib/copy/variants";
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

const readSchema = z.object({
  revision: z.number().int().nonnegative(),
  stamp: z.string(),
  landing_etag: z.string(),
  context_stale: z.boolean(),
  snapshot: z.object({
    pricing: z.record(z.string(), z.unknown()).nullable(),
    context: z.record(z.string(), z.unknown()).nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
    knowledge: z.object({
      graph: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    }),
  }),
  image_catalog: z
    .array(
      z.object({
        source: z.enum(["reference", "page_image"]),
        id: z.string().uuid(),
      }),
    )
    .default([]),
  rows: z.array(
    z.object({
      id: z.string().uuid(),
      component: z.string(),
      proposal: z.unknown(),
      content: z.unknown().nullable(),
      pdp_metadata: pdpBindingSchema.nullable().optional(),
      enabled: z.boolean(),
      status: z.string(),
      images: z.array(z.unknown()),
    }),
  ),
  reviews: z.array(
    z.object({ id: z.string().uuid(), body: z.string(), rating: z.number() }),
  ),
  review_count: z.number().int().nonnegative(),
});

export function createLandingExecutor(
  repository: LandingRepository,
  identity?: DelegatedIdentity,
): DomainExecutor {
  return async (principal, command, signal) => {
    if (
      command.tool !== "get_landing_content" &&
      command.tool !== "save_landing_content"
    )
      throw new ProductIntelligenceError(
        "EXECUTION_NOT_READY",
        "Esta operación no es de contenido de página.",
      );
    const tool = command.tool;
    requireScopes(principal, toolScopes[tool]);
    const input = parseToolInput(tool, command.input),
      access = contextAccess(principal, identity);
    const write =
      tool === "save_landing_content"
        ? parseToolInput(tool, command.input)
        : null;
    const hash = write ? commandHash("save_landing_content", write) : null;
    const raw = await repository.loadLanding(
      {
        p_access: access,
        p_product_id: input.product_id,
        p_key: write?.idempotency_key ?? null,
        p_hash: hash,
        p_dry_run: write?.dry_run ?? false,
      },
      signal,
    );
    if (raw && typeof raw === "object" && "replay" in raw)
      return parseToolOutput("save_landing_content", raw.replay);
    const parsed = readSchema.safeParse(raw);
    if (!parsed.success)
      throw new ProductIntelligenceError(
        "INTERNAL_ERROR",
        "No pudimos leer el contenido de la página.",
      );
    const read = parsed.data;
    if (!write) {
      const query = parseToolInput("get_landing_content", command.input),
        id = query.component;
      const metadata = query.schema_version === "1.2";
      const c = componentById(id),
        row = read.rows.find((r) => r.component === id);
      return parseToolOutput("get_landing_content", {
        ok: true,
        product_id: input.product_id,
        revision: read.revision,
        request_id: randomUUID(),
        data: {
          landing_etag: read.landing_etag,
          contract_version: metadata ? "1.2" : "1.1",
          context_stale: read.context_stale,
          catalog: [
            {
              component: "listing",
              name: LISTING_INFO.name,
              kind: "listing",
              min_reviews: 0,
              available: true,
            },
            ...CATALOG.map((c) => ({
              component: c.id,
              name: c.name,
              kind: c.kind,
              min_reviews: c.minReviews ?? 0,
              available: read.review_count >= (c.minReviews ?? 0),
            })),
          ],
          contract: {
            component: id,
            name: c?.name ?? LISTING_INFO.name,
            placement: c?.placement ?? LISTING_INFO.placement,
            objection: c?.objection ?? LISTING_INFO.objection,
            schema: JSON.parse(
              JSON.stringify(
                z.toJSONSchema(strictSchema(id) ?? listingSchema, {
                  unrepresentable: "any",
                }),
              ),
            ),
            rules: c
              ? [
                  ...c.rules,
                  'Todos los componentes están visibles por defecto. Sin datos reales puedes enviar {state: "empty"}; conserva la sección con su estado vacío. Puedes enviar un array de hasta 12 variantes: key, angle_id, hook_id, content e images opcionales. Incluye default con IDs null. URL: df_angle y df_hook. Cada variante se revisa como parte del componente.',
                ]
              : [
                  "Texto plano. La frase de oferta usa el precio real y cierra con el pago al recibir.",
                  "Al crear la ficha, escribe gallery_benefits: los tres beneficios principales del producto bajo el botón de compra, en orden de importancia, cada uno con icon y text (hasta 42 caracteres). Usa get_product_context/get_product_strategy y hechos aprobados y verificados.",
                  "Son beneficios del producto, no envío, pago, garantías ni descuentos de la tienda. No inventes certificaciones, resultados ni cifras. Cada variante de listing puede tener sus propios beneficios; la tienda aplica el acento del producto.",
                ],
            forbidden: c?.forbidden ?? [
              "HTML, cifras inventadas, promesas no respaldadas.",
            ],
            real_data: c?.realData ?? [
              "Precio y packs calculados en el servidor.",
            ],
            enabled_by_default: true,
            empty_state:
              id === "listing"
                ? null
                : {
                    heading: PDP_EMPTY_STATES[id].heading,
                    body: PDP_EMPTY_STATES[id].body,
                  },
            image_slots: c?.imageSlots ?? [],
            examples: c?.examples.slice(0, 1) ?? [],
          },
          current: row
            ? {
                ...(metadata ? { metadata: row.pdp_metadata ?? null } : {}),
                id: row.id,
                content: row.content ?? row.proposal,
                enabled: row.enabled,
                status: row.status,
                images: row.images,
              }
            : null,
          image_catalog: read.image_catalog,
          approved_reviews: read.reviews,
          review_count: read.review_count,
          pricing: read.snapshot.pricing,
          policies: read.snapshot.settings
            ? fromRow(read.snapshot.settings)
            : null,
          next_action:
            "Escribe usando este contrato y get_product_context/get_product_strategy. Con automatización Shopify activa, save_landing_content aprueba el contenido; completa imágenes y publica con publish_product. Sin ella, revisa en DropFlex.",
        },
      });
    }
    validateLandingProposal(
      principal.userId,
      read,
      write.entries,
      input.product_id,
    );
    return parseToolOutput(
      "save_landing_content",
      await repository.commitLanding(
        {
          p_access: access,
          p_product_id: write.product_id,
          p_expected_revision: write.expected_revision,
          p_etag: write.expected_landing_etag,
          p_stamp: read.stamp,
          p_key: write.idempotency_key,
          p_hash: hash,
          p_entries: write.entries,
          p_dry_run: write.dry_run,
        },
        signal,
      ),
    );
  };
}

/** La revisión UI y el MCP usan la misma evidencia, precios, reseñas y catálogo de imágenes. */
export function validateLandingProposal(
  userId: string,
  raw: unknown,
  entries: { component: string; content: unknown }[],
  productId: string,
): void {
  const read = readSchema.parse(raw);
  if (!read.snapshot.pricing)
    throw new ProductIntelligenceError(
      "VALIDATION_ERROR",
      "Guarda Precio y packs antes de escribir la página.",
      { missing_fields: ["pricing"] },
    );
  const pricing = pricingPlanFromRow(
    read.snapshot.pricing as unknown as PricingRow,
  );
  const ids = entries.map((e) => e.component);
  const parts = Object.fromEntries(
    entries.map((e) => [e.component, e.content]),
  );
  // Solo facts aprobados/verificados respaldan números de uso. Hipótesis y texto del proveedor no son prueba.
  const graph = emptyGraph();
  graph.Fact = (read.snapshot.knowledge.graph.Fact ?? []).map((f) => ({
    userId,
    productId,
    value: factRecordSchema.parse(f),
  }));
  graph.EvidenceLink = (read.snapshot.knowledge.graph.EvidenceLink ?? []).map(
    (e) => ({ userId, productId, value: evidenceLinkRecordSchema.parse(e) }),
  );
  const restricted = new Set(usageRestrictions(graph).map((r) => r.fact_id));
  const factText = graph.Fact.map(({ value }) => value)
    .filter((f) => !restricted.has(f.id))
    .map(
      (f) =>
        `${f.statement}: ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)}`,
    )
    .join("\n");
  const problems = pageProblems(
    { listing: parts.listing ?? null, components: parts },
    ids,
    {
      currency: pricing.currency,
      amounts: allowedAmounts(pricing),
      reviewIds: read.reviews.map((r) => r.id),
      factText,
    },
  );
  for (const id of ids)
    if (
      !contentVariants(parts[id]).every((v) => isEmptyContent(v.content)) &&
      read.review_count < (componentById(id)?.minReviews ?? 0)
    )
      problems.push(
        `${id}: aprueba más reseñas antes de escribir este componente.`,
      );
  const allowed = new Set(read.image_catalog.map((i) => `${i.source}:${i.id}`));
  for (const entry of entries)
    for (const variant of contentVariants(entry.content)) {
      const slots = componentById(entry.component)?.imageSlots ?? [];
      const usableFacts = new Map(
        graph.Fact.filter((f) => !restricted.has(f.value.id)).map((f) => [
          f.value.id,
          `${f.value.statement}: ${JSON.stringify(f.value.value)}`,
        ]),
      );
      problems.push(
        ...pdpProofProblems(entry.component, variant.content, usableFacts),
      );
      if (
        ["before-after", "expert-endorsement"].includes(entry.component) &&
        (variant.images ?? []).some((p) => p.source !== "reference")
      )
        problems.push(
          `${entry.component}.${variant.key}: las pruebas de resultados y retratos requieren referencias reales, no imágenes generadas.`,
        );
      for (const pick of variant.images ?? []) {
        if (
          !slots.some((s) => s.key === pick.slot) ||
          !allowed.has(`${pick.source}:${pick.id}`)
        )
          problems.push(
            `${entry.component}.${variant.key}: esa imagen no pertenece a un espacio disponible del producto.`,
          );
      }
      for (const slot of slots)
        if (
          (variant.images ?? []).filter((p) => p.slot === slot.key).length >
          slot.max
        )
          problems.push(
            `${entry.component}.${variant.key}: demasiadas imágenes en ${slot.key}.`,
          );
    }
  if (problems.length)
    throw new ProductIntelligenceError("VALIDATION_ERROR", problems[0], {
      fields: problems.slice(0, 100).map((p) => p.split(":")[0].slice(0, 256)),
    });
}
