// Corre el agente de ganchos y su crítico (lib/pipeline/hooks.ts › writeHooks, el mismo bucle de la
// app) sobre un producto real y mide si los ganchos detienen el scroll. No escribe en ninguna base: lee
// un JSON exportado de prod y deja todo en --out.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/eval-hooks.ts \
//     --in <fixture.json> --out <carpeta> [--slots 1,3] [--problem "escuch|oído"] [--dry]
//
// El JSON de entrada: ranking (angle_rankings: input y chosen_angles), brief (product_briefs.payload),
// avatar (customer_avatars.payload) y briefs (angle_briefs del producto: slot, angle y payload). Si el
// payload trae los ganchos guardados (de una versión anterior del agente), además deja una comparación
// a ciegas (docs/spec-prompts-simples.md §9): ciegas-slot-N.md con las dos listas como A y B, sin decir
// cuál es cuál, y la clave en clave.json para después.
// --problem: una expresión regular con las palabras del problema, para contar los textos en pantalla
// que lo nombran. La clave de Anthropic va explícita en ANTHROPIC_API_KEY (.env.local), como en
// scripts/eval-models.ts. Cada ángulo cuesta ~US$0,10–0,30 (ganchos + crítico, y una reescritura si hace falta).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiUsage } from "@/lib/ai/claude";
import { readAvatar, type PackLabel, type ProductBrief } from "@/lib/ai/schemas";
import type { TestAngle } from "@/lib/angles/catalog";
import type { AngleContext } from "@/lib/angles/prompts";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { HOOKS_PROMPT_VERSION, hooksToPayload } from "@/lib/hooks/schemas";
import type { Market } from "@/lib/market";
import { writeHooks } from "@/lib/pipeline/hooks";
import type { PricingPlan } from "@/lib/pricing/plan";

