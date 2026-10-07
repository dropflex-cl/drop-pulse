// Las métricas de cada paso de IA por versión de prompt (docs/spec-prompts-simples.md §9): intentos,
// respuestas rechazadas por el código, costo por resultado aceptado, tiempo y las reglas que más fallan.
// Solo lee (SELECT) con la CLI de Supabase: nunca escribe.
//
//   npm run ai:metrics -- [--days 30] [--step angle_hooks] [--local]
//
// Sin --local lee la base enlazada (producción). Las filas de antes de la migración
// 20261031000000 no traen versión: salen como «—» y se separan por fecha.
import { execFileSync } from "node:child_process";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const DAYS = Number(arg("days", "30"));
const STEP = arg("step");
const TARGET = process.argv.includes("--local") ? "--local" : "--linked";

if (!Number.isInteger(DAYS) || DAYS <= 0) throw new Error("--days es un número de días.");
if (STEP && !/^[a-z_]+$/.test(STEP)) throw new Error("--step es la clave de un paso (angle_hooks, page_copy…).");

function query<T>(sql: string): T[] {
  const out = execFileSync("supabase", ["db", "query", TARGET, "-o", "json", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return (JSON.parse(out.slice(out.indexOf("{"))) as { rows: T[] }).rows;
}

const hasVersion = query<{ n: number }>("select count(*)::int n from information_schema.columns where table_name = 'ai_generations' and column_name = 'prompt_version'")[0]?.n > 0;
const version = hasVersion ? "prompt_version" : "null::int";
const where = `provider = 'anthropic' and created_at > now() - interval '${DAYS} days'${STEP ? ` and step = '${STEP}'` : ""}`;

console.log(`\nPasos de IA, últimos ${DAYS} días${STEP ? ` (${STEP})` : ""}${hasVersion ? "" : " — la base aún no tiene prompt_version"}\n`);
console.table(
  query(`
    select step, coalesce(${version}::text, '—') as version,
      count(*)::int as intentos,
      count(*) filter (where error_code like 'invalid_%')::int as rechazados,
      count(*) filter (where status = 'failed' and (error_code is null or error_code not like 'invalid_%'))::int as otras_fallas,
      round(100.0 * count(*) filter (where error_code like 'invalid_%') / count(*))::int as "rechazo_%",
      round(sum(coalesce(cost_usd, 0))::numeric, 2) as usd,
      round(sum(coalesce(cost_usd, 0))::numeric / nullif(count(*) filter (where status = 'succeeded'), 0), 3) as usd_por_aceptado,
      round(avg(latency_ms) / 1000.0)::int as seg,
      min(created_at)::date as desde, max(created_at)::date as hasta
    from ai_generations where ${where}
    group by 1, 2 order by 1, 2`),
  ["step", "version", "intentos", "rechazados", "otras_fallas", "rechazo_%", "usd", "usd_por_aceptado", "seg", "desde", "hasta"],
);

console.log("\nReglas que más fallan (los números de gancho, toma o concepto se agrupan como N)\n");
console.table(
  query(`
    select step, coalesce(${version}::text, '—') as version, regexp_replace(left(p, 140), '\\d+', 'N', 'g') as regla, count(*)::int as veces
    from ai_generations, jsonb_array_elements_text(problems) p
    where ${where} and problems is not null
    group by 1, 2, 3 order by 4 desc limit 25`),
  ["step", "version", "veces", "regla"],
);
