import { visualDescriptions } from "./visual-schemas";
import pluginManifest from "../../plugins/dropflex-optimizer/plugin.json";
import { registerOptimizationSkill, SKILLS_EXTENSION } from "./mcp-skills";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ProductIntelligenceError } from "./errors";
import { type Principal } from "./policy";
import {
  generationContextSchema,
  inputSchemas,
  outputSchemas,
  type ToolInputs,
  type ToolName,
} from "./schemas";
import { parseToolInput, parseToolOutput, PI_LIMITS } from "./validation";
import { toolImage } from "./tool-media";
import type { ImageContent } from "@modelcontextprotocol/sdk/types.js";
import {
  visualReferenceResource,
  VISUAL_REFERENCE_UI,
} from "./visual-reference-widget";

export type ToolCommand = {
  [K in ToolName]: { tool: K; input: ToolInputs[K] };
}[ToolName];
/** El servicio ejecutor autoriza/revalida grants y usa la transacción común. */
export type DomainExecutor = (
  principal: Principal,
  command: ToolCommand,
  signal: AbortSignal,
) => Promise<unknown>;

const descriptions: Record<ToolName, string> = {
  ...visualDescriptions,
  get_shopify_automation:
    "Lee autorización automática, hooks confirmados, requisitos, huella de la página y estado de publicación en Shopify.",
  authorize_shopify_automation:
    "Tras la elección y autorización explícita del comerciante en el chat, confirma los hooks exactos de la estrategia y habilita publicación automática en Shopify. Guardar contenido lo deja disponible sin aprobación adicional. No lanza Meta Ads. dry_run no autoriza.",
  disable_shopify_automation:
    "Desactiva la publicación automática del producto. Guardar contenido lo deja disponible sin aprobación adicional. Conserva contenido y la página ya publicada.",
  publish_product:
    "Publica en Shopify el contenido vigente y las imágenes seleccionadas del producto autorizado. Comprueba contenido, archivos, destinos, conexión y permisos; mantiene concurrencia e idempotencia internas. dry_run comprueba sin publicar. Requiere autorización propia de publicación.",
  review_visual_record:
    "Selecciona, quita de uso, descarta o archiva una pieza por decisión explícita. Alias compatible: approve y reopen no son pasos necesarios después de guardar. Seleccionar valida archivo, destino y formato. No publica ni lanza campañas.",
  list_products:
    "Lista tus productos con product_id, nombre y descripción breve para elegir cuál optimizar. No requiere conocer un ID; usa el product_id elegido en get_product_context. Paginado con next_cursor; excluye Upsell salvo include_upsell=true.",
  get_pdp_planning_context:
    "Lee una revisión consistente de estrategia, ángulo, evidencia, contenido y assets para planificar una PDP corta en el chat.",
  get_component_catalog:
    "Consulta capacidades persuasivas y restricciones de los componentes reales de Shopify.",
  get_angle_persuasion_plan:
    "Recupera el plan persuasivo vigente de un ángulo. Las revisiones y etags son metadatos de concurrencia interna. No genera estrategia.",
  save_angle_persuasion_plan:
    "Valida y guarda el argumento, recorrido mínimo de creencias y arquitectura vigentes. Guardar deja el plan disponible sin aprobación adicional; dry_run valida sin guardar. La concurrencia e idempotencia se resuelven internamente.",
  validate_angle_persuasion_plan:
    "Comprueba cobertura, atención, compresión, componentes y evidencia sin guardar ni generar contenido.",
  get_landing_experience:
    "Lee experiencias comerciales por ángulo o hook, variantes, imágenes asignadas, visibilidad y orden. Los metadatos técnicos no son versiones que el comerciante deba administrar.",
  save_landing_experience:
    "Guarda la experiencia vigente con variantes existentes, selección de imágenes, visibilidad y orden. Sus asignaciones actualizan el mismo contenido efectivo que usa la UI. No requiere aprobar el plan; guardar no publica. publish_product publica con autorización propia.",
  generate_gallery_images:
    "Renderiza tomas de galería guardadas desde chat, con consentimiento landing:generate y estimación explícita. Puede gastar créditos de tus proveedores; no escribe textos ni publica.",
  get_gallery_generation_status:
    "Consulta la operación y las imágenes guardadas, sin llamar al proveedor. La UI permite elegirlas antes de publicar.",
  get_product_performance:
    "Lee métricas Meta guardadas por periodo, separadas por moneda y zona horaria. No son pedidos entregados ni cobrados.",
  get_product_learning:
    "Lee aprendizajes y sus mediciones inmutables, paginados por revisión.",
  save_product_learning:
    "Guarda una evaluación de una hipótesis con criterios, limitaciones y una copia de métricas comprobadas. No declara ganadores ni cambia estrategia.",
  get_creative_content:
    "Lee conceptos estáticos y chats publicitarios, contrato y etag. No genera imágenes.",
  save_creative_content:
    "Actualiza textos y dirección de arte vigentes desde el chat y conserva archivos y descartes. Guardar los deja disponibles; renderizar requiere un pedido explícito y puede gastar créditos.",
  get_gallery_content:
    "Lee tomas de galería, esquema y restricciones para planificar imágenes en el chat.",
  save_gallery_content:
    "Guarda el plan de galería desde chat, sin iniciar render. Conserva las imágenes elegidas.",
  get_event_content:
    "Lee textos del calendario comercial del producto y su contrato.",
  save_event_content:
    "Actualiza los textos vigentes de un evento desde el chat, conservando descartes. Guardar los deja disponibles; publicar es una acción aparte.",
  get_usage_tip: "Lee el consejo de uso de WhatsApp y su contrato.",
  save_usage_tip:
    "Actualiza el consejo de uso vigente con referencias opcionales, conservando descartes. Guardar lo deja disponible sin llamada de IA.",
  get_ugc_content:
    "Lee guiones UGC vigentes, medios existentes y contratos reales para escribir guion y plan en el chat. La concurrencia es interna.",
  save_ugc_content:
    "Actualiza el guion y plan vigentes del chat, con estrategia, ángulo y hook. Conserva medios y decisiones existentes sin aprobación adicional. No inicia generación de pago ni publica.",
  get_ugc_montage:
    "Recupera clips, voz, cierre, dirección de arte y referencias del guion para editar con la skill local dropflex-capcut. URLs válidas 24 horas; no renderiza ni llama a proveedores.",
  get_pack_labels:
    "Consulta precio, etiquetas vigentes de packs y su contrato para editarlas en el chat.",
  save_pack_labels:
    "Actualiza las etiquetas vigentes de packs sin IA ni aprobación adicional. Conserva descartes; cambiar el precio no desactiva las etiquetas guardadas.",
  get_landing_content:
    "Lee el contrato real de un componente de Shopify, contenido vigente, reseñas utilizables y precio. listing incluye los tres beneficios principales antes del selector de packs (gallery_benefits). Consulta cada componente antes de escribirlo. Incluye estado vacío y visibilidad; respeta las secciones ocultas y los descartes.",
  save_landing_content:
    "Actualiza los componentes vigentes de la PDP sin aprobación adicional ni autorización de publicación. Admite {state: empty} salvo en listing, incluidos sus beneficios en listing.gallery_benefits. enabled cambia la visibilidad explícitamente; omitirlo conserva ocultos y descartes. Omitir imágenes conserva las selecciones; images: [] las vacía. UI y MCP editan la misma fila. Publicar es una acción aparte.",
  get_product_context:
    "Recupera producto, pricing, conocimiento y selección en una revisión consistente.",
  save_product_context:
    "Guarda contexto y recalcula Precio y packs sin IA ni publicación.",
  save_product_analysis:
    "Guarda hipótesis y relaciones del chat por merge, sin seleccionar ni generar.",
  patch_product_analysis:
    "Aplica un batch tipado sobre el análisis, todo o nada.",
  save_research:
    "Guarda fuentes, facts y evidencia; revisar estados sensibles requiere verify.",
  set_product_strategy:
    "Actualiza la estrategia vigente y las decisiones explícitas sobre ángulos y hooks. Conserva el contenido y las imágenes elegidas; no regenera ni publica. Seleccionar no demuestra un ganador.",
  get_product_strategy:
    "Recupera la selección y sus restricciones vigentes para ejecutar contenido.",
  generate_ugc:
    "Genera imágenes clave o clips de un guion guardado cuando el comerciante lo pide. No requiere aprobar el guion ni los medios elegidos. dry_run informa costo sin generar; puede gastar créditos de Higgsfield.",
  get_generation_status:
    "Lee estado, outputs y costo registrado sin sondear proveedores.",
};

