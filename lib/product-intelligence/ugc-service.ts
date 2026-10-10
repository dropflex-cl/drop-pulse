import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scriptProblems, assembleScript, applyScriptEdit, scriptEditSchema, type OpeningInput, type UgcScript } from "@/lib/video/schemas";
import { scriptCost } from "@/lib/video/cost";
import { KEYFRAME_COST_USD, KLING_TURBO_5S_USD } from "@/lib/video/catalog";
import { seedanceCostUsd } from "@/lib/video/cost";
import { aRollRequest, bRollRequest, isAppearanceCategory, keyframeRequest } from "@/lib/video/render";
import { isShotRecoverable, type ScriptRow, type ShotRow } from "@/lib/video/store";
import { signedUrls } from "@/lib/creatives/store";
import { higgsfieldKey } from "@/lib/integrations/higgsfield/connection";
import { requireAiKey } from "@/lib/pipeline/errors";
import { imageQaEnabled, imagesForGeneration } from "@/lib/products/store";
import { montagePackage } from "@/lib/pipeline/video";
import { productHref } from "@/lib/routes";
import { canonicalHash, commandHash } from "./concurrency";
import { storedPricingPlan, productContextResponse } from "./context";
import { ProductIntelligenceError } from "./errors";
import { parseKnowledgeRead, strategyResponse } from "./knowledge";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { checkArtifact, checkRevision, requireScopes, toolScopes, type Principal } from "./policy";
import { contextAccess, type KnowledgeRepository, type UgcRepository } from "./repository";
import { chatUgcContent } from "./ugc-schemas";
import { parseToolInput, parseToolOutput } from "./validation";
import type { JsonValue, ToolInputs, ToolOutputs } from "./schemas";

export const UGC_RULES = [
  "Escribe lines y plan en el chat; el servidor arma K1 y las claves de tomas y valida duración, voz, apertura, montos y forma de mascota.",
  "Los hechos aprobados, las hipótesis y la estrategia seleccionada siguen separados. Seleccionar no demuestra un ganador.",
  "Usa solo pruebas y precios vigentes. Sin testimonios inventados, experto ficticio, edad dicha ni resultados propios de la persona de IA.",
  "hook es la entrada de este video, una hipótesis vinculada al ángulo. landing_angle_id y landing_hook_id son los selectores URL df_angle/df_hook: usa los mismos en save_landing_content.",
  "Guardar no aprueba ni genera. Revisa en Creativos > Videos; generate_ugc genera solo las shot_keys solicitadas. dry_run valida y estima sin proveedores.",
  "Para generar otras escenas con personaje pide K1 primero, o inclúyelo en el mismo lote. Los clips requieren todas las imágenes clave aprobadas.",
  "El montaje sigue siendo local: get_ugc_montage devuelve el paquete; sube el MP4 desde la UI y apruébalo antes de publicar o usarlo en Meta.",
];
type Read = { revision: number; stamp: string; ugc_etag: string; scripts: ScriptRow[]; shots: ShotRow[]; operation: Operation | null; operation_script?: ScriptRow | null };
type Operation = { id: string; script_id: string; stage: "keyframes" | "clips"; status: "queued" | "running" | "succeeded" | "failed" | "reconciling" | "cancelled";
  input_hash: string; context_stamp: string; analysis_revision: number; request_revision: number; estimated_usd: number; status_revision: number; created_at: string; updated_at: string; shots: ShotRow[] };
const readSchema = z.object({ revision: z.number().int().nonnegative(), stamp: z.string(), ugc_etag: z.string(), scripts: z.array(z.record(z.string(), z.unknown())),
  shots: z.array(z.record(z.string(), z.unknown())), operation: z.record(z.string(), z.unknown()).nullable(), operation_script: z.record(z.string(), z.unknown()).nullable().optional() });
