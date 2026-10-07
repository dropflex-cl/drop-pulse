import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ErrorCode, ListResourcesRequestSchema, ReadResourceRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";
export const OPTIMIZATION_SKILL_URI = "skill://dropflex/optimize-product/SKILL.md";
const files = ["SKILL.md", "agents/openai.yaml", "references/strategy-and-hooks.md", "references/production.md"] as const;
const skillRoot = join(process.cwd(), "plugins/dropflex-optimizer/skills/optimize-product");
const listSchema = z.object({ method: z.literal("skills/list"), params: z.object({ cursor: z.string().optional() }).optional() });
const getSchema = z.object({ method: z.literal("skills/get"), params: z.object({ uri: z.string() }) });
const frontmatterSchema = z.strictObject({ name: z.literal("optimize-product"), description: z.string().min(1) });

/** Catálogo estático del paquete; nunca lee un path o URL suministrado por el cliente. */
async function loadBundle() {
  const entries = await Promise.all(files.map(async path => {
    const text = await readFile(join(skillRoot, path), "utf8");
    if (Buffer.byteLength(text) > 64 * 1024) throw new Error("El recurso de la skill supera el límite del servidor.");
    return { uri: `skill://dropflex/optimize-product/${path}`, text, digest: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` };
  }));
  // El paquete usa únicamente dos campos escalares en YAML; rechaza ampliaciones sin adaptar el parser.
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(entries[0].text)?.[1];
  if (!header) throw new Error("La skill no tiene frontmatter.");
  const frontmatter = frontmatterSchema.parse(Object.fromEntries(header.split(/\r?\n/).map(line => {
    const separator = line.indexOf(":");
    const key = line.slice(0, separator).trim(), value = line.slice(separator + 1).trim();
    if (separator < 1 || !value) throw new Error("Frontmatter de skill no válido.");
    return [key, value.startsWith('"') ? JSON.parse(value) as unknown : value];
  })));
  return { entries, skill: { uri: OPTIMIZATION_SKILL_URI, frontmatter, resources: entries.map(({ uri, digest }) => ({ uri, digest })) } };
}
let bundle: ReturnType<typeof loadBundle> | undefined;
function getBundle() {
  // Un fallo transitorio no envenena lecturas posteriores.
  return bundle ??= loadBundle().catch(error => { bundle = undefined; throw error; });
}
function rejectCursor(cursor?: string) {
  if (cursor !== undefined) throw new McpError(ErrorCode.InvalidParams, "El catálogo de skills no tiene una página posterior.");
}

export function registerOptimizationSkill(server: Server, uiResources: { uri: string; name: string; mimeType: string; text: string; _meta: Record<string, unknown> }[] = []) {
  server.setRequestHandler(listSchema, async request => {
    rejectCursor(request.params?.cursor);
    return { skills: [(await getBundle()).skill] };
  });
  server.setRequestHandler(getSchema, async request => {
    if (request.params.uri !== OPTIMIZATION_SKILL_URI) throw new McpError(ErrorCode.InvalidParams, "La skill solicitada no existe.");
    return { skill: (await getBundle()).skill };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async request => {
    rejectCursor(request.params?.cursor);
    return { resources: [...(await getBundle()).entries.map(({ uri }) => ({ uri, name: uri.slice(uri.lastIndexOf("/") + 1), mimeType: uri.endsWith(".yaml") ? "application/yaml" : "text/markdown" })), ...uiResources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType }))] };
  });
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const ui = uiResources.find(resource => resource.uri === request.params.uri);
    if (ui) return { contents: [ui] };
    // Comprueba la allowlist antes de acceder al disco, incluso si el paquete no está instalado.
    if (!files.some(path => request.params.uri === `skill://dropflex/optimize-product/${path}`)) throw new McpError(ErrorCode.InvalidParams, "El recurso solicitado no existe.");
    const entry = (await getBundle()).entries.find(item => item.uri === request.params.uri)!;
    return { contents: [{ uri: entry.uri, mimeType: entry.uri.endsWith(".yaml") ? "application/yaml" : "text/markdown", text: entry.text }] };
  });
}
