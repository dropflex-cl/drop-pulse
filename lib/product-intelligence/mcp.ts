import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ProductIntelligenceError } from "./errors";
import { type Principal } from "./policy";
import { generationContextSchema, inputSchemas, outputSchemas, type ToolInputs, type ToolName } from "./schemas";
import { parseToolInput, parseToolOutput, PI_LIMITS } from "./validation";

export type ToolCommand = { [K in ToolName]: { tool: K; input: ToolInputs[K] } }[ToolName];
/** El servicio ejecutor autoriza/revalida grants y usa la transacción común. */
export type DomainExecutor = (principal: Principal, command: ToolCommand, signal: AbortSignal) => Promise<unknown>;

const descriptions: Record<ToolName, string> = {
  generate_gallery_images: "Renderiza tomas de galería guardadas desde chat, con consentimiento landing:generate y estimación explícita. Puede gastar créditos de tus proveedores; no escribe textos ni publica.",
  get_gallery_generation_status: "Consulta la operación y las imágenes guardadas, sin llamar al proveedor. La UI permite elegirlas antes de publicar.",
  get_product_performance: "Lee métricas Meta guardadas por periodo, separadas por moneda y zona horaria. No son pedidos entregados ni cobrados.",
  get_product_learning: "Lee aprendizajes y sus mediciones inmutables, paginados por revisión.",
  save_product_learning: "Guarda una evaluación de una hipótesis con criterios, limitaciones y una copia de métricas comprobadas. No declara ganadores ni cambia estrategia.",
  get_creative_content: "Lee conceptos estáticos y chats publicitarios, contrato y etag. No genera imágenes.",
  save_creative_content: "Guarda textos y dirección de arte desde chat para renderizar y revisar en DropFlex. Reemplaza la propuesta vigente, conserva assets.",
  get_gallery_content: "Lee tomas de galería y el contrato del director de imágenes.",
  save_gallery_content: "Guarda el plan de galería desde chat, sin iniciar render. Conserva las imágenes elegidas.",
  get_event_content: "Lee textos del calendario comercial del producto y su contrato.",
  save_event_content: "Guarda una propuesta de evento desde chat. El comerciante decide su aprobación y publicación.",
  get_usage_tip: "Lee el consejo de uso de WhatsApp y su contrato.",
  save_usage_tip: "Guarda un consejo de uso respaldado por facts verificados, sin llamada de IA.",
  get_ugc_content: "Lee guiones UGC, revisión, etags y contratos reales para escribir guion y plan en el chat.",
  save_ugc_content: "Guarda guion y plan del chat como propuesta, con estrategia, ángulo y hook. Sin redacción de pago ni aprobación.",
  get_ugc_montage: "Recupera el paquete de clips aprobado para el montaje local existente, con URLs que vencen en 24 horas.",
  get_pack_labels: "Consulta precio, propuesta y contrato de las etiquetas de packs para escribirlas en chat.",
  save_pack_labels: "Guarda etiquetas de packs como propuesta vinculada al precio, sin IA, aprobación ni publicación.",
  get_landing_content: "Lee el contrato real de un componente de Shopify, contenido actual, reseñas aprobadas y pricing. Consulta cada componente antes de escribirlo.",
  save_landing_content: "Guarda textos creados en el chat en los componentes de la landing como propuestas por revisar. Merge atómico con CAS e idempotencia; sin IA, imágenes ni publicación.",
  get_product_context: "Recupera producto, pricing, conocimiento y selección en una revisión consistente.",
  save_product_context: "Guarda contexto y recalcula Precio y packs sin IA ni publicación.",
  save_product_analysis: "Guarda hipótesis y relaciones del chat por merge, sin seleccionar ni generar.",
  patch_product_analysis: "Aplica un batch tipado sobre el análisis, todo o nada.",
  save_research: "Guarda fuentes, facts y evidencia; revisar estados sensibles requiere verify.",
  set_product_strategy: "Crea una versión de decisión explícita; seleccionar no demuestra un ganador.",
  get_product_strategy: "Recupera la selección y sus restricciones vigentes para ejecutar contenido.",
  generate_ugc: "Genera imágenes clave o clips de un guion aprobado; dry_run informa costo. Puede gastar créditos de Higgsfield.",
  get_generation_status: "Lee estado, outputs y costo registrado sin sondear proveedores.",
};