export function parseUgcRead(raw: unknown): Read {
  const parsed = readSchema.safeParse(raw);
  if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer tus videos.");
  return parsed.data as unknown as Read;
}
function scriptIn(read: Read, scriptId: string): ScriptRow & { payload: UgcScript } {
  const script = read.scripts.find((s) => s.id === scriptId);
  if (!script?.payload || script.status !== "succeeded") throw new ProductIntelligenceError("NOT_FOUND", "Ese guion no está disponible. Recupera su versión actual.");
  return script as ScriptRow & { payload: UgcScript };
}
function openingFor(input: ToolInputs["save_ugc_content"]): OpeningInput {
  return { hooks: [{ index: 0, spoken: input.hook.spoken, shot: input.hook.opening_shot }] };
}
export function buildChatUgc(input: ToolInputs["save_ugc_content"], pricing: NonNullable<ReturnType<typeof storedPricingPlan>>) {
  if (input.content.lines.hook_source !== 0) throw new ProductIntelligenceError("VALIDATION_ERROR", "hook_source debe ser 0: el gancho enviado para este video.");
  const payload = assembleScript(input.content.lines, input.content.plan, input.content.format, input.hook.opening_shot);
  const problems = scriptProblems(payload, pricing, input.content.format, openingFor(input));
  if (payload.opening?.first_motion.trim() !== input.hook.first_motion.trim()) problems.push("La apertura del plan debe conservar first_motion del gancho.");
  if (payload.text_beats[0]?.text.trim() !== input.hook.screen.trim()) problems.push("El primer texto en pantalla debe ser screen del gancho.");
  if (problems.length) throw new ProductIntelligenceError("VALIDATION_ERROR", problems[0], { fields: problems.slice(0, 20) });
  return payload;
}
export function prepareUgcShots(script: ScriptRow & { payload: UgcScript }, stage: "keyframes" | "clips", keys: string[]) {
  const language = (script.input.market as { language?: string } | undefined)?.language ?? "es";
  const findK = (key: string) => script.payload.keyframes.find((k) => k.key === key);
  let estimated = 0;
  const shots = keys.map((key) => {
    const k = findK(key), a = script.payload.a_roll.find((s) => s.key === key), b = script.payload.b_roll.find((s) => s.key === key);
    if (stage === "keyframes" && k) {
      estimated += KEYFRAME_COST_USD;
      const req = keyframeRequest(k, script.payload, "K1", script.format, { appearance: Boolean(script.input.appearance) });
      return { key, kind: "keyframe", ...req };
    }
    if (stage === "clips" && a) {
      estimated += seedanceCostUsd(a.seconds);
      return { key, kind: "a_roll", ...aRollRequest(a, language, Boolean(findK(a.keyframe)?.uses_product), script.format, script.payload.opening) };
    }
    if (stage === "clips" && b) {
      estimated += KLING_TURBO_5S_USD;
      return { key, kind: "b_roll", ...bRollRequest(b, Boolean(findK(b.keyframe)?.uses_product), script.format, findK(b.keyframe)?.camera, script.payload.opening) };
    }
    throw new ProductIntelligenceError("INVALID_REFERENCE", `La toma ${key} no pertenece a esta etapa del guion.`);
  });
  return { shots, estimated_usd: estimated };
}
function iso(value: string) { return new Date(value).toISOString(); }
export function ugcOperationStatus(read: Read, principal: Principal, input: { product_id: string; operation_id: string; page_size?: number; cursor?: string }) {
  const op = read.operation;
  if (!op || op.id !== input.operation_id) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos esa generación.");
  const script = read.scripts.find((s) => s.id === op.script_id) ?? read.operation_script;
  if (!script) throw new ProductIntelligenceError("NOT_FOUND", "La versión de ese guion ya fue reemplazada.");
  const shots = op.shots ?? [], stale = read.stamp !== op.context_stamp || Boolean(script.superseded_at);
  const unknown = shots.some((s) => s.error_code === "dispatch_unknown" || s.error_code === "dispatching");
  const working = shots.some((s) => s.render_status === "queued" || s.render_status === "running");
  const latest = new Map<string, ShotRow>(); for (const shot of shots) latest.set(shot.key, shot);
  const failed = [...latest.values()].some((s) => s.render_status === "failed");
  const status = op.status === "cancelled" ? "cancelled" : unknown && !working ? "reconciling" : working ? op.status === "queued" ? "queued" : "running" : failed ? "failed" : "succeeded";
  let offset = 0;
  if (input.cursor) {
    const match = /^ugc:([0-9a-f-]+):([0-9]+):([0-9]+)$/.exec(input.cursor);
    if (!match || match[1] !== op.id || Number(match[2]) !== op.status_revision) throw new ProductIntelligenceError("CURSOR_EXPIRED", "La generación cambió. Lee su primera página nuevamente.");
    offset = Number(match[3]);
    if (!Number.isSafeInteger(offset) || offset > shots.length) throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no es válido.");
  }
  const page = shots.slice(offset, offset + (input.page_size ?? 50));
  const strategyId = script.provenance?.strategy_id as string;
  const result: ToolOutputs["get_generation_status"] = { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID(), warnings: [], data: {
    operation_id: op.id, kind: "ugc", stage: op.stage, status, status_revision: Number(op.status_revision), strategy_id: strategyId,
    analysis_revision: Number(op.analysis_revision), request_revision: Number(op.request_revision), input_hash: op.input_hash,
    created_at: iso(op.created_at), updated_at: iso(op.updated_at), outputs: page.map((s) => ({ kind: "video_shot", id: s.id,
      status: s.render_status === "failed" ? "error" : s.status === "approved" ? "approved" : s.status === "rejected" ? "rejected" : s.render_status === "succeeded" ? "in_review" : "generated",
      artifact_etag: canonicalHash({ id: s.id, updated_at: s.updated_at, status: s.status, render_status: s.render_status }),
      review_path: productHref(input.product_id, "creativos"), strategy_id: strategyId, analysis_revision: Number(op.analysis_revision), angle_id: script.provenance?.angle_id as string })),
    cost: { recorded_usd: null, estimated_usd: Number(op.estimated_usd), is_estimate: true, as_of: iso(op.updated_at) },
    requires_review: true, context_stale: stale, needs_review: stale || failed,
    next_actions: status === "reconciling" ? ["reconcile_provider"] : status === "failed" ? [...latest.values()].some(isShotRecoverable) ? ["reconcile_provider"] : ["retry_explicitly"] : status === "succeeded" ? op.stage === "keyframes" ? ["review_keyframes", "generate_clips"] : ["download_montage_package", "upload_final_video"] : [],
    failure: null, next_cursor: offset + page.length < shots.length ? `ugc:${op.id}:${op.status_revision}:${offset + page.length}` : null, truncated: offset + page.length < shots.length,
  } };
  void principal;
  return result;
}
export function createUgcExecutor(repository: KnowledgeRepository & UgcRepository, identity?: DelegatedIdentity, wake?: (operationId: string) => void): DomainExecutor {
  return async (principal, command, signal) => {
    if (!["get_ugc_content", "save_ugc_content", "generate_ugc", "get_generation_status", "get_ugc_montage"].includes(command.tool)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de video.");
    requireScopes(principal, toolScopes[command.tool]);
    const tool = command.tool as "get_ugc_content" | "save_ugc_content" | "generate_ugc" | "get_generation_status" | "get_ugc_montage";
    const input = parseToolInput(tool, command.input);
    const access = contextAccess(principal, identity), hash = tool === "save_ugc_content" ? commandHash(tool, parseToolInput(tool, command.input)) : tool === "generate_ugc" ? commandHash(tool, parseToolInput(tool, command.input)) : null;
    const args = { p_access: access, p_product_id: input.product_id, p_tool: tool, p_key: "idempotency_key" in input ? input.idempotency_key : null,
      p_hash: hash, p_dry_run: "dry_run" in input ? input.dry_run : false, p_operation_id: "operation_id" in input ? input.operation_id : null };
    const raw = await repository.loadUgc(args, signal);
    async function status(operationId: string) {
      const read = parseUgcRead(await repository.loadUgc({ p_access: access, p_product_id: input.product_id, p_operation_id: operationId }, signal));
      return ugcOperationStatus(read, principal, { product_id: input.product_id, operation_id: operationId });
    }
    if (raw && typeof raw === "object" && "replay" in raw) {
      const replay = raw.replay as { operation_id?: string };
      if (tool === "generate_ugc" && replay.operation_id) { wake?.(replay.operation_id); return parseToolOutput(tool, await status(replay.operation_id)); }
      return parseToolOutput(tool, replay);
    }
    const read = parseUgcRead(raw);
    const base = { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID() };
    if (tool === "get_generation_status") return parseToolOutput(tool, ugcOperationStatus(read, principal, parseToolInput(tool, command.input)));
    if (tool === "get_ugc_content") {
      const query = parseToolInput(tool, command.input);
      const selected = read.scripts.filter((s) => (!query.script_id || s.id === query.script_id) && (!query.execution_key || s.execution_key === query.execution_key));
      const pageStamp = canonicalHash({ etag: read.ugc_etag, script_id: query.script_id ?? null, execution_key: query.execution_key ?? null });
      let offset = 0;
      if (query.cursor) {
        const match = /^ugc-scripts:([0-9a-f-]+):([a-f0-9]{64}):([0-9]+)$/.exec(query.cursor);
        if (!match || match[1] !== input.product_id || match[2] !== pageStamp || !Number.isSafeInteger(Number(match[3]))) throw new ProductIntelligenceError("CURSOR_EXPIRED", "Los guiones cambiaron. Lee la primera página de nuevo.");
        offset = Number(match[3]);
        if (offset > selected.length) throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no es válido.");
      }
      const page = selected.slice(offset, offset + query.page_size), more = offset + page.length < selected.length;
      const detailed = Boolean(query.script_id), urls = detailed ? await signedUrls(read.shots.filter((s) => selected.some((v) => v.id === s.script_id)).map((s) => s.storage_path).filter((p): p is string => !!p)) : new Map<string, string>();
      // Zod añade ~standard no enumerable; el contrato enviado debe ser JSON puro.
      return parseToolOutput(tool, { ...base, data: { ugc_etag: read.ugc_etag, next_cursor: more ? `ugc-scripts:${input.product_id}:${pageStamp}:${offset + page.length}` : null, truncated: more, scripts: page.map((s) => ({ id: s.id, execution_key: s.execution_key, format: s.format, source: s.source,
        artifact_etag: s.artifact_etag, final_status: s.final_status, has_final_video: Boolean(s.final_storage_path), approved: !!s.approved_at, status: s.status, provenance: s.provenance,
        cost_estimate_usd: s.payload ? scriptCost(s.payload) : null,
        ...(detailed ? { payload: s.payload, shots: read.shots.filter((x) => x.script_id === s.id).map((x) => ({ id: x.id, key: x.key, kind: x.kind, render_status: x.render_status, status: x.status, error: x.error_message, url: x.storage_path ? urls.get(x.storage_path) ?? null : null })) } : {}),
        review_path: productHref(input.product_id, "creativos") })), contract: query.include_contract ? JSON.parse(JSON.stringify(z.toJSONSchema(chatUgcContent))) : null, rules: UGC_RULES, next_action: "Escribe guion y plan, valida con dry_run y guarda con save_ugc_content. Revisa en Creativos > Videos." } });
    }
    if (tool === "get_ugc_montage") {
      const query = parseToolInput(tool, command.input), script = scriptIn(read, query.script_id);
      checkArtifact(query.expected_artifact_etag, script.artifact_etag);
      checkArtifact(script.provenance?.context_stamp as string, read.stamp);
      return parseToolOutput(tool, { ...base, data: { package: await montagePackage(principal.userId, input.product_id, script.id), next_action: "Monta en local con scripts/ugc-montage.py, sube el MP4 y revisa el video en Creativos > Videos." } });
    }
    const query = tool === "save_ugc_content" ? parseToolInput(tool, command.input) : parseToolInput("generate_ugc", command.input);
    checkRevision(query.expected_revision, read.revision);
    let prepared: Record<string, unknown>;
    if ("content" in query) {
      checkArtifact(query.expected_ugc_etag, read.ugc_etag);
      const knowledge = parseKnowledgeRead(await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id }, signal), principal, input.product_id);
      const version = knowledge.strategy;
      if (!version || version.id !== query.strategy_id) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Selecciona la estrategia de este video primero.");
      const strategy = strategyResponse(version, knowledge, input.product_id), plan = storedPricingPlan(knowledge.currentSnapshot.pricing);
      if (!strategy.readiness.ready_for_execution || !plan) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Revisa la estrategia, sus pruebas y Precio y packs antes de guardar el guion.", { missing_fields: strategy.readiness.missing_fields });
      const angle = strategy.snapshot.angles.find((a) => a.id === query.angle_id);
      if (strategy.snapshot.angles.findIndex((a) => a.id === query.angle_id) + 1 !== query.angle_slot) throw new ProductIntelligenceError("INVALID_REFERENCE", "angle_slot debe coincidir con el orden del ángulo seleccionado en la estrategia.");
      if (!angle || angle.generation_guidance?.opening_shot === "real_footage") throw new ProductIntelligenceError("INVALID_REFERENCE", "Ese ángulo no está seleccionado o necesita material real.");
      const product = productContextResponse(knowledge, { product_id: input.product_id, view: "summary", page_size: 50, include_archived: false }, randomUUID());
      if (!product.ok) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Confirma el mercado del producto.");
      const references = imagesForGeneration([...knowledge.currentSnapshot.images].sort((a,b) => a.position-b.position));
      if (!references[0]) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Elige una imagen base del producto.");
      prepared = { payload: buildChatUgc(query, plan), input: { market: product.data.product.market, pricing: plan, labels: knowledge.currentSnapshot.pack_labels?.status === "approved" ? knowledge.currentSnapshot.pack_labels.payload : null,
        angle_name: `${angle.name} · ${query.hook.spoken}`, appearance: isAppearanceCategory(knowledge.currentSnapshot.context?.category ?? ""), base_reference_image_id: references[0].id,
        strategy_snapshot: strategy.snapshot } };
    } else {
      const script = scriptIn(read, query.script_id); checkArtifact(query.expected_artifact_etag, script.artifact_etag);
      if (script.source !== "mcp_chat") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Guarda una versión desde el chat antes de generar por MCP.");
      if (!script.approved_at) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Aprueba este guion en Creativos > Videos antes de generar.");
      if (read.shots.some((s) => s.script_id === script.id && query.shot_keys.includes(s.key) && isShotRecoverable(s))) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "Recupera la toma existente en Videos antes de solicitar una nueva generación.");
      prepared = prepareUgcShots(script, query.stage, query.shot_keys);
      const existingK1 = read.shots.some((s) => s.script_id === script.id && s.key === "K1" && s.render_status === "succeeded");
      if (query.stage === "keyframes" && !query.shot_keys.includes("K1") && !existingK1 && query.shot_keys.some((k) => script.payload.keyframes.find((x) => x.key === k)?.uses_character)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Incluye K1 o genéralo primero para mantener el personaje.");
      const qa = await imageQaEnabled(principal.userId, input.product_id);
      const preview = { ...base, warnings: [], data: { dry_run: true, stage: query.stage, strategy_id: script.provenance?.strategy_id,
        analysis_revision: script.provenance?.analysis_revision, will_call_providers: ["higgsfield", ...(qa && query.stage === "keyframes" ? ["anthropic"] : [])], max_output_items: query.shot_keys.length,
        estimated_usd: prepared.estimated_usd, missing_fields: [] } };
      if (!query.dry_run) {
        if (!await higgsfieldKey(principal.userId)) throw new ProductIntelligenceError("INTEGRATION_NOT_CONNECTED", "Conecta Higgsfield en Ajustes antes de generar.");
        if (qa && query.stage === "keyframes") await requireAiKey(principal.userId);
      }
      prepared.preview = preview;
    }
    const result = await repository.commitUgc({ p_access: access, p_product_id: input.product_id, p_command: { tool, input: query }, p_prepared: prepared, p_stamp: read.stamp, p_hash: hash }, signal);
    if (tool === "generate_ugc" && !query.dry_run) {
      const { operation_id } = result as { operation_id: string }; wake?.(operation_id); return parseToolOutput(tool, await status(operation_id));
    }
    return parseToolOutput(tool, result);
  };
}
/** Revisión del comerciante, con la misma transacción y CAS que la tool. */
export async function reviewUgc(repository: UgcRepository, principal: Principal, productId: string, scriptId: string, action: "approve" | "unapprove" | "edit", expectedEtag: string | undefined, edit?: unknown) {
  const signal = AbortSignal.timeout(10_000), access = contextAccess(principal);
  const read = parseUgcRead(await repository.loadUgc({ p_access: access, p_product_id: productId }, signal)), script = scriptIn(read, scriptId);
  if (script.source === "mcp_chat" && !expectedEtag) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "Recupera la versión del guion antes de decidir.");
  const expected = expectedEtag ?? script.artifact_etag; checkArtifact(expected, script.artifact_etag);
  let payload = script.payload;
  if (action === "edit") {
    const parsed = scriptEditSchema.safeParse(edit);
    if (!parsed.success) throw new ProductIntelligenceError("VALIDATION_ERROR", "Revisa las líneas y los textos del guion.");
    payload = applyScriptEdit(payload, parsed.data);
    const pricing = script.input.pricing as Parameters<typeof scriptProblems>[1];
    const problems = scriptProblems(payload, pricing, script.format);
    if (problems.length) throw new ProductIntelligenceError("VALIDATION_ERROR", problems[0]);
  }
  return repository.commitUgc({ p_access: access, p_product_id: productId, p_command: { tool: "review_ugc", input: { script_id: scriptId, action, expected_artifact_etag: expected, expected_revision: read.revision } },
    p_prepared: { payload }, p_stamp: read.stamp, p_hash: canonicalHash({ scriptId, action, payload } as unknown as JsonValue) }, signal);
}