interface Fixture {
  ranking: { input: { market: Market; pricing: PricingPlan; labels: PackLabel[] | null; differentiator: AngleContext["differentiator"]; reviews?: string[] }; chosen: TestAngle[] };
  brief: ProductBrief;
  /** customer_avatars.payload de cualquier versión (readAvatar). */
  avatar: unknown;
  briefs: { slot: number; angle: TestAngle["frame"]; payload: AngleBriefPayload }[];
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const IN = arg("in");
const OUT = arg("out", "eval-hooks-out")!;
const SLOTS = (arg("slots") ?? "").split(",").filter(Boolean).map(Number);
const PROBLEM = new RegExp(arg("problem") ?? "$^", "i");
const DRY = process.argv.includes("--dry");
const API_KEY = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

async function main() {
  if (!IN) throw new Error("Falta --in <fixture.json>.");
  if (!DRY && !API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en .env.local.");
  const fx = JSON.parse(readFileSync(IN, "utf8")) as Fixture;
  const input = fx.ranking.input;
  const reviews = input.reviews?.length ? input.reviews : undefined;
  const ctx = {
    brief: reviews ? { ...fx.brief, proof: { ...fx.brief.proof, real_reviews: reviews } } : fx.brief,
    avatar: readAvatar(fx.avatar),
    pricing: input.pricing,
    labels: input.labels ?? undefined,
    differentiator: input.differentiator ?? null,
  } as AngleContext;
  mkdirSync(OUT, { recursive: true });

  const summary: string[] = [];
  const key: Record<string, { A: string; B: string }> = {};
  for (const b of fx.briefs.filter((x) => !SLOTS.length || SLOTS.includes(x.slot))) {
    const angle = fx.ranking.chosen.find((a) => a.slot === b.slot);
    if (!angle) continue;
    const others = fx.ranking.chosen.filter((a) => a.slot !== b.slot);
    if (DRY) {
      summary.push(`Ángulo ${b.slot}: listo para correr (${angle.title}).`);
      continue;
    }
    const calls: { step: string; usage?: AiUsage; error?: string | null; problems?: string[] }[] = [];
    const started = Date.now();
    const written = await writeHooks({
      userId: "eval",
      productId: "eval",
      market: input.market,
      ctx,
      angle: { ...angle, frame: b.angle },
      payload: b.payload,
      others,
      image: null,
      auth: { apiKey: API_KEY },
      record: async (row) => {
        calls.push({ step: row.step, usage: row.usage, error: row.error, problems: row.problems ?? undefined });
      },
    });
    const saved = hooksToPayload(written.out, written.review);
    const before = b.payload.hooks ?? [];
    if (before.length) {
      const newFirst = Math.random() < 0.5;
      const lists = newFirst ? [saved.hooks, before] : [before, saved.hooks];
      key[`slot-${b.slot}`] = newFirst ? { A: `nueva (v${HOOKS_PROMPT_VERSION})`, B: `guardada (v${b.payload.hooks_version ?? "?"})` } : { A: `guardada (v${b.payload.hooks_version ?? "?"})`, B: `nueva (v${HOOKS_PROMPT_VERSION})` };
      writeFileSync(
        join(OUT, `ciegas-slot-${b.slot}.md`),
        [
          `# Ángulo ${b.slot}: ${angle.title}`,
          "",
          "¿Cuál lista detiene más el scroll de quien compra? Elige A o B antes de abrir clave.json.",
          ...lists.flatMap((hooks, i) => ["", `## ${i ? "B" : "A"}`, "", ...hooks.map((h, k) => `${k + 1}. «${[h.text, h.follow_up].filter(Boolean).join(" ")}» · en pantalla: «${h.on_screen ?? ""}»`)]),
        ].join("\n"),
      );
    }
    const cost = calls.reduce((n, c) => n + (c.usage?.costUsd ?? 0), 0);
    const hooks = saved.hooks;
    const naming = hooks.filter((h) => PROBLEM.test(h.on_screen ?? "")).length;
    const spokenNaming = hooks.filter((h) => PROBLEM.test(`${h.text} ${h.follow_up ?? ""}`)).length;
    const stops = hooks.filter((h) => h.review?.stops).length;
    const quoted = hooks.filter((h) => h.source_quote).length;
    writeFileSync(join(OUT, `slot-${b.slot}.json`), JSON.stringify({ angle: angle.title, calls, saved }, null, 2));
    summary.push(
      [
        `## Ángulo ${b.slot}: ${angle.title}`,
        "",
        `${calls.length} llamadas (${calls.map((c) => `${c.step}${c.error ? ` ✗ ${c.error}` : ""}`).join(", ")}) · US$${cost.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)} s`,
        `Detienen al crítico: ${written.review ? `${stops} de ${hooks.length}` : "el crítico no corrió"} · nombran el problema en pantalla: ${naming} de ${hooks.length} (hablado: ${spokenNaming}) · citan a quien compra: ${quoted}`,
        "",
        "| # | Hablado | En pantalla | Sin sonido (crítico) | ¿Detiene? | Patrón · delivery |",
        "|---|---|---|---|---|---|",
        ...hooks.map((h) =>
          `| ${h.rank}${saved.recommended_hook === hooks.indexOf(h) ? " ★" : ""} | ${[h.text, h.follow_up].filter(Boolean).join(" ")} | ${h.on_screen} | ${h.review?.understood_muted ?? h.silent_read ?? ""} | ${h.review ? (h.review.stops ? "Sí" : `No: ${h.review.why}`) : "—"} | ${h.pattern} · ${h.delivery}${h.source_quote ? ` · cita «${h.source_quote}»` : ""} |`.replace(/\n/g, " "),
        ),
        "",
      ].join("\n"),
    );
    console.log(`Ángulo ${b.slot}: ${stops} de ${hooks.length} detienen, ${naming} nombran el problema en pantalla, US$${cost.toFixed(3)}`);
  }
  writeFileSync(join(OUT, "resumen.md"), summary.join("\n"));
  if (Object.keys(key).length) writeFileSync(join(OUT, "clave.json"), JSON.stringify(key, null, 2));
  console.log(`Listo: ${join(OUT, "resumen.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
