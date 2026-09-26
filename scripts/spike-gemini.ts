// Prueba real del cliente de Gemini (lib/integrations/gemini/client.ts) con una imagen y un prompt tuyos.
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/spike-gemini.ts <imagen> "<prompt>" [1:1|3:4|9:16] [1K|2K|4K] [salida.png]
// Imprime el modelo que corrió, los tokens y el costo que quedaría en ai_generations. No registra nada.
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { generateImage, GeminiError, type GeminiAspectRatio } from "../lib/integrations/gemini/client";
import type { GeminiImageSize } from "../lib/integrations/gemini/pricing";

const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const [file, prompt, ratio = "1:1", size = "1K", out = "gemini-out.png"] = process.argv.slice(2);
if (!file || !prompt) throw new Error('Uso: spike-gemini.ts <imagen> "<prompt>" [proporción] [resolución] [salida]');
const mime = MIME[extname(file).toLowerCase()];
if (!mime) throw new Error(`Tipo no soportado: ${file}`);

try {
  const r = await generateImage({ prompt, images: [{ bytes: await readFile(file), mime }], aspectRatio: ratio as GeminiAspectRatio, size: size as GeminiImageSize });
  await writeFile(out, r.bytes);
  console.log({ out, model: r.model, fallback: r.fallback, size: r.size, mime: r.mime, width: r.width, height: r.height, usage: r.usage, costEstimated: r.costEstimated });
} catch (e) {
  if (e instanceof GeminiError) console.error({ code: e.code, message: e.message, status: e.status, usage: e.usage });
  else throw e;
  process.exitCode = 1;
}
