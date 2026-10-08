import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { artProblems, chatProblems, textProblems } from "@/lib/creatives/schemas";
import { planProblems } from "@/lib/page-images/schemas";
import { allowedAmounts } from "@/lib/copy/schemas";
import { eventCopyProblems } from "@/lib/events/copy";
import { tipProblems } from "@/lib/whatsapp/tip";
import { pricingPlanFromRow, type PricingRow } from "@/lib/pricing/rows";
import { commandHash } from "./concurrency";
import { contentInputSchemas, creativeContentSchema, galleryContentSchema, eventContentSchema, usageTipContentSchema } from "./content-schemas";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { contextAccess, type ContentRepository, type KnowledgeRepository } from "./repository";
import { parseKnowledgeRead, strategyResponse } from "./knowledge";
import { parseToolInput, parseToolOutput } from "./validation";
import { checkArtifact, requireScopes, toolScopes, type Principal } from "./policy";

const schemas = { creative: creativeContentSchema, gallery: galleryContentSchema, event: eventContentSchema, tip: usageTipContentSchema };
export const contentKind = (tool: string) => tool.includes("creative") ? "creative" : tool.includes("gallery") ? "gallery" : tool.includes("event") ? "event" : "tip";
const readSchema = z.object({ revision: z.number().int().nonnegative(), stamp: z.string(), content_etag: z.string(), current: z.unknown() });
export function createContentExecutor(repository: ContentRepository & KnowledgeRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    if (!(command.tool in contentInputSchemas)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de contenido.");
    const tool = command.tool as keyof typeof contentInputSchemas, input = parseToolInput(tool, command.input);
    requireScopes(principal, toolScopes[tool]);
    const write = "content" in input ? input : null, kind = contentKind(tool), access = contextAccess(principal, identity);
    const hash = write ? commandHash(tool, write) : null;
    const raw = await repository.loadContent({ p_access: access, p_product_id: input.product_id, p_kind: kind, p_key: write?.idempotency_key ?? null, p_hash: hash, p_dry_run: write?.dry_run ?? false }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(tool, raw.replay);
    const parsed = readSchema.safeParse(raw);
    if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer el contenido.");
    const read = parsed.data;
    const cursor = "cursor" in input ? input.cursor : undefined;
    if (cursor && (cursor.revision !== read.revision || cursor.content_etag !== read.content_etag)) throw new ProductIntelligenceError("CURSOR_INVALID", "Cambió el contenido. Repite la lectura desde el inicio.");
    // Los inputs congelados del render se conservan en la base; el chat recupera la propuesta y sus referencias, sin duplicar hechos completos.
    const project = (row: unknown) => {
      if (!row || typeof row !== "object" || !Object.hasOwn(row, "provenance")) return row;
      const { provenance, ...rest } = row as Record<string, unknown>;
      if (!provenance || typeof provenance !== "object") return row;
      const p = provenance as Record<string, unknown>;
      return { ...rest, provenance: { source: p.source ?? null, analysis_revision: p.analysis_revision ?? null, content: p.content ?? null } };
    };
    let current = !write && (kind === "tip" || kind === "event") ? Array.isArray(read.current) ? read.current.map(project) : project(read.current) : read.current;
    let nextCursor = null;
    if (!write && Array.isArray(current)) {
      const offset = cursor?.offset ?? 0, rows: unknown[] = []; let bytes = 0, end = offset;
      if (offset > current.length) throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no corresponde al contenido.");
      for (; end < current.length; end++) {
        const size = Buffer.byteLength(JSON.stringify(current[end]));
        if (bytes + size > 35000) break;
        rows.push(current[end]); bytes += size;
      }
      if (end === offset && end < current.length) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Una propuesta supera el límite. Divide el contenido en propuestas más pequeñas.");
      nextCursor = end < current.length ? { offset: end, revision: read.revision, content_etag: read.content_etag } : null;
      current = rows;
    }
    if (!write) return parseToolOutput(tool, { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID(), data: {
      content_etag: read.content_etag, current, has_more: Boolean(nextCursor), next_cursor: nextCursor, contract: JSON.parse(JSON.stringify(z.toJSONSchema(schemas[kind]))), rules: [
        "Si has_more es true, recupera las páginas restantes con next_cursor antes de reemplazar el plan completo.",
        "El chat escribe el contenido. Guardar crea una propuesta, sin publicar ni iniciar generación.",
        "angle_ids debe contener todos los ángulos de la estrategia seleccionada, en su orden; máximo tres.",
        "Referencia únicamente facts aprobados y verificados del producto. La estrategia seleccionada sigue siendo una hipótesis.",
        "Lee el contexto y la estrategia antes de escribir. Usa el etag y la revisión leídos; dry_run valida sin guardar.",
        "landing_angle_id y landing_hook_id son los selectores df_angle/df_hook. Usa los mismos al guardar las variantes de landing; no son UUID del análisis.",
        "Los chats publicitarios son dramatizaciones, nunca reseñas reales ni evidencia de compradores.",
        ...(kind === "gallery" ? ["Todas las tomas, incluida la portada y el ambiente, pueden llevar texto, precios, packs, descuentos y condiciones COD del contexto vigente. La galería no impone topes editoriales de caracteres, palabras, líneas o cantidad de textos ni exige un titular."] : []),
      ], next_action: "Escribe y valida el contenido en el chat; guárdalo con la tool save correspondiente y revísalo en DropFlex.",
    } });
    const knowledge = parseKnowledgeRead(await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id }, signal), principal, input.product_id);
    const state = knowledge.currentSnapshot, plan = state.pricing ? pricingPlanFromRow(state.pricing as PricingRow) : null;
    if (!plan || plan.currency !== state.catalog.currency) throw new ProductIntelligenceError("VALIDATION_ERROR", "Guarda Precio y packs primero.");
    const content = write.content;
    const facts = knowledge.currentGraph.Fact.filter(({ value: f }) => f.usage_status === "approved" && f.verification_status === "verified" &&
      !knowledge.currentGraph.EvidenceLink.some(({ value: e }) => e.fact_id === f.id && e.relation === "contradicts"));
    if (content.fact_ids.some(id => !facts.some(({ value: f }) => f.id === id))) throw new ProductIntelligenceError("INVALID_REFERENCE", "Referencia hechos aprobados y verificados del producto.");
    let strategy: ReturnType<typeof strategyResponse> | null = null;
    if ("strategy_id" in content) {
      if (!knowledge.strategy || knowledge.strategy.id !== content.strategy_id) throw new ProductIntelligenceError("INVALID_REFERENCE", "Usa la estrategia seleccionada del producto.");
      strategy = strategyResponse(knowledge.strategy, knowledge, input.product_id, "execution");
      if (!strategy.readiness.ready_for_execution) throw new ProductIntelligenceError("VALIDATION_ERROR", "Actualiza y revisa la estrategia antes de escribir contenido.", { missing_fields: strategy.readiness.missing_fields });
      if (JSON.stringify(content.angle_ids) !== JSON.stringify(strategy.snapshot.angles.map((a: { id: string }) => a.id))) throw new ProductIntelligenceError("INVALID_REFERENCE", "Usa todos los ángulos seleccionados, en su orden; el render admite hasta tres.");
    }
    const problems: string[] = [];
    if ("concepts" in content) for (const c of content.concepts) {
      if (!content.angle_ids.includes(c.angle_id)) problems.push("Cada concepto debe usar uno de los ángulos indicados.");
      if (c.family === "whatsapp_chat") {
        if (!c.chat || c.texts.length) problems.push("El creativo de chat necesita su conversación y no lleva textos adicionales.");
        else problems.push(...chatProblems(c.chat, plan));
      } else {
        if (c.chat) problems.push("Solo el creativo de chat lleva conversación.");
        const prepared = { ...c, angle: content.angle_ids.indexOf(c.angle_id) + 1, family: c.family, preset_id: null };
        problems.push(...textProblems(c.texts, plan, c.name, c.family), ...artProblems([prepared], content.kit, { presetIds: new Set() }, [prepared]));
      }
    }
    if ("plan" in content) problems.push(...planProblems(content.plan, 3, content.angle_ids.map((_, i) => i + 1)));
    if ("event_id" in content) problems.push(...eventCopyProblems(content.content, { currency: plan.currency, amounts: allowedAmounts(plan) }));
    if ("text" in content) {
      if (!content.fact_ids.length) problems.push("El consejo de uso necesita al menos un hecho que lo respalde.");
      problems.push(...tipProblems(content.text, { pricing: plan, factText: facts.filter(({ value: f }) => content.fact_ids.includes(f.id)).map(({ value: f }) => `${f.statement} ${JSON.stringify(f.value)}`).join("\n") }));
    }
    if (problems.length) throw new ProductIntelligenceError("VALIDATION_ERROR", problems.slice(0, 5).join(" "));
    const settings = state.settings ?? {};
    return parseToolOutput(tool, await repository.commitContent({ p_access: access, p_product_id: input.product_id, p_kind: kind,
      p_expected_revision: write.expected_revision, p_etag: write.expected_content_etag, p_stamp: read.stamp, p_key: write.idempotency_key, p_hash: hash,
      p_content: content, p_input: { market: { countryCode: settings.country_code, currency: plan.currency, language: settings.language, timezone: settings.timezone },
        pricing: plan, verified_facts: facts.filter(({ value: f }) => content.fact_ids.includes(f.id)).map(({ value }) => value), strategy_snapshot: strategy?.snapshot ?? null, source: "mcp_chat" }, p_dry_run: write.dry_run }, signal));
  };
}

