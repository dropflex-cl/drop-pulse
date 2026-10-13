import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { checkUgcTiming, ugcTimingInput } from "./ugc-timing";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createProductIntelligenceServer } from "./mcp";
import { ProductIntelligenceError } from "./errors";
import { principalFixture } from "./test-fixtures";

const product = "00000000-0000-4000-8000-000000000001";
const proposal = () => ugcTimingInput.parse({ product_id: product, format: "ugc", hook: { spoken: "Dormiste bien, ¿por qué tu mirada parece cansada?", screen: "¿Dormiste bien? ¿Mirada cansada?" }, a_roll: [
  { line: "Dormiste bien, ¿por qué tu mirada parece cansada? A mí me importa cuidar esa zona.", seconds: 6 },
  { line: "Por eso está SADOER Caviar, un contorno con ácido hialurónico pensado para hidratar esta zona.", seconds: 6 },
  { line: "Mira su textura. Se distribuye suavemente alrededor del ojo, aportando un cuidado localizado a tu rutina.", seconds: 6 },
  { line: "¿Y si ya usas crema facial? Este producto permite dedicarle atención específica al contorno de ojos.", seconds: 6 },
  { line: "Encuentra el Pack Dos SADOER Caviar, con envío gratis y pago al recibir. Revisa la oferta disponible.", seconds: 6 },
] });

describe("UGC · comprobación de tiempos sin guardado", () => {
  it("corrige los conteos falsos de la propuesta conversacional sin cambiar el texto", () => {
    const input = proposal(), report = checkUgcTiming(input);
    expect(report.shots.map(shot => shot.words)).toEqual([15, 15, 16, 16, 17]);
    expect(report.total).toMatchObject({ seconds: 30, words: 79, words_per_second: 79 / 30 });
    expect(report.hook).toMatchObject({ spoken_words: 8, screen_words: 4, opens_first_line: true });
    expect(report).toMatchObject({ valid: true, scope: "timing_only" });
    expect(report.shots.map(shot => shot.line)).toEqual(input.a_roll.map(shot => shot.line));
  });
  it("detecta una toma rápida aunque el promedio global sea aceptable y no redondea para aprobar", () => {
    const input = proposal(); input.a_roll[1] = { line: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis", seconds: 5 };
    const report = checkUgcTiming(input);
    expect(report.total.words_per_second).toBeLessThan(3);
    expect(report.shots[1]).toMatchObject({ words: 16, max_words: 15, words_per_second: 3.2, within_rate: false });
    expect(report.problems).toContainEqual(expect.objectContaining({ field: "a_roll.1.line" }));
    expect(report.valid).toBe(false);
    input.a_roll[1].seconds = 6;
    expect(checkUgcTiming(input).valid).toBe(true);
  });
  it("cuenta la apertura completa y no bloquea por texto histórico en pantalla", () => {
    const input = proposal(); input.hook = { spoken: "¿Dormiste muy bien? Pero tu mirada todavía se ve cansada.", screen: "Dormiste muy bien pero la mirada sigue cansada" };
    input.a_roll[0].line = input.hook.spoken;
    const report = checkUgcTiming(input);
    expect(report.hook).toMatchObject({ spoken_words: 10, screen_words: 8, within_spoken_limit: false, within_screen_limit: false });
    expect(report.problems.map(problem => problem.field)).toContain("hook.spoken");
    expect(report.problems.map(problem => problem.field)).not.toContain("hook.screen");
    input.a_roll[0].line = "Mira. " + input.hook.spoken;
    expect(checkUgcTiming(input).hook.opens_first_line).toBe(false);
  });
  it("comprueba guiones sin screen y conserva compatibilidad sin exigirlo", () => {
    const original = proposal();
    const input = ugcTimingInput.parse({ ...original, hook: { spoken: original.hook.spoken } });
    expect(checkUgcTiming(input)).toMatchObject({ valid: true, hook: { screen_words: 0 } });
    expect(checkUgcTiming({ ...input, hook: { ...input.hook, screen: "Un texto antiguo con demasiadas palabras que no se muestra" } }).valid).toBe(true);
  });
  it("usa los límites vigentes del formato y separa duración por toma y suma", () => {
    const input = proposal(); input.format = "mascot";
    expect(checkUgcTiming(input).total.within_duration).toBe(false);
    input.a_roll = input.a_roll.slice(0, 4);
    expect(checkUgcTiming(input).valid).toBe(true);
    input.a_roll[0].seconds = 6.5;
    expect(checkUgcTiming(input).shots[0].within_duration).toBe(false);
    input.a_roll[0].seconds = 9;
    expect(checkUgcTiming(input).problems).toContainEqual(expect.objectContaining({ field: "a_roll.0.seconds" }));
  });
  it("descubre e invoca la tool con permiso de lectura, sin escrituras ni repositorio UGC", async () => {
    const repository = {
      load: vi.fn(), commit: vi.fn(), commitKnowledge: vi.fn(),
      loadKnowledge: vi.fn(async () => ({ revision: 72, current_revision: 72, stamp: "a".repeat(64), snapshot: {
        catalog: { id: product, title: "Producto", shopify_product_id: "123", currency: "CLP", is_upsell: false },
        context: null, pricing: null, settings: null, numbers: null, images: [],
      } })),
    };
    const principal = { ...principalFixture(), scopes: ["product_intelligence:read"] as const };
    const executor = createProductIntelligenceExecutor(repository);
    const server = createProductIntelligenceServer(principal, executor, { availableTools: ["validate_ugc_script_timing"] });
    const client = new Client({ name: "ugc-timing-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    try {
      expect((await client.listTools()).tools[0]).toMatchObject({ name: "validate_ugc_script_timing", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } });
      const result = await client.callTool({ name: "validate_ugc_script_timing", arguments: proposal() });
      expect(result).toMatchObject({ isError: false, structuredContent: { ok: true, revision: 72, data: { valid: true, total: { words: 79 } } } });
      expect(repository.loadKnowledge).toHaveBeenCalledOnce();
      expect(repository.commit).not.toHaveBeenCalled(); expect(repository.commitKnowledge).not.toHaveBeenCalled(); expect(repository.load).not.toHaveBeenCalled();
      repository.loadKnowledge.mockRejectedValueOnce(new ProductIntelligenceError("NOT_FOUND", "No encontramos ese producto."));
      expect(await client.callTool({ name: "validate_ugc_script_timing", arguments: proposal() })).toMatchObject({ isError: true, structuredContent: { error: { code: "NOT_FOUND" } } });
      await expect(executor({ ...principal, scopes: [] }, { tool: "validate_ugc_script_timing", input: proposal() }, new AbortController().signal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await client.close(); await server.close(); }
  });
});
