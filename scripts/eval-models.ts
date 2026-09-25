// Compara modelos de Claude con inputs reales, con los mismos prompts, esquemas y validaciones de
// la app. No escribe en ninguna base: lee un JSON exportado de prod y deja todo en --out.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/eval-models.ts \
//     --in <prod-inputs.json> --out <carpeta> [--task copy|avatar|all] [--samples 2] [--dry]
//     [--models claude-opus-5,claude-sonnet-5] [--repair]
//
// --repair: la página pasa por writePage (lib/copy/write.ts), con las correcciones de la app; sin él
// se mide solo el primer intento.
//
// Cada llamada cuesta dinero real (Opus ~US$0,30 la página, Sonnet ~40% de eso). --dry solo arma
// los prompts. El JSON de entrada: por producto, product, brief, avatar, copyInput (copy_runs.input),
// optimizeInput (pipeline_runs.input), angles (angle_briefs aprobados) y reviews (aprobadas).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AiStepError, generateStructured, type AiUsage } from "@/lib/ai/claude";
import { customerAvatarSystem, customerAvatarUser } from "@/lib/ai/prompts";
import { avatarStepSchema, type CustomerAvatar, type ProductBrief } from "@/lib/ai/schemas";
import { angleForPrompt } from "@/lib/angles/approved";
import type { AngleSlot, TestAngle } from "@/lib/angles/catalog";
import { differentiatorState } from "@/lib/competitors/store";
import { pageProblems, pageSchema, productFactText, toWrite, type PageOutput } from "@/lib/copy/page-schema";
import { copySystem, copyUser, type CopyContext } from "@/lib/copy/prompts";
import { writePage, type PageAttempt } from "@/lib/copy/write";
import { allowedAmounts } from "@/lib/copy/schemas";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { displayText } from "@/lib/reviews/rows";

const MODELS = (process.argv.includes("--models") ? process.argv[process.argv.indexOf("--models") + 1] : "claude-opus-5,claude-sonnet-5").split(",");
const REPAIR = process.argv.includes("--repair");

interface ProdInput {
  product: { id: string; title: string; description: string | null; base_info: string | null };
  brief: ProductBrief;
  avatar: CustomerAvatar;
  copyInput: { market: Market; pricing: PricingPlan; labels: CopyContext["labels"] | null; free_shipping: boolean };
  optimizeInput: { market: Market; pricing: PricingPlan };
  angles: { id: string; angle: TestAngle["frame"]; role: string; payload: never }[];
  reviews: (Parameters<typeof displayText>[0] & { id: string; rating: number; country: string | null })[];
}

interface Job {
  task: "copy" | "avatar";
  product: string;
  model: string;
  sample: number;
  run: () => Promise<{ data: unknown; usage: AiUsage; attempts?: PageAttempt[] }>;
  check: (data: unknown) => string[];
  prompt: string;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Los ángulos de antes (principal y secundario) no guardan título ni dolor: van vacíos, como en la app. */
/** Las llamadas de una escritura como una sola (costo y tokens sumados). */
function sumUsage(all: AiUsage[]): AiUsage {
  const sum = (k: keyof AiUsage) => all.reduce((s, u) => s + (u[k] as number), 0);
  return { model: all[0].model, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), cacheReadTokens: sum("cacheReadTokens"), cacheWriteTokens: sum("cacheWriteTokens"), costUsd: sum("costUsd"), latencyMs: sum("latencyMs") };
}

