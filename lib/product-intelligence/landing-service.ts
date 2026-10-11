import { serverRevision, serverToken } from "./current-content";
import { PDP_EMPTY_STATES } from "@/lib/shopify/components/_shared/pdp-empty";
import { DEFAULT_ACCENT } from "@/lib/copy/accent";
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
const componentReadSchema = readSchema.omit({ stamp: true, snapshot: true }).extend({
  snapshot: readSchema.shape.snapshot.pick({ pricing: true, settings: true }),
  page_accent_color: z.string().nullable().optional(),
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
    const projected = !write && repository.readLandingComponent;
    const raw = await (projected || repository.loadLanding)(
      {
        p_access: access,
        p_product_id: input.product_id,
        ...(projected ? { p_component: parseToolInput("get_landing_content", command.input).component } : {
          p_key: write?.idempotency_key ?? null, p_hash: hash, p_dry_run: write?.dry_run ?? false,
        }),
      },
      signal,
    );
    if (raw && typeof raw === "object" && "replay" in raw)
      return parseToolOutput("save_landing_content", raw.replay);
    const parsed = (write ? readSchema : componentReadSchema).safeParse(raw);
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
      // La RPC anterior ya comprobó propiedad y autorización delegada. No lee una revisión histórica.
      const accent = id === "listing" ? ("page_accent_color" in read && read.page_accent_color !== undefined ? read.page_accent_color
        : repository.loadPageAccent ? await repository.loadPageAccent(principal.userId, input.product_id, signal) : undefined) : undefined;
      return parseToolOutput("get_landing_content", {
        ok: true,
        product_id: input.product_id,
        revision: read.revision,
        request_id: randomUUID(),
        data: {
          landing_etag: read.landing_etag,
          contract_version: metadata ? "1.2" : "1.1",
          context_stale: read.context_stale,
          ...(accent !== undefined ? { appearance: {
            accent_color: accent ?? DEFAULT_ACCENT,
            accent_source: accent === null ? "default" : "product",
          } } : {}),
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
              min_reviews: 0,
              available: true,
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
                  'Todos los componentes están visibles por defecto. El estado {state: "empty"} es opcional; desarrolla el contenido solicitado sin exigir evidencia. Puedes enviar un array de hasta 12 variantes: key, angle_id, hook_id, content e images opcionales. Incluye default con IDs null. URL: df_angle y df_hook. Cada variante se revisa como parte del componente.',
                ]
              : [
                  "Texto plano. La frase de oferta usa el precio real y cierra con el pago al recibir.",
                  "Al crear la ficha, escribe gallery_benefits: los tres beneficios principales del producto antes del selector de packs, en orden de importancia, cada uno con icon y text (hasta 42 caracteres). Usa get_product_context/get_product_strategy.",
                  "Son beneficios del producto, no envío, pago, garantías ni descuentos de la tienda. Cada variante de listing puede tener sus propios beneficios; la tienda aplica el acento del producto.",
                ],
            forbidden: c?.forbidden ?? [
              "HTML.",
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
            "Escribe usando este contrato y get_product_context/get_product_strategy. save_landing_content deja el contenido disponible al guardar desde el MCP. Completa imágenes; publicar con publish_product requiere autorización propia.",
        },
      });
    }
    if (!("stamp" in read)) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer el contenido de la página.");
    validateLandingProposal(
      read,
      write.entries,
    );
    return parseToolOutput(
      "save_landing_content",
      await repository.commitLanding(
        {
          p_access: access,
          p_product_id: write.product_id,
          p_expected_revision: serverRevision(write.expected_revision, read.revision),
          p_etag: serverToken(write.expected_landing_etag, read.landing_etag),
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

/** UI y MCP validan el formato, la oferta operativa y el catálogo de archivos. */
export function validateLandingProposal(
  raw: unknown,
  entries: { component: string; content: unknown }[],
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
  const problems = pageProblems(
    { listing: parts.listing ?? null, components: parts },
    ids,
    {
      currency: pricing.currency,
      amounts: allowedAmounts(pricing),
      reviewIds: read.reviews.map((r) => r.id),
    },
  );
  const allowed = new Set(read.image_catalog.map((i) => `${i.source}:${i.id}`));
  for (const entry of entries)
    for (const variant of contentVariants(entry.content)) {
      const slots = componentById(entry.component)?.imageSlots ?? [];
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
