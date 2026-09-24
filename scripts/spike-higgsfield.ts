// F0 de docs/spec-creativos.md: prueba de Higgsfield con un producto real.
// Uso:
//   npx tsx --env-file=.env.local scripts/spike-higgsfield.ts presets
//   npx tsx --env-file=.env.local scripts/spike-higgsfield.ts upload <imagen>
//   npx tsx --env-file=.env.local scripts/spike-higgsfield.ts estimate <plan.json>
//   npx tsx --env-file=.env.local scripts/spike-higgsfield.ts run <plan.json> <carpeta-salida>
//   npx tsx --env-file=.env.local scripts/spike-higgsfield.ts resume <plan.json> <carpeta-salida> <id>=<request_id> …
// El plan es una lista de { id, endpoint, input }. Sin webhook: se consulta el estado (2 s → 10 s).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const BASE = "https://api.higgsfield.ai";
const KEY = process.env.HIGGSFIELD_API_KEY;
if (!KEY || !KEY.includes(":")) throw new Error("Falta HIGGSFIELD_API_KEY (KEY_ID:KEY_SECRET) en .env.local");

type Job = { id: string; endpoint: string; input: Record<string, unknown> };

async function hf(path: string, init: RequestInit = {}): Promise<unknown> {
  // `status_url` viene absoluta y en otro dominio (platform.higgsfield.ai): se usa tal cual.
  const url = /^https?:\/\//.test(path) ? path : `${BASE}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4" };

async function upload(file: string): Promise<string> {
  const contentType = MIME[extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Tipo no soportado: ${file}`);
  const u = (await hf("files/generate-upload-url", { method: "POST", body: JSON.stringify({ content_type: contentType }) })) as {
    upload_url: string;
    public_url: string;
    upload_headers: Record<string, string>;
  };
  const put = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers, body: await readFile(file) });
  if (!put.ok) throw new Error(`PUT de la imagen → ${put.status}`);
  return u.public_url;
}

async function estimate(job: Job): Promise<{ credits: string; usd: string }> {
  return (await hf(`estimate/${job.endpoint}`, { method: "POST", body: JSON.stringify(job.input) })) as { credits: string; usd: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runJob(job: Job, outDir: string, resumeId?: string) {
  const started = Date.now();
  const sub = resumeId
    ? { request_id: resumeId, status_url: `${BASE}/requests/${resumeId}/status` }
    : ((await hf(job.endpoint, { method: "POST", body: JSON.stringify(job.input) })) as { request_id: string; status_url: string });
  console.log(`[${job.id}] ${resumeId ? "retomado" : "enviado"} ${sub.request_id}`);
  let wait = 2000;
  for (;;) {
    await sleep(wait + Math.random() * 500);
    wait = Math.min(wait * 1.5, 10000);
    const s = (await hf(sub.status_url)) as {
      status: string;
      images?: { url: string }[];
      video?: { url: string };
      error?: unknown;
    };
    if (s.status === "queued" || s.status === "in_progress") continue;
    const seconds = Math.round((Date.now() - started) / 1000);
    if (s.status !== "completed") {
      console.log(`[${job.id}] ${s.status} en ${seconds}s`, s.error ?? "");
      return { id: job.id, request_id: sub.request_id, status: s.status, seconds, files: [] as string[] };
    }
    const urls = [...(s.images ?? []).map((i) => i.url), ...(s.video ? [s.video.url] : [])];
    const files: string[] = [];
    for (const [i, url] of urls.entries()) {
      const ext = extname(new URL(url).pathname) || (s.video ? ".mp4" : ".png");
      const name = `${job.id}${urls.length > 1 ? `-${i + 1}` : ""}${ext}`;
      const res = await fetch(url);
      await writeFile(join(outDir, name), Buffer.from(await res.arrayBuffer()));
      files.push(name);
    }
    console.log(`[${job.id}] listo en ${seconds}s → ${files.join(", ")}`);
    return { id: job.id, request_id: sub.request_id, status: s.status, seconds, files, urls };
  }
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "presets") {
    const items: unknown[] = [];
    let cursor: string | null = null;
    do {
      const page = (await hf(`marketing-studio/image/presets?size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)) as {
        items: unknown[];
        cursor: string | null;
        total: number;
      };
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor);
    console.log(JSON.stringify(items, null, 2));
  } else if (cmd === "upload") {
    console.log(await upload(a));
  } else if (cmd === "estimate") {
    const jobs = JSON.parse(await readFile(a, "utf8")) as Job[];
    let total = 0;
    for (const job of jobs) {
      const e = await estimate(job);
      total += Number(e.usd);
      console.log(`${job.id.padEnd(12)} ${job.endpoint.padEnd(44)} $${e.usd} (${e.credits} créditos)`);
    }
    console.log(`TOTAL $${total.toFixed(4)}`);
  } else if (cmd === "run") {
    const jobs = JSON.parse(await readFile(a, "utf8")) as Job[];
    await mkdir(b, { recursive: true });
    const results = await Promise.all(jobs.map((j) => runJob(j, b).catch((e: Error) => ({ id: j.id, status: "error", error: e.message }))));
    await writeFile(join(b, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } else if (cmd === "resume") {
    // resume <plan.json> <salida> id=request_id …: consulta solicitudes ya enviadas sin volver a cobrarlas.
    const jobs = JSON.parse(await readFile(a, "utf8")) as Job[];
    const ids = Object.fromEntries(process.argv.slice(5).map((kv) => kv.split("=")));
    await mkdir(b, { recursive: true });
    const results = await Promise.all(
      jobs.filter((j) => ids[j.id]).map((j) => runJob(j, b, ids[j.id]).catch((e: Error) => ({ id: j.id, status: "error", error: e.message }))),
    );
    await writeFile(join(b, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } else {
    throw new Error("Comando: presets | upload <imagen> | estimate <plan.json> | run <plan.json> <salida>");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