/** La decisión humana valida el mismo contenido contra los hechos actuales antes del CAS. */
export async function reviewUsageTip(repository: ContentRepository & KnowledgeRepository, principal: Principal, productId: string, action: "approve" | "reopen", etag: string) {
  requireScopes(principal, ["product_intelligence:read", "product_intelligence:write"]);
  if (principal.actorKind !== "merchant" || !repository.reviewTip) throw new ProductIntelligenceError("FORBIDDEN", "La revisión requiere la sesión del comerciante.");
  const signal = AbortSignal.timeout(10000), access = contextAccess(principal);
  const read = readSchema.parse(await repository.loadContent({ p_access: access, p_product_id: productId, p_kind: "tip" }, signal));
  checkArtifact(etag, read.content_etag);
  const current = read.current as { source?: string; provenance?: { content?: unknown } } | null;
  if (!current) throw new ProductIntelligenceError("NOT_FOUND", "Guarda un consejo desde el chat primero.");
  if (action === "approve" && current.source === "mcp_chat") {
    await createContentExecutor(repository)(principal, { tool: "save_usage_tip", input: parseToolInput("save_usage_tip", {
      product_id: productId, schema_version: "1.0", expected_revision: read.revision, expected_content_etag: etag, idempotency_key: randomUUID(), dry_run: true,
      content: current.provenance?.content,
    }) }, signal);
  }
  return repository.reviewTip({ p_access: access, p_product_id: productId, p_etag: etag, p_stamp: read.stamp, p_action: action }, signal);
}
