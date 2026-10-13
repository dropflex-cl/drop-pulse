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
  it("descubre contexto por componente y reporte paginado como lecturas sin efectos", async () => {
    const session = await connect();
    try {
      const tools = await session.client.listTools();
      for (const name of ["get_component_generation_context", "get_pdp_completion_report", "get_ad_carousels"]) {
        expect(tools.tools.find(t => t.name === name)).toMatchObject({ annotations: { readOnlyHint: true } });
      }
      expect(session.client.getInstructions()).toContain("tarea argumental distinta");
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it("el servidor exige un pedido explícito antes de regenerar o descartar por un fallo visual", async () => {
    const session = await connect();
    try {
      expect(session.client.getInstructions()).toMatch(/revisión automática pagada de imágenes está retirada/);
      expect(session.client.getInstructions()).toMatch(/regenerar o descartar requiere un pedido explícito del comerciante/);
      expect(session.client.getInstructions()).toMatch(/autorización del lote o de publicación en Shopify no autoriza intentos adicionales por QA/);
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it.each([
    { name: "inspeccionar sin QA pagado ni regeneración automática", path: "SKILL.md", requires: [
      /revisión automática pagada de imágenes está retirada/, /regenerar requiere un pedido explícito/,
      /No añadas intentos ni gastos por tu evaluación/,
    ], forbids: [/revisa tú la toma principal contra la foto base y continúa el lote/] },
    { name: "fallos visuales conservan decisiones y requieren otra solicitud", path: "references/production.md", requires: [
      /regenerar requiere un pedido explícito nuevo/, /conserva la pieza y sus decisiones de uso/,
      /no activa QA pagado, reintentos automáticos ni gastos adicionales/,
      /autorización del lote o de publicación no autoriza intentos adicionales por QA/,
    ], forbids: [/prepara una corrección dentro del pedido de generación autorizado/, /corrige las tomas afectadas dentro del alcance autorizado/] },
    { name: "redactar sin pruebas reales ni vacíos automáticos", path: "references/production.md", requires: [
      /sin exigir pruebas reales/, /`fact_id` es opcional/, /imágenes de referencia o generadas/,
      /`customer-stories` permite escribir contenido propio/, /no requiere crear un bundle en Shopify/,
    ], forbids: [/Sin esos respaldos usa el estado vacío/, /exige evidencia auténtica y material manual/, /hechos verificados, aprobados y sin contradicciones/] },
    { name: "guardar sin aprobación ni permiso Shopify", path: "SKILL.md", requires: [
      /Guardar contenido válido lo deja disponible/, /Publicar es otra acción, con autorización Shopify propia/,
      /No hay un recorrido obligatorio de aprobación/, /No uses `review_visual_record` para aprobar cada guardado/,
      /prompts iniciales heredados pueden decir «aprueba automáticamente»/,
    ], forbids: [/Con autorización activa, aprueba planes/, /guarda contenido aprobado/, /Cada mutación usa revisión, etag/] },
    { name: "editar hooks sin versiones, regeneración o revocación", path: "references/strategy-and-hooks.md", requires: [
      /guardar la selección actualiza el mismo ID/, /No exige versiones, reconciliación ni aprobación nueva/,
      /no regenera imágenes o copy ni gasta créditos/, /No reactives una autorización desactivada/,
    ], forbids: [/versiona la selección/, /No ejecutes contra una selección stale/] },
    { name: "editar un componente conserva filas y decisiones", path: "references/production.md", requires: [
      /Para editar un componente, lee ese componente/, /UI y MCP editan la misma fila/,
      /imágenes omitidas, orden y secciones ocultas/, /no es una etapa obligatoria para editar copy o reutilizar imágenes/,
      /dry_run.*paso obligatorio para cada edición/,
    ], forbids: [/fijan revisión exacta del plan/, /guarda con revisión\/etag actuales/, /vuelve a guardar propuestas anteriores/] },
    { name: "asignar assets sin revisiones posteriores", path: "references/production.md", requires: [
      /Si pasa y su uso fue indicado/, /destino válido queda seleccionado al guardar/,
      /solo pidió propuestas, guarda el archivo sin elegir un destino/, /No uses `review_visual_record` para aprobar el asset/,
      /no obliga a reconciliar ni aprobar un plan o archivo existente/,
    ], forbids: [/Identidad y plan deben estar aprobados/, /Resuelve `approve_identity`/, /selecciona el binding con `review_visual_record`/] },
    { name: "publicar solo con consentimiento vigente", path: "SKILL.md", requires: [
      /Elegir un hook por sí solo no autoriza publicar/, /No pidas al comerciante revisiones, etags, stamps ni aprobaciones/,
      /no renueves una autorización desactivada por tu cuenta/, /no regenera, no gasta créditos y no desactiva el contenido elegido/,
      /no convierte la autorización en requisito para guardar o usar contenido/,
    ], forbids: [/Si cambian el hook.*concilia/, /permite renovar la autorización/] },
    { name: "UGC conserva medios y usa montaje local", path: "references/production.md", requires: [
      /conservando medios existentes/, /Keyframes externos crean solo destinos faltantes/,
      /montaje se realiza localmente con Python\/FFmpeg/, /No uses el worker Remotion retirado/,
      /Generar clips de pago requiere un pedido explícito/,
    ], forbids: [/Renderizar video sigue un flujo separado con permisos, aprobación/] },
  ])("la skill servida respeta el flujo vigente: $name", async scenario => {
    const session = await connect();
    try {
      const response = await session.client.readResource({ uri: `skill://dropflex/optimize-product/${scenario.path}` });
      const resource = response.contents[0];
      if (!("text" in resource)) throw new Error("La skill debe ser texto.");
      for (const rule of scenario.requires) expect(resource.text).toMatch(rule);
      for (const rule of scenario.forbids) expect(resource.text).not.toMatch(rule);
      expect(session.execute).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it("mantiene manifiestos compatibles y un prompt de skill sin aprobaciones intermedias", async () => {
    const pluginRoot = join(root, "..");
    const legacy = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    expect(legacy.name).toBe(pluginManifest.name);
    expect(legacy.version).toBe(pluginManifest.version);
    expect(legacy.interface).toEqual(pluginManifest.extensions["com.openai"].interface);
    expect(legacy.apps).toBe(pluginManifest.extensions["com.openai"].apps);
    const prompt = await readFile(join(root, "optimize-product/agents/openai.yaml"), "utf8");
    expect(prompt).toMatch(/guarda la página y asigna sus imágenes/);
    expect(prompt).toMatch(/Autorizo publicarla en Shopify/);
    expect(prompt).not.toMatch(/aprueba automáticamente/);
    const main = await readFile(join(root, "optimize-product/SKILL.md"), "utf8");
    expect(main).toMatch(/infiere la paleta desde la referencia real/);
    expect(main).not.toMatch(/crea el PDF con el acento de la PDP/);
  });
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