/** La UI genera con el mismo comando durable que MCP; no crea tomas por su cuenta. */
export async function generateReviewedUgc(repository: KnowledgeRepository & UgcRepository, principal: Principal, productId: string, scriptId: string, stage: "keyframes" | "clips", expectedEtag: string | undefined, key?: string, replace = false, idempotencyKey: string = randomUUID()) {
  const signal = AbortSignal.timeout(10_000), read = parseUgcRead(await repository.loadUgc({ p_access: contextAccess(principal), p_product_id: productId }, signal));
  const script = scriptIn(read, scriptId);
  if (!expectedEtag) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "Recupera la versión del guion antes de generar.");
  const wanted = key ? [key] : stage === "keyframes" ? script.payload.keyframes.map((s) => s.key) : [...script.payload.a_roll, ...script.payload.b_roll].map((s) => s.key);
  const latest = new Map(read.shots.filter((s) => s.script_id === script.id).map((s) => [s.key, s]));
  const keys = replace ? wanted : wanted.filter((k) => !latest.has(k) || latest.get(k)?.render_status === "failed" || latest.get(k)?.status === "rejected");
  if (!keys.length) return null;
  const input = parseToolInput("generate_ugc", { product_id: productId, schema_version: "1.0", expected_revision: read.revision, idempotency_key: idempotencyKey,
    expected_artifact_etag: expectedEtag, script_id: scriptId, stage, shot_keys: keys, replace_existing: replace });
  const result = parseToolOutput("generate_ugc", await createUgcExecutor(repository)(principal, { tool: "generate_ugc", input }, signal));
  if (!result.ok || "dry_run" in result.data) return null;
  return result.data.operation_id;
}
