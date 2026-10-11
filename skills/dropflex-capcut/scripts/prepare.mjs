import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const maxBytes = 100 * 1024 * 1024;
function safeUrl(value, allowLocal) {
  const u = new URL(value);
  const local = allowLocal && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
  if ((u.protocol !== 'https:' && !local) || u.username || u.password) throw new Error('El medio no tiene una URL HTTPS válida.');
  return u.href;
}
async function download(url, file, allowLocal) {
  const partial = `${file}.part`;
  try {
    const response = await fetch(safeUrl(url, allowLocal), { redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error('Renueva el paquete en DropFlex: no pudimos descargar un medio.');
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('Un medio supera los 100 MB.');
      chunks.push(chunk);
    }
    if (!bytes) throw new Error('Un medio está vacío.');
    const data = Buffer.concat(chunks);
    await writeFile(partial, data, { flag: 'wx' });
    await rename(partial, file);
    return { size_bytes: bytes, sha256: createHash('sha256').update(data).digest('hex') };
  } finally { await rm(partial, { force: true }); }
}

/** Sin IA ni render. allowLocal se utiliza únicamente en la prueba con servidor ficticio. */
export async function preparePackage(raw, destination, { allowLocal = false } = {}) {
  const pkg = raw?.data?.package ?? raw?.structuredContent?.data?.package ?? raw;
  if (pkg?.version !== 2 || !Array.isArray(pkg.a_roll) || !pkg.a_roll.length || !Array.isArray(pkg.b_roll) || !pkg.end_card?.image_url) throw new Error('Necesitamos el paquete UGC v2 completo.');
  if (pkg.expires_at && Date.parse(pkg.expires_at) < Date.now()) throw new Error('El paquete venció. Recupera get_ugc_montage o descárgalo de nuevo.');
  const clips = [...pkg.a_roll, ...pkg.b_roll], seen = new Set();
  if (clips.length > 40) throw new Error('El paquete contiene demasiados clips.');
  for (const c of clips) {
    if (!/^[AB][1-9][0-9]*$/.test(c.key) || seen.has(c.key)) throw new Error('Las claves de tomas no son válidas o están duplicadas.');
    seen.add(c.key); safeUrl(c.url, allowLocal);
  }
  safeUrl(pkg.end_card.image_url, allowLocal);
  const dir = path.resolve(destination);
  // Nunca modifica un proyecto existente, ni siquiera si la descarga previa quedó incompleta.
  await mkdir(dir);
  const local = structuredClone(pkg);
  const analysis = { clips: [], available: false };
  let ffmpeg = false;
  try { await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']); ffmpeg = true; } catch { /* Los medios siguen utilizables en CapCut. */ }
  const files = new Map();
  for (const c of clips) {
    const name = `${c.key}.mp4`, absolute = path.join(dir, name);
    const info = await download(c.url, absolute, allowLocal);
    files.set(c.key, { file: name, ...info });
    if (ffmpeg) {
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', absolute], { timeout: 30000 });
      const facts = JSON.parse(stdout), video = facts.streams?.find(s => s.codec_type === 'video');
      const duration = Number(video?.duration ?? facts.format?.duration);
      if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 60) throw new Error('Un archivo no es un clip de video válido.');
      const frames = [];
      for (const second of [0, ...Array.from({ length: Math.floor((duration - 0.1) / 2) }, (_, i) => (i + 1) * 2)]) {
        const name = `${c.key}-${second}s.jpg`;
        await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(second), '-i', absolute, '-frames:v', '1', '-vf', 'scale=360:-2', path.join(dir, name)], { timeout: 30000 });
        frames.push({ second, file: name });
      }
      analysis.clips.push({ key: c.key, duration_s: duration, width: video.width, height: video.height, has_audio: facts.streams.some(s => s.codec_type === 'audio'), frames });
    }
  }
  const basePath = path.join(dir, 'product-image');
  const base = await download(pkg.end_card.image_url, basePath, allowLocal);
  const header = (await readFile(basePath)).subarray(0, 16);
  const ext = header[0] === 0xff && header[1] === 0xd8 ? 'jpg' : header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!ext) throw new Error('La referencia no es una imagen JPEG, PNG o WebP válida.');
  let imageName = `product.${ext}`;
  await rename(basePath, path.join(dir, imageName));
  if (ffmpeg && ext === 'webp') {
    imageName = 'product.jpg';
    await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', path.join(dir, 'product.webp'), '-frames:v', '1', path.join(dir, imageName)], { timeout: 30000 });
  }
  local.a_roll = local.a_roll.map(({ url, ...c }) => { void url; return { ...c, ...files.get(c.key) }; });
  local.b_roll = local.b_roll.map(({ url, ...c }) => { void url; return { ...c, ...files.get(c.key) }; });
  delete local.end_card.image_url;
  local.end_card.image_file = imageName;
  local.end_card.image_sha256 = createHash('sha256').update(await readFile(path.join(dir, imageName))).digest('hex');
  local.end_card.source_image_sha256 = base.sha256;
  local.prepared_at = new Date().toISOString();
  // El vencimiento corresponde a las URLs originales; los archivos locales ya no vencen.
  delete local.expires_at;
  analysis.available = ffmpeg;
  await writeFile(path.join(dir, 'package.local.json'), JSON.stringify(local, null, 2) + '\n');
  await writeFile(path.join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
  return { directory: dir, clips: clips.length, analyzed: ffmpeg };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('Uso: node prepare.mjs paquete.json nueva-carpeta'); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(await preparePackage(JSON.parse(await readFile(input, 'utf8')), output))); }
    catch (error) { console.error(error instanceof Error && !/https?:\/\//.test(error.message) ? error.message : 'No pudimos preparar el material. Renueva el paquete e intenta en otra carpeta.'); process.exitCode = 1; }
  }
}
