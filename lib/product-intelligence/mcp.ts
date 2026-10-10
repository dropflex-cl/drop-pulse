import { visualDescriptions } from "./visual-schemas";
import pluginManifest from "../../plugins/dropflex-optimizer/plugin.json";
import { registerOptimizationSkill, SKILLS_EXTENSION } from "./mcp-skills";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ProductIntelligenceError } from "./errors";
import { type Principal } from "./policy";
import { generationContextSchema, inputSchemas, outputSchemas, type ToolInputs, type ToolName } from "./schemas";
import { parseToolInput, parseToolOutput, PI_LIMITS } from "./validation";
import { toolImage } from "./tool-media";
import type { ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { visualReferenceResource, VISUAL_REFERENCE_UI } from "./visual-reference-widget";

export type ToolCommand = { [K in ToolName]: { tool: K; input: ToolInputs[K] } }[ToolName];
/** El servicio ejecutor autoriza/revalida grants y usa la transacción común. */
export type DomainExecutor = (principal: Principal, command: ToolCommand, signal: AbortSignal) => Promise<unknown>;

const descriptions: Record<ToolName, string> = {
  ...visualDescriptions,
  get_shopify_automation: "Lee autorización automática, hooks confirmados, requisitos, huella de la página y estado de publicación en Shopify.",
  authorize_shopify_automation: "Tras la elección y autorización explícita del comerciante en el chat, confirma los hooks exactos de la estrategia y habilita aprobación y publicación automática en Shopify. No lanza Meta Ads. dry_run no autoriza.",
  disable_shopify_automation: "Desactiva la aprobación y publicación automática del producto. Conserva contenido y la página ya publicada.",
  publish_product: "Publica automáticamente en Shopify la página e imágenes aprobadas del producto autorizado, con huella exacta, CAS, dry_run y cola idempotente. Solo tras confirmar hooks y autorizar el flujo automático en el chat.",
  review_visual_record: "Aprueba o selecciona una pieza visual de Shopify sin revisión en el SaaS, solo con automatización autorizada para los hooks vigentes. Valida identidad, dependencias y destino; no cubre Meta ni UGC.",
  list_products: "Lista tus productos con product_id, nombre y descripción breve para elegir cuál optimizar. No requiere conocer un ID; usa el product_id elegido en get_product_context. Paginado con next_cursor; excluye Upsell salvo include_upsell=true.",
  get_pdp_planning_context: "Lee una revisión consistente de estrategia, ángulo, evidencia, contenido y assets para planificar una PDP corta en el chat.",
  get_component_catalog: "Consulta capacidades persuasivas y restricciones de los componentes reales de Shopify.",
  get_angle_persuasion_plan: "Recupera el plan persuasivo de un ángulo, su revisión y etag. No genera estrategia.",
  save_angle_persuasion_plan: "Valida y guarda el argumento, recorrido mínimo de creencias y arquitectura con CAS, dry_run e idempotencia. En modo automático autorizado puede aprobar desde el chat.",
  validate_angle_persuasion_plan: "Comprueba cobertura, atención, compresión, componentes y evidencia sin guardar ni generar contenido.",
  get_landing_experience: "Lee experiencias y sus bindings a variantes existentes, con revisión y etag.",
  save_landing_experience: "Guarda la ejecución del plan sin reescribir copy ni assets. CAS e idempotencia; en modo automático autorizado puede activar desde el chat; publish_product publica en Shopify.",
  generate_gallery_images: "Renderiza tomas de galería guardadas desde chat, con consentimiento landing:generate y estimación explícita. Puede gastar créditos de tus proveedores; no escribe textos ni publica.",
  get_gallery_generation_status: "Consulta la operación y las imágenes guardadas, sin llamar al proveedor. La UI permite elegirlas antes de publicar.",
  get_product_performance: "Lee métricas Meta guardadas por periodo, separadas por moneda y zona horaria. No son pedidos entregados ni cobrados.",
  get_product_learning: "Lee aprendizajes y sus mediciones inmutables, paginados por revisión.",
  save_product_learning: "Guarda una evaluación de una hipótesis con criterios, limitaciones y una copia de métricas comprobadas. No declara ganadores ni cambia estrategia.",
  get_creative_content: "Lee conceptos estáticos y chats publicitarios, contrato y etag. No genera imágenes.",
  save_creative_content: "Guarda textos y dirección de arte desde chat para renderizar y revisar en DropFlex. Reemplaza la propuesta vigente, conserva assets.",
  get_gallery_content: "Lee tomas de galería, esquema y restricciones para planificar imágenes en el chat.",
  save_gallery_content: "Guarda el plan de galería desde chat, sin iniciar render. Conserva las imágenes elegidas.",
  get_event_content: "Lee textos del calendario comercial del producto y su contrato.",
  save_event_content: "Guarda una propuesta de evento desde chat. El comerciante decide su aprobación y publicación.",
  get_usage_tip: "Lee el consejo de uso de WhatsApp y su contrato.",
  save_usage_tip: "Guarda un consejo de uso respaldado por facts verificados, sin llamada de IA.",
  get_ugc_content: "Lee guiones UGC, revisión, etags y contratos reales para escribir guion y plan en el chat.",
  save_ugc_content: "Guarda guion y plan del chat como propuesta, con estrategia, ángulo y hook. Sin redacción de pago ni aprobación.",
  get_ugc_montage: "Recupera el paquete de clips aprobado para el montaje local existente, con URLs que vencen en 24 horas.",
  get_pack_labels: "Consulta precio, propuesta y contrato de las etiquetas de packs para escribirlas en chat.",
  save_pack_labels: "Guarda etiquetas de packs como propuesta vinculada al precio, sin IA; se aprueban automáticamente si el flujo Shopify está autorizado.",
  get_landing_content: "Lee el contrato real de un componente de Shopify, contenido actual, reseñas aprobadas y pricing. Consulta cada componente antes de escribirlo.",
  save_landing_content: "Guarda textos creados en el chat en los componentes de la landing con CAS e idempotencia. Con automatización autorizada quedan aprobados y en uso; publish_product publica la página.",
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
  const server = new Server({ name: "dropflex-product-intelligence", version: pluginManifest.version }, {
    capabilities: { tools: { listChanged: false }, resources: {}, extensions: { [SKILLS_EXTENSION]: {} } },
    instructions: "DropFlex conserva contexto, estrategia, propuestas y decisiones del comerciante. Para optimizar o retomar un producto, utiliza la skill optimize-product si está instalada. Primero recupera contexto y estrategia; permite elegir el hook antes de desarrollar contenido dependiente. Para imágenes, recupera get_visual_generation_context y reutiliza el adjunto canónico si coincide con el producto, ID y hash vigentes. Solo si falta o cambió, usa get_visual_reference_image. Después de continuar desde la tarjeta no repitas esa tool ni otro clic para la misma referencia: adjunta esa imagen canónica como entrada real de edición/generación. Un ID, URL o descripción en texto no sustituye el adjunto. Si faltan tools visuales o el cliente no puede pasar la imagen al generador, explica el bloqueo, pide actualizar la conexión o adjuntar la foto original manualmente una sola vez y detén esa toma sin repetir la tarjeta. Guarda propuestas con sus contratos y revisiones actuales. Tras elegir los hooks, si el comerciante autorizó automatizar Shopify, usa authorize_shopify_automation y continúa sin pedir aprobaciones en el SaaS: guarda planes, contenido, imágenes, revisa las piezas mediante review_visual_record y publica con publish_product. Si no hay esa autorización, conserva revisión manual. Nunca lanza campañas en Meta.",
  });
  registerOptimizationSkill(server, [visualReferenceResource()]);
  const schemas = publishedSchemas();
  const available = options.availableTools ?? Object.keys(inputSchemas) as ToolName[];
  const tools: Tool[] = available.map((name) => ({
    name, description: descriptions[name], inputSchema: schemas[name].input, outputSchema: schemas[name].output,
    ...(name === "get_visual_reference_image" ? { _meta: { ui: { resourceUri: VISUAL_REFERENCE_UI, visibility: ["model", "app"] }, "openai/outputTemplate": VISUAL_REFERENCE_UI, "openai/widgetAccessible": true } } : {}),
    ...(name === "ingest_chatgpt_visual_asset" ? { _meta: { "openai/fileParams": ["file"] } } : {}),
    ...(name === "record_visual_transfer_event" ? { _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true, "openai/visibility": "private" } } : {}),
    annotations: { readOnlyHint: name.startsWith("get_") || name.startsWith("list_") || name.startsWith("validate_"), idempotentHint: true, destructiveHint: ["patch_product_analysis", "save_research", "set_product_strategy", "authorize_shopify_automation", "publish_product"].includes(name), openWorldHint: name.startsWith("generate_") || ["ingest_external_visual_asset", "ingest_chatgpt_visual_asset"].includes(name) || name === "publish_product" },
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
    let image: ImageContent | undefined;
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
        const executed = await Promise.race([execute(actor, { tool: name, input } as ToolCommand, signal), timeout]);
        envelope = parseToolOutput(name, executed);
        image = toolImage(executed);
        if (name === "get_visual_reference_image" && (envelope as { ok: boolean }).ok && !image) {
          throw new ProductIntelligenceError("EXECUTION_NOT_READY", "No pudimos adjuntar la referencia. Descarga la foto original desde DropFlex y adjúntala en el chat antes de generar.");
        }
      } finally { clearTimeout(timer); }
    } catch (error) {
      const domain = error instanceof ProductIntelligenceError ? error.toDomainError() : new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos completar la solicitud. Reintenta con la misma clave si corresponde.").toDomainError();
      envelope = parseToolOutput(name, { ok: false, request_id: randomUUID(), error: domain });
    }
    const result = (payload: unknown, attached?: ImageContent) => {
      const structuredContent = payload as Record<string, unknown>;
      return { structuredContent, content: [{ type: "text" as const, text: JSON.stringify(payload) }, ...(structuredContent.ok === true && attached ? [attached] : [])], isError: structuredContent.ok === false };
    };
    const response = result(envelope, image);
    // El texto duplica structuredContent: medir también la respuesta MCP completa.
    if (new TextEncoder().encode(JSON.stringify(response)).length > PI_LIMITS.outputBytes) return result(parseToolOutput(name, { ok: false, request_id: randomUUID(), error: new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Reduce el tamaño de la página o la selección para recuperar la respuesta completa.", { max_bytes: PI_LIMITS.outputBytes }).toDomainError() }));
    return response;
  });
  return server;
}
