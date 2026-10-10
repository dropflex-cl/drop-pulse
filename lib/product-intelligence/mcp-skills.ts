import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ErrorCode, ListResourcesRequestSchema, ReadResourceRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";
export const OPTIMIZATION_SKILL_URI = "skill://dropflex/optimize-product/SKILL.md";
export const EBOOK_SKILL_URI = "skill://dropflex/create-gift-ebook/SKILL.md";
const packages = [
  { name: "optimize-product", files: ["SKILL.md", "agents/openai.yaml", "references/strategy-and-hooks.md", "references/production.md"] },
  { name: "create-gift-ebook", files: ["SKILL.md", "agents/openai.yaml", "references/pdf-production.md", "scripts/build_ebook.py"] },
] as const;
const skillRoot = join(process.cwd(), "plugins/dropflex-optimizer/skills");
const resourceUris = packages.flatMap(pkg => pkg.files.map(path => `skill://dropflex/${pkg.name}/${path}`));
const listSchema = z.object({ method: z.literal("skills/list"), params: z.object({ cursor: z.string().optional() }).optional() });
const getSchema = z.object({ method: z.literal("skills/get"), params: z.object({ uri: z.string() }) });
const frontmatterSchema = z.strictObject({ name: z.enum(["optimize-product", "create-gift-ebook"]), description: z.string().min(1), metadata: z.strictObject({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }) });
const mimeType = (uri: string) => uri.endsWith(".yaml") ? "application/yaml" : uri.endsWith(".py") ? "text/x-python" : "text/markdown";

/** Catálogo estático del paquete; nunca lee un path o URL suministrado por el cliente. */
async function loadBundle() {
  const bundles = await Promise.all(packages.map(async pkg => {
    const entries = await Promise.all(pkg.files.map(async path => {
      const text = await readFile(join(skillRoot, pkg.name, path), "utf8");
      if (Buffer.byteLength(text) > 64 * 1024) throw new Error("El recurso de la skill supera el límite del servidor.");
      return { uri: `skill://dropflex/${pkg.name}/${path}`, text, digest: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` };
    }));
    // Subconjunto YAML del paquete: escalares y metadata en JSON inline (también YAML válido).
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(entries[0].text)?.[1];
    if (!header) throw new Error("La skill no tiene frontmatter.");
    const frontmatter = frontmatterSchema.parse(Object.fromEntries(header.split(/\r?\n/).map(line => {
      const separator = line.indexOf(":");
      const key = line.slice(0, separator).trim(), value = line.slice(separator + 1).trim();
      if (separator < 1 || !value) throw new Error("Frontmatter de skill no válido.");
      return [key, value.startsWith('"') || value.startsWith("{") ? JSON.parse(value) as unknown : value];
    })));
    if (frontmatter.name !== pkg.name) throw new Error("El nombre de la skill no coincide con su paquete.");
    return { entries, skill: { uri: `skill://dropflex/${pkg.name}/SKILL.md`, frontmatter, resources: entries.map(({ uri, digest }) => ({ uri, digest })) } };
  }));
  return { entries: bundles.flatMap(pkg => pkg.entries), skills: bundles.map(pkg => pkg.skill) };
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
    return { skills: (await getBundle()).skills };
  });
  server.setRequestHandler(getSchema, async request => {
    if (![OPTIMIZATION_SKILL_URI, EBOOK_SKILL_URI].includes(request.params.uri)) throw new McpError(ErrorCode.InvalidParams, "La skill solicitada no existe.");
    return { skill: (await getBundle()).skills.find(skill => skill.uri === request.params.uri)! };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async request => {
    rejectCursor(request.params?.cursor);
    return { resources: [...(await getBundle()).entries.map(({ uri }) => ({ uri, name: uri.slice(uri.lastIndexOf("/") + 1), mimeType: mimeType(uri) })), ...uiResources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType }))] };
  });
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const ui = uiResources.find(resource => resource.uri === request.params.uri);
    if (ui) return { contents: [ui] };
    // Comprueba la allowlist antes de acceder al disco, incluso si el paquete no está instalado.
    if (!resourceUris.includes(request.params.uri)) throw new McpError(ErrorCode.InvalidParams, "El recurso solicitado no existe.");
    const entry = (await getBundle()).entries.find(item => item.uri === request.params.uri)!;
    return { contents: [{ uri: entry.uri, mimeType: mimeType(entry.uri), text: entry.text }] };
  });
}