export function publishedSchemas() {
  const root = (
    schema: z.ZodType,
    io: "input" | "output",
  ): Tool["inputSchema"] => {
    const { properties, ...json } = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io,
      reused: "ref",
      override: ({ path, jsonSchema }) => {
        // La clave omitida se crea por pedido; el cliente no debe reutilizar un default exportado.
        if (io === "input" && path.includes("idempotency_key")) delete jsonSchema.default;
      },
    });
    const objectProperties: Record<string, object> = {};
    for (const [name, value] of Object.entries(properties ?? {})) {
      if (!value || typeof value !== "object")
        throw new Error(
          "El SDK requiere schemas objeto para las propiedades raíz.",
        );
      objectProperties[name] = value;
    }
    return {
      ...json,
      type: "object",
      ...(properties ? { properties: objectProperties } : {}),
    };
  };
  const result = {} as Record<
    ToolName,
    { input: Tool["inputSchema"]; output: NonNullable<Tool["outputSchema"]> }
  >;
  for (const name of Object.keys(inputSchemas) as ToolName[])
    result[name] = {
      input: root(inputSchemas[name], "input"),
      output: root(outputSchemas[name], "output"),
    };
  return result;
}

export function generationContextJsonSchema() {
  return z.toJSONSchema(generationContextSchema, { target: "draft-2020-12" });
}

