import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProductIntelligenceServer, type DomainExecutor } from "./mcp";
import { EBOOK_SKILL_URI, OPTIMIZATION_SKILL_URI, SKILLS_EXTENSION } from "./mcp-skills";
import { principalFixture } from "./test-fixtures";
import pluginManifest from "../../plugins/dropflex-optimizer/plugin.json";

const skillSchema = z.object({ uri: z.string(), frontmatter: z.object({ name: z.string(), description: z.string(), metadata: z.object({ version: z.string() }) }), resources: z.array(z.object({ uri: z.string(), digest: z.string() })) });
const root = join(process.cwd(), "plugins/dropflex-optimizer/skills");
async function connect() {
  const execute = vi.fn<DomainExecutor>();
  const server = createProductIntelligenceServer(principalFixture(), execute);
  const client = new Client({ name: "skill-importer", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  return { client, execute, close: async () => { await client.close(); await server.close(); } };
}

describe("DropFlex · importación de skill MCP", () => {
  it("anuncia la extensión y sirve un catálogo completo con hashes verificables sin ejecutar tools", async () => {
    const session = await connect();
    try {
      expect(session.client.getServerCapabilities()?.extensions).toHaveProperty(SKILLS_EXTENSION);
      expect(session.client.getServerVersion()?.version).toBe(pluginManifest.version);
      const catalog = await session.client.request({ method: "skills/list", params: {} }, z.object({ skills: z.array(skillSchema) }));
      expect(catalog.skills.map(skill => skill.uri)).toEqual([OPTIMIZATION_SKILL_URI, EBOOK_SKILL_URI]);
      const allResources = catalog.skills.flatMap(skill => skill.resources);
      expect(catalog.skills[0].frontmatter.metadata.version).toBe(pluginManifest.version);
      for (const skill of catalog.skills) {
        const direct = await session.client.request({ method: "skills/get", params: { uri: skill.uri } }, z.object({ skill: skillSchema }));
        expect(direct.skill).toEqual(skill);
      }
      const allFiles = (await readdir(root, { recursive: true, withFileTypes: true })).filter(file => file.isFile()).map(file => join(file.parentPath, file.name).slice(root.length + 1).replaceAll("\\", "/"));
      expect(allResources.map(item => item.uri.replace("skill://dropflex/", "")).sort()).toEqual(allFiles.sort());
      const listed = await session.client.listResources();
      expect(listed.resources.filter(item => item.uri.startsWith("skill://")).map(item => item.uri).sort()).toEqual(allResources.map(item => item.uri).sort());
      for (const resource of allResources) {
        const response = await session.client.readResource({ uri: resource.uri });
        expect(response.contents).toHaveLength(1);
        const content = response.contents[0];
        expect(content.uri).toBe(resource.uri);
        if (!("text" in content)) throw new Error("La skill debe ser texto UTF-8.");
        const expected = await readFile(join(root, resource.uri.replace("skill://dropflex/", "")), "utf8");
        expect(content.text).toBe(expected);
        expect(resource.digest).toBe(`sha256:${createHash("sha256").update(content.text).digest("hex")}`);
        if (resource.uri.endsWith("/SKILL.md")) {
          const skill = catalog.skills.find(skill => skill.uri === resource.uri)!;
          const header = /^---\n([\s\S]*?)\n---/.exec(content.text)![1];
          expect(Object.fromEntries(header.split("\n").map(line => {
            const at = line.indexOf(":"), value = line.slice(at + 1).trim();
            return [line.slice(0, at), value.startsWith("{") ? JSON.parse(value) : value];
          }))).toEqual(skill.frontmatter);
        }
        if (resource.uri.endsWith(".py")) expect(content.mimeType).toBe("text/x-python");
      }
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it("rechaza recursos ajenos, traversal, URLs y cursores que no pertenecen al catálogo", async () => {
    const session = await connect();
    try {
      for (const uri of ["file:///etc/passwd", "https://localhost/.env", "skill://dropflex/optimize-product/../../.env", "skill://dropflex/create-gift-ebook/../../.env", "skill://dropflex/create-gift-ebook/scripts/unknown.py", "skill://dropflex/another/SKILL.md"]) {
        await expect(session.client.readResource({ uri })).rejects.toThrow("no existe");
        await expect(session.client.request({ method: "skills/get", params: { uri } }, z.object({ skill: skillSchema }))).rejects.toThrow("no existe");
      }
      await expect(session.client.request({ method: "skills/list", params: { cursor: "foreign" } }, z.object({ skills: z.array(skillSchema) }))).rejects.toThrow("página posterior");
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
});
