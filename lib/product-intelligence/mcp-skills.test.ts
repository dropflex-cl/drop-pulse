import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProductIntelligenceServer, type DomainExecutor } from "./mcp";
import { OPTIMIZATION_SKILL_URI, SKILLS_EXTENSION } from "./mcp-skills";
import { principalFixture } from "./test-fixtures";
import pluginManifest from "../../plugins/dropflex-optimizer/plugin.json";

const skillSchema = z.object({ uri: z.string(), frontmatter: z.object({ name: z.string(), description: z.string(), metadata: z.object({ version: z.string() }) }), resources: z.array(z.object({ uri: z.string(), digest: z.string() })) });
const root = join(process.cwd(), "plugins/dropflex-optimizer/skills/optimize-product");
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
      expect(catalog.skills).toHaveLength(1);
      const skill = catalog.skills[0];
      expect(skill.uri).toBe(OPTIMIZATION_SKILL_URI);
      expect(skill.frontmatter.metadata.version).toBe("1.3.3");
      const direct = await session.client.request({ method: "skills/get", params: { uri: skill.uri } }, z.object({ skill: skillSchema }));
      expect(direct.skill).toEqual(skill);
      const allFiles = (await readdir(root, { recursive: true, withFileTypes: true })).filter(file => file.isFile()).map(file => join(file.parentPath, file.name).slice(root.length + 1).replaceAll("\\", "/"));
      expect(skill.resources.map(item => item.uri.replace("skill://dropflex/optimize-product/", "")).sort()).toEqual(allFiles.sort());
      const listed = await session.client.listResources();
      expect(listed.resources.filter(item => item.uri.startsWith("skill://")).map(item => item.uri).sort()).toEqual(skill.resources.map(item => item.uri).sort());
      for (const resource of skill.resources) {
        const response = await session.client.readResource({ uri: resource.uri });
        expect(response.contents).toHaveLength(1);
        const content = response.contents[0];
        expect(content.uri).toBe(resource.uri);
        if (!("text" in content)) throw new Error("La skill debe ser texto UTF-8.");
        const expected = await readFile(join(root, resource.uri.replace("skill://dropflex/optimize-product/", "")), "utf8");
        expect(content.text).toBe(expected);
        expect(resource.digest).toBe(`sha256:${createHash("sha256").update(content.text).digest("hex")}`);
        if (resource.uri === skill.uri) {
          const header = /^---\n([\s\S]*?)\n---/.exec(content.text)![1];
          expect(Object.fromEntries(header.split("\n").map(line => {
            const at = line.indexOf(":"), value = line.slice(at + 1).trim();
            return [line.slice(0, at), value.startsWith("{") ? JSON.parse(value) : value];
          }))).toEqual(skill.frontmatter);
        }
      }
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it("rechaza recursos ajenos, traversal, URLs y cursores que no pertenecen al catálogo", async () => {
    const session = await connect();
    try {
      for (const uri of ["file:///etc/passwd", "https://localhost/.env", "skill://dropflex/optimize-product/../../.env", "skill://dropflex/another/SKILL.md"]) {
        await expect(session.client.readResource({ uri })).rejects.toThrow("no existe");
        await expect(session.client.request({ method: "skills/get", params: { uri } }, z.object({ skill: skillSchema }))).rejects.toThrow("no existe");
      }
      await expect(session.client.request({ method: "skills/list", params: { cursor: "foreign" } }, z.object({ skills: z.array(skillSchema) }))).rejects.toThrow("página posterior");
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
});