function oldAngle(slot: AngleSlot, frame: TestAngle["frame"]): TestAngle {
  return { slot, frame, title: "", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" } as TestAngle;
}

function copyJobs(d: ProdInput, samples: number): Job[] {
  const { copyInput: input, brief, product } = d;
  const write = toWrite([], d.reviews.length);
  const ctx: CopyContext = {
    brief,
    avatar: d.avatar,
    pricing: input.pricing,
    labels: input.labels ?? undefined,
    angles: d.angles.map((a, i) => angleForPrompt(oldAngle((i + 1) as AngleSlot, a.angle), a.payload, a.angle)),
    differentiator: differentiatorState(null, brief).value,
    shopify: { title: product.title, description: product.description },
    countryCode: input.market.countryCode,
    freeShipping: input.free_shipping,
    returnDays: brief.proof.guarantee_days && brief.proof.guarantee_days > 0 ? brief.proof.guarantee_days : null,
    reviews: d.reviews.map((v) => ({ id: v.id, rating: v.rating, text: displayText(v), country: v.country ?? undefined })),
    write,
    approved: [],
  };
  const facts = { currency: input.pricing.currency, amounts: allowedAmounts(input.pricing), reviewIds: d.reviews.map((v) => v.id), factText: productFactText(brief, product.base_info) };
  const system = copySystem(input.market);
  const user = copyUser(ctx);
  const schema = pageSchema(write);
  return MODELS.flatMap((model) =>
    Array.from({ length: samples }, (_, sample) => ({
      task: "copy" as const,
      product: product.title,
      model,
      sample,
      prompt: `${system}\n\n=====\n\n${user}`,
      run: REPAIR
        ? async () => {
            const attempts: PageAttempt[] = [];
            const r = await writePage({ ctx, market: input.market, facts, model, onAttempt: (a) => void attempts.push(a) });
            return { data: r.data, usage: sumUsage(attempts.map((a) => a.usage)), attempts };
          }
        : () => generateStructured({ system, content: [{ type: "text", text: user }], schema, effort: "medium", maxTokens: 16000, model }),
      check: (data: unknown) => pageProblems(data as PageOutput, write, facts),
    })),
  );
}

function avatarJobs(d: ProdInput): Job[] {
  const { market, pricing } = d.optimizeInput;
  const system = customerAvatarSystem(market);
  const user = customerAvatarUser(JSON.stringify(d.brief, null, 2), d.product.base_info ?? "", pricing);
  return MODELS.map((model) => ({
    task: "avatar" as const,
    product: d.product.title,
    model,
    sample: 0,
    prompt: `${system}\n\n=====\n\n${user}`,
    run: () => generateStructured({ system, content: [{ type: "text", text: user }], schema: avatarStepSchema, effort: "high", model }),
    // La app no valida el cliente ideal más allá del esquema: la calidad se lee a mano.
    check: () => [],
  }));
}

async function pool<T>(items: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await items[i]();
      }
    }),
  );
  return out;
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const inPath = arg("in");
  const outDir = arg("out");
  if (!inPath || !outDir) throw new Error("Faltan --in y --out");
  const task = arg("task", "all");
  const samples = Number(arg("samples", "2"));
  const dry = process.argv.includes("--dry");
  const inputs = JSON.parse(readFileSync(inPath, "utf8")) as ProdInput[];
  mkdirSync(outDir, { recursive: true });

  const jobs = inputs.flatMap((d) => [...(task === "avatar" ? [] : copyJobs(d, samples)), ...(task === "copy" ? [] : avatarJobs(d))]);
  const name = (j: Job) => `${j.task}-${slug(j.product)}-${j.model.replace(/^claude-/, "")}-${j.sample}`;

  if (dry) {
    for (const j of jobs) {
      if (j.model === MODELS[0] && j.sample === 0) writeFileSync(join(outDir, `prompt-${j.task}-${slug(j.product)}.txt`), j.prompt);
      console.log(`${name(j)}  prompt ${j.prompt.length.toLocaleString("es-CL")} caracteres`);
    }
    return;
  }

  const results = await pool(
    jobs.map((j) => async () => {
      const started = Date.now();
      try {
        const { data, usage, attempts } = await j.run();
        let problems: string[];
        try {
          problems = j.check(data);
        } catch (e) {
          problems = [`la validación se cayó: ${(e as Error).message}`];
        }
        const r = { ...j, ok: problems.length === 0, problems, usage, data, error: null as string | null };
        const calls = attempts?.map((a) => ({ parts: a.partial ? a.parts : "todo", problems: a.problems.length, costUsd: a.usage.costUsd, outputTokens: a.usage.outputTokens }));
        writeFileSync(join(outDir, `${name(j)}.json`), JSON.stringify({ problems, usage, calls, data }, null, 1));
        if (calls) for (const c of calls) console.log(`   · ${Array.isArray(c.parts) ? c.parts.join(", ") : c.parts}: ${c.problems} problemas, US$${c.costUsd.toFixed(3)}, ${c.outputTokens} tok salida`);
        console.log(`${name(j)}  ${r.ok ? "OK" : `${problems.length} problemas`}  US$${usage.costUsd.toFixed(3)}  ${usage.outputTokens} tok salida  ${Math.round(usage.latencyMs / 1000)} s`);
        return r;
      } catch (e) {
        const usage = e instanceof AiStepError ? e.usage : undefined;
        const error = e instanceof AiStepError ? `${e.code}: ${e.message}` : String(e);
        console.log(`${name(j)}  ERROR ${error}  ${Math.round((Date.now() - started) / 1000)} s`);
        writeFileSync(join(outDir, `${name(j)}.json`), JSON.stringify({ error, usage }, null, 1));
        return { ...j, ok: false, problems: [] as string[], usage, data: null, error };
      }
    }),
    4,
  );

  const rows = results.map((r) => ({
    task: r.task,
    product: r.product,
    model: r.model,
    sample: r.sample,
    ok: r.ok,
    error: r.error,
    problems: r.problems,
    cost: r.usage?.costUsd ?? 0,
    input: r.usage ? r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens : 0,
    output: r.usage?.outputTokens ?? 0,
    seconds: r.usage ? Math.round(r.usage.latencyMs / 1000) : 0,
  }));
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(rows, null, 1));
  const total = rows.reduce((s, r) => s + r.cost, 0);
  console.log(`\nTotal US$${total.toFixed(2)}. Resultados en ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