export function publishedSchemas() {
  const root = (schema: z.ZodType, io: "input" | "output"): Tool["inputSchema"] => {
    const { properties, ...json } = z.toJSONSchema(schema, { target: "draft-2020-12", io, reused: "ref" });
    const objectProperties: Record<string, object> = {};
    for (const [name, value] of Object.entries(properties ?? {})) {
      if (!value || typeof value !== "object") throw new Error("El SDK requiere schemas objeto para las propiedades raíz.");
      objectProperties[name] = value;
    }
    return { ...json, type: "object", ...(properties ? { properties: objectProperties } : {}) };
  };
  const result = {} as Record<ToolName, { input: Tool["inputSchema"]; output: NonNullable<Tool["outputSchema"]> }>;
  for (const name of Object.keys(inputSchemas) as ToolName[]) result[name] = { input: root(inputSchemas[name], "input"), output: root(outputSchemas[name], "output") };
  return result;
}

export function generationContextJsonSchema() { return z.toJSONSchema(generationContextSchema, { target: "draft-2020-12" }); }

/** Instancia por actor/request. Usa Server oficial: McpServer 1.32 pierde unions raíz en discovery. */
export function createProductIntelligenceServer(principal: Principal, execute: DomainExecutor, options: { requestTimeoutMs?: number; availableTools?: readonly ToolName[] } = {}): Server {
  const timeoutMs = options.requestTimeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) throw new Error("El timeout MCP debe estar entre 1 y 15000 ms.");
  const actor: Principal = Object.freeze({ ...principal, scopes: Object.freeze([...principal.scopes]) });
  const server = new Server({ name: "dropflex-product-intelligence", version: "1.0.0" }, { capabilities: { tools: { listChanged: false } } });
  const schemas = publishedSchemas();
  const available = options.availableTools ?? Object.keys(inputSchemas) as ToolName[];
  const tools: Tool[] = available.map((name) => ({
    name, description: descriptions[name], inputSchema: schemas[name].input, outputSchema: schemas[name].output,
    annotations: { readOnlyHint: name.startsWith("get_"), idempotentHint: true, destructiveHint: ["patch_product_analysis", "save_research", "set_product_strategy"].includes(name), openWorldHint: name.startsWith("generate_") },
  }));
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const cursor = request.params?.cursor;
    if (cursor && !/^pi-tools-v1:(?:0|[1-9][0-9]*)$/.test(cursor)) throw new McpError(ErrorCode.InvalidParams, "El cursor de tools no es válido.");
    const offset = cursor ? Number(cursor.split(":")[1]) : 0;
    if (!Number.isSafeInteger(offset) || offset >= tools.length && offset !== 0) throw new McpError(ErrorCode.InvalidParams, "El cursor de tools venció.");
    const page: Tool[] = [];
    let index = offset;
    while (index < tools.length) {
      const candidate = [...page, tools[index]];
      if (new TextEncoder().encode(JSON.stringify({ tools: candidate, nextCursor: `pi-tools-v1:${index + 1}` })).length > PI_LIMITS.outputBytes) break;
      page.push(tools[index++]);
    }
    if (!page.length) throw new McpError(ErrorCode.InternalError, "Un contrato supera el presupuesto de discovery.");
    return { tools: page, ...(index < tools.length ? { nextCursor: `pi-tools-v1:${index}` } : {}) };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = request.params.name;
    if (!Object.hasOwn(inputSchemas, tool)) throw new McpError(ErrorCode.InvalidParams, "La tool solicitada no existe.");
    const name = tool as ToolName;
    let envelope: unknown;
    try {
      if (!available.includes(name)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación todavía está en implementación.");
      const input = parseToolInput(name, request.params.arguments ?? {});
      const deadline = new AbortController();
      const signal = AbortSignal.any([extra.signal, deadline.signal]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ProductIntelligenceError("INTERNAL_ERROR", "La solicitud excedió el tiempo disponible. Reintenta con la misma clave; no inicies otra operación.", {}, true));
          deadline.abort();
        }, timeoutMs);
      });
      try {
        envelope = parseToolOutput(name, await Promise.race([execute(actor, { tool: name, input } as ToolCommand, signal), timeout]));
      } finally { clearTimeout(timer); }
    } catch (error) {
      const domain = error instanceof ProductIntelligenceError ? error.toDomainError() : new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos completar la solicitud. Reintenta con la misma clave si corresponde.").toDomainError();
      envelope = parseToolOutput(name, { ok: false, request_id: randomUUID(), error: domain });
    }
    const result = (payload: unknown) => {
      const structuredContent = payload as Record<string, unknown>;
      return { structuredContent, content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError: structuredContent.ok === false };
    };
    const response = result(envelope);
    // El texto duplica structuredContent: medir también la respuesta MCP completa.
    if (new TextEncoder().encode(JSON.stringify(response)).length > PI_LIMITS.outputBytes) return result(parseToolOutput(name, { ok: false, request_id: randomUUID(), error: new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Reduce el tamaño de la página o la selección para recuperar la respuesta completa.", { max_bytes: PI_LIMITS.outputBytes }).toDomainError() }));
    return response;
  });
  return server;
}
