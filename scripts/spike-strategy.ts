// Prueba real del mega prompt de la estrategia (docs/spec-estrategia.md) antes de usarlo en la app: mide
// cuánto tarda, cuántos tokens usa y cuánto cuesta, y deja el informe en un archivo. Usa el prompt
// sembrado en la migración (o --prompt <archivo>) y la clave de ANTHROPIC_API_KEY (.env.local); en la
// app, cada comerciante usa la suya. No escribe en ninguna base.
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/spike-strategy.ts <producto.json> [imagen] [--prompt archivo.txt] [--effort high|medium|low] [--out informe.md]
// producto.json: { "name": "...", "description": "...", "countryCode": "CL", "currency": "CLP", "language": "es",
//   "pricing": { "unitCost": 3900, "avgShippingCost": 8000, "purchaseCostLimit": 4500, "confirmationRate": 70,
//                "deliveryRate": 70, "salePrice": 24990, "compareAtPrice": 34990, "extraUnitDiscount": 50 } }
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { generateText } from "../lib/ai/claude";
import { buildPricingPlan } from "../lib/pricing/plan";
import { renderPrompt } from "../lib/prompts/render";
import { STRATEGY_TAGS } from "../lib/prompts/tags";

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en .env.local");
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const [productFile, imageFile] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!productFile) throw new Error("Uso: spike-strategy.ts <producto.json> [imagen] [--prompt archivo] [--effort high] [--out informe.md]");

const p = JSON.parse(await readFile(productFile, "utf8"));
const pricing = buildPricingPlan(p.pricing, p.currency);
if (!pricing) throw new Error("El precio de producto.json no es válido.");
const body = flag("prompt")
  ? await readFile(flag("prompt")!, "utf8")
  : (await readFile(join(process.cwd(), "supabase/migrations/20261101000000_prompt_templates.sql"), "utf8")).match(/'strategy', 1, \$prompt\$([\s\S]*?)\$prompt\$/)![1];
const prompt = renderPrompt(body, STRATEGY_TAGS, { name: p.name, description: p.description, pricing, market: { countryCode: p.countryCode, currency: p.currency, language: p.language ?? "es" } });

const MIME: Record<string, "image/jpeg" | "image/png" | "image/webp"> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const content: Anthropic.Beta.BetaContentBlockParam[] = [];
if (imageFile) {
  const mime = MIME[extname(imageFile).toLowerCase()];
  if (!mime) throw new Error(`Tipo de imagen no soportado: ${imageFile}`);
  content.push({ type: "image", source: { type: "base64", media_type: mime, data: (await readFile(imageFile)).toString("base64") } });
}
content.push({ type: "text", text: prompt });

const started = Date.now();
let chars = 0;
const { text, usage } = await generateText({
  apiKey,
  content,
  effort: (flag("effort") as "low" | "medium" | "high") ?? "high",
  maxTokens: 32000,
  onText: (t) => {
    chars = t.length;
    process.stdout.write(`\r${Math.round((Date.now() - started) / 1000)} s · ${chars} caracteres`);
  },
});
const out = flag("out") ?? "estrategia.md";
await writeFile(out, text);
console.log(`\n${out}`, { segundos: Math.round(usage.latencyMs / 1000), modelo: usage.model, entrada: usage.inputTokens, salida: usage.outputTokens, usd: usage.costUsd });