// Solo contratos estáticos: nunca comparte principal, grants, datos ni respuestas de tools.
let serverSchemas: ReturnType<typeof publishedSchemas> | undefined;
const discoveryToolBytes = new Map<ToolName, number>();

/** Instancia por actor/request. Usa Server oficial: McpServer 1.32 pierde unions raíz en discovery. */
export function createProductIntelligenceServer(
  principal: Principal,
  execute: DomainExecutor,
  options: {
    requestTimeoutMs?: number;
    availableTools?: readonly ToolName[];
  } = {},
): Server {
  const timeoutMs = options.requestTimeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000)
    throw new Error("El timeout MCP debe estar entre 1 y 15000 ms.");
  const actor: Principal = Object.freeze({
    ...principal,
    scopes: Object.freeze([...principal.scopes]),
  });
  const server = new Server(
    { name: "dropflex-product-intelligence", version: pluginManifest.version },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: {},
        extensions: { [SKILLS_EXTENSION]: {} },
      },
      instructions:
        "DropFlex conserva contexto, estrategia, propuestas y decisiones del comerciante. Prioriza psicología del consumidor, valor percibido, JTBD, AIDA, CRO, AOV y utilidad real de pedidos contra entrega. Explora regalos, efecto GRATIS, bundles, anclaje y variantes de copy con criterio comercial; distingue simulaciones de la oferta vigente que se guarda y publica. En este flujo de optimización no busques, consultes ni cites leyes locales, regulación, SERNAC u otros organismos reguladores. El país y la categoría del producto no habilitan investigación jurídica. No agregues auditorías normativas ni advertencias legales al trabajo comercial. Si buscas información en internet, hazlo exclusivamente para complementar información del producto: características, materiales, funcionamiento, medidas, compatibilidad, uso, documentación del fabricante o proveedor y comparaciones de productos. No amplíes las búsquedas a legislación ni cumplimiento normativo; registra las fuentes y distingue datos documentados de hipótesis. Desarrolla el contenido comercial solicitado sin exigir pruebas reales, facts verificados, reseñas aprobadas ni material manual. Las fuentes y los estados de investigación son procedencia opcional, no requisitos de guardado o uso. No dejes bloques vacíos por falta de evidencia. Usa imágenes disponibles o generadas en cualquier bloque compatible. Para optimizar o retomar un producto, utiliza la skill optimize-product si está instalada. Primero recupera contexto y estrategia; permite elegir el hook antes de desarrollar contenido dependiente. Por defecto, la galería combina fotografía del producto con texto integrado en la imagen, titulares dominantes y composiciones variadas legibles en móvil; cada pieza aporta un argumento distinto de la estrategia. Guarda el texto exacto y su ubicación en el plan visual y pásalos al generador en la instrucción de la toma. Desarrolla los beneficios y argumentos del pedido; la oferta operativa y las condiciones de pago y envío se leen del contexto vigente. Respeta un pedido explícito de fotos sin texto. Revisa texto, variedad y fidelidad antes de completar la galería. La revisión automática pagada de imágenes está retirada. Si detectas un fallo visual, informa qué corregir y conserva las decisiones de uso; regenerar o descartar requiere un pedido explícito del comerciante. La autorización del lote o de publicación en Shopify no autoriza intentos adicionales por QA. Para imágenes, recupera get_visual_generation_context y reutiliza el adjunto canónico si coincide con el producto, ID y hash vigentes. Solo si falta o cambió, usa get_visual_reference_image. En ChatGPT, al mostrar la tarjeta sin adjunto, termina el turno con Pulsa Usar referencia y continuar para seguir. No llames más herramientas ni diagnostiques un archivo inaccesible antes del clic. El botón comparte el archivo en un nuevo turno: retoma entonces el último pedido autorizado sin pedir que lo repitan. Después de continuar desde la tarjeta no repitas esa tool ni otro clic para la misma referencia: adjunta esa imagen canónica como entrada real de edición/generación. Un ID, URL o descripción en texto no sustituye el adjunto. Si faltan tools visuales o el cliente no puede pasar la imagen al generador, explica el bloqueo, pide actualizar la conexión o adjuntar la foto original manualmente una sola vez y detén esa toma sin repetir la tarjeta. Para guardar una imagen ya generada, adjunta el archivo al parámetro nativo file de ingest_chatgpt_visual_asset: el host entrega download_url y file_id opaco; el servidor descarga los bytes. No inventes ni normalices ese ID. Usa un ticket firmado solo si puedes transferir los bytes por PUT; preparar el ticket no inicia la ingestión. Un fallo de transferencia no requiere regenerar la imagen. Confirma succeeded y asset_id antes de declarar guardado. El MCP guarda el contenido vigente y la UI representa esos mismos datos. Guardar contenido válido lo deja disponible sin aprobación adicional, aun sin autorización de publicación. Selecciona o asigna imágenes mediante bind_visual_asset; no llames review_visual_record para aprobar lo recién guardado. Esa tool queda para decisiones explícitas de uso o descarte y clientes anteriores. Conserva las secciones ocultas, descartes, imágenes omitidas y el orden elegido. Editar contexto, estrategia, hooks, precio o políticas no desactiva contenido existente ni exige reconciliar planes o archivos. Solo cambia, regenera o gasta créditos cuando el comerciante lo pide. Las variantes por ángulo o hook son alternativas comerciales; el historial no decide disponibilidad. Usa get_pdp_completion_report para identificar contenido y medios pendientes. get_component_generation_context reúne el hook primario, contrato del tema, tarea argumental distinta y copy vecino; desarrolla una razón propia por componente dentro de esa dirección. Para imágenes solicitadas, usa la base real y destinos landing_component por variante, slot y posición; no crees una experiencia para desbloquearlos. El servidor resuelve revisiones, etags, stamps y concurrencia: puedes omitir los parámetros técnicos y no pedir al comerciante administrarlos. Tras elegir los hooks, si el comerciante autorizó automatizar Shopify, usa authorize_shopify_automation, guarda o selecciona el contenido necesario y publica con publish_product. Publicar requiere su autorización propia y comprueba contenido necesario, archivos, destinos, conexión y permisos reales. Nunca lanza campañas en Meta.",
    },
  );
  registerOptimizationSkill(server, [visualReferenceResource()]);
  const schemas = serverSchemas ??= publishedSchemas();
  const available =
    options.availableTools ?? (Object.keys(inputSchemas) as ToolName[]);
  const tools: Tool[] = available.map((name) => ({
    name,
    description: descriptions[name],
    inputSchema: schemas[name].input,
    outputSchema: schemas[name].output,
    ...(["get_visual_reconciliation_context", "save_visual_reconciliation"].includes(name)
      ? { _meta: { "dropflex/deprecated": true, "dropflex/replacedBy": name === "get_visual_reconciliation_context" ? "get_visual_generation_plan" : "save_visual_generation_plan" } }
      : {}),
    ...(name === "get_visual_reference_image"
      ? {
          _meta: {
            ui: {
              resourceUri: VISUAL_REFERENCE_UI,
              visibility: ["model", "app"],
            },
            "openai/outputTemplate": VISUAL_REFERENCE_UI,
            "openai/widgetAccessible": true,
          },
        }
      : {}),
    ...(name === "ingest_chatgpt_visual_asset"
      ? { _meta: { "openai/fileParams": ["file"] } }
      : {}),
    ...(name === "record_visual_transfer_event"
      ? {
          _meta: {
            ui: { visibility: ["app"] },
            "openai/widgetAccessible": true,
            "openai/visibility": "private",
          },
        }
      : {}),
    annotations: {
      readOnlyHint:
        name.startsWith("get_") ||
        name.startsWith("list_") ||
        name.startsWith("validate_"),
      idempotentHint: true,
      destructiveHint: [
        "patch_product_analysis",
        "save_research",
        "set_product_strategy",
        "authorize_shopify_automation",
        "publish_product",
      ].includes(name),
      openWorldHint:
        name.startsWith("generate_") ||
        [
          "ingest_external_visual_asset",
          "ingest_chatgpt_visual_asset",
        ].includes(name) ||
        name === "publish_product",
    },
  }));
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const cursor = request.params?.cursor;
    if (cursor && !/^pi-tools-v1:(?:0|[1-9][0-9]*)$/.test(cursor))
      throw new McpError(
        ErrorCode.InvalidParams,
        "El cursor de tools no es válido.",
      );
    const offset = cursor ? Number(cursor.split(":")[1]) : 0;
    if (
      !Number.isSafeInteger(offset) ||
      (offset >= tools.length && offset !== 0)
    )
      throw new McpError(ErrorCode.InvalidParams, "El cursor de tools venció.");
    const page: Tool[] = [];
    let index = offset;
    let pageBytes = 0;
    while (index < tools.length) {
      const tool = tools[index];
      const name = tool.name as ToolName;
      let toolBytes = discoveryToolBytes.get(name);
      if (toolBytes === undefined) {
        toolBytes = Buffer.byteLength(JSON.stringify(tool));
        discoveryToolBytes.set(name, toolBytes);
      }
      // Mismo JSON y cortes de página que antes, sin volver a serializar todos los contratos
      // acumulados por cada candidato. La coma entre herramientas también cuenta en UTF-8.
      const candidateBytes = pageBytes + toolBytes + (page.length ? 1 : 0);
      if (
        candidateBytes + Buffer.byteLength(
          JSON.stringify({
            tools: [],
            nextCursor: `pi-tools-v1:${index + 1}`,
          }),
        ) > PI_LIMITS.outputBytes
      )
        break;
      page.push(tools[index++]);
      pageBytes = candidateBytes;
    }
    if (!page.length)
      throw new McpError(
        ErrorCode.InternalError,
        "Un contrato supera el presupuesto de discovery.",
      );
    return {
      // Transportes en memoria pueden entregar referencias directas al cliente.
      // La respuesta conserva su mutabilidad sin exponer la caché privada compartida.
      tools: structuredClone(page),
      ...(index < tools.length ? { nextCursor: `pi-tools-v1:${index}` } : {}),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = request.params.name;
    if (!Object.hasOwn(inputSchemas, tool))
      throw new McpError(
        ErrorCode.InvalidParams,
        "La tool solicitada no existe.",
      );
    const name = tool as ToolName;
    let envelope: unknown;
    let image: ImageContent | undefined;
    try {
      if (!available.includes(name))
        throw new ProductIntelligenceError(
          "EXECUTION_NOT_READY",
          "Esta operación todavía está en implementación.",
        );
      const input = parseToolInput(name, request.params.arguments ?? {});
      const deadline = new AbortController();
      const signal = AbortSignal.any([extra.signal, deadline.signal]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProductIntelligenceError(
              "INTERNAL_ERROR",
              "La solicitud excedió el tiempo disponible. Reintenta con la misma clave; no inicies otra operación.",
              {},
              true,
            ),
          );
          deadline.abort();
        }, timeoutMs);
      });
      try {
        const executed = await Promise.race([
          execute(actor, { tool: name, input } as ToolCommand, signal),
          timeout,
        ]);
        envelope = parseToolOutput(name, executed);
        image = toolImage(executed);
        if (
          name === "get_visual_reference_image" &&
          (envelope as { ok: boolean }).ok &&
          !image
        ) {
          throw new ProductIntelligenceError(
            "EXECUTION_NOT_READY",
            "No pudimos adjuntar la referencia. Descarga la foto original desde DropFlex y adjúntala en el chat antes de generar.",
          );
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const domain =
        error instanceof ProductIntelligenceError
          ? error.toDomainError()
          : new ProductIntelligenceError(
              "INTERNAL_ERROR",
              "No pudimos completar la solicitud. Reintenta con la misma clave si corresponde.",
            ).toDomainError();
      envelope = parseToolOutput(name, {
        ok: false,
        request_id: randomUUID(),
        error: domain,
      });
    }
    const result = (payload: unknown, attached?: ImageContent) => {
      const structuredContent = payload as Record<string, unknown>;
      return {
        structuredContent,
        content: [
          { type: "text" as const, text: JSON.stringify(payload) },
          ...(structuredContent.ok === true && attached ? [attached] : []),
        ],
        isError: structuredContent.ok === false,
      };
    };
    const response = result(envelope, image);
    // El texto duplica structuredContent: medir también la respuesta MCP completa.
    if (
      new TextEncoder().encode(JSON.stringify(response)).length >
      PI_LIMITS.outputBytes
    )
      return result(
        parseToolOutput(name, {
          ok: false,
          request_id: randomUUID(),
          error: new ProductIntelligenceError(
            "RESPONSE_TOO_LARGE",
            "Reduce el tamaño de la página o la selección para recuperar la respuesta completa.",
            { max_bytes: PI_LIMITS.outputBytes },
          ).toDomainError(),
        }),
      );
    return response;
  });
  return server;
}
