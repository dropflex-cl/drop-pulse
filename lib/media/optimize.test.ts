import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { LANDING_MAX_SIDE, optimizeForAds, optimizeImage, withExt } from "./optimize";

// Una "foto" con degradados y ondas: se comprime como una real (un color plano no prueba nada).
async function photo(width: number, height: number, format: "png" | "jpeg" = "png", alpha = false) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 128 + 60 * Math.sin(x / 40) * Math.cos(y / 30);
      if (alpha) raw[i + 3] = x < width / 2 ? 255 : 0;
    }
  const img = sharp(raw, { raw: { width, height, channels } });
  return format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 95 }).toBuffer();
}

/** PSNR en dB entre dos imágenes del mismo tamaño: sobre 40 dB la diferencia no se ve. */
async function psnr(a: Buffer, b: Buffer) {
  const [ra, rb] = await Promise.all([a, b].map((x) => sharp(x).flatten({ background: "#fff" }).removeAlpha().raw().toBuffer()));
  let sum = 0;
  for (let i = 0; i < ra.length; i++) sum += (ra[i] - rb[i]) ** 2;
  return 10 * Math.log10(255 ** 2 / (sum / ra.length));
}

describe("optimizeImage", () => {
  it("convierte un PNG a WebP mucho más liviano sin pérdida visible", async () => {
    const src = await photo(1200, 1200);
    const out = await optimizeImage(src);
    expect(out.mime).toBe("image/webp");
    expect((await sharp(out.data).metadata()).format).toBe("webp");
    expect(out.data.byteLength).toBeLessThan(src.byteLength / 3);
    expect(await psnr(src, out.data)).toBeGreaterThan(40);
  });

  it("achica a LANDING_MAX_SIDE sin agrandar nunca", async () => {
    const big = await optimizeImage(await photo(3000, 1500, "jpeg"));
    expect([big.width, big.height]).toEqual([LANDING_MAX_SIDE, LANDING_MAX_SIDE / 2]);
    const small = await optimizeImage(await photo(800, 600, "jpeg"));
    expect([small.width, small.height]).toEqual([800, 600]);
  });

  it("aplica la orientación EXIF de las fotos de teléfono", async () => {
    const src = await sharp(await photo(400, 200, "jpeg")).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await optimizeImage(src);
    expect([out.width, out.height]).toEqual([200, 400]);
  });

  it("conserva la transparencia", async () => {
    const out = await optimizeImage(await photo(300, 300, "png", true));
    expect((await sharp(out.data).metadata()).hasAlpha).toBe(true);
  });

  it("deja un WebP que ya es liviano tal como está", async () => {
    const src = await sharp(await photo(600, 600)).webp({ quality: 60 }).toBuffer();
    const out = await optimizeImage(src);
    expect(out.data.equals(src)).toBe(true);
  });

  it("un GIF animado sigue animado, como WebP", async () => {
    const frame = await photo(200, 200);
    const frames = await Promise.all([0, 1, 2].map((i) => sharp(frame).modulate({ hue: i * 90 }).raw().toBuffer()));
    const src = await sharp(Buffer.concat(frames), { raw: { width: 200, height: 600, channels: 3, pageHeight: 200 } }).gif({ loop: 0 }).toBuffer();
    const out = await optimizeImage(src);
    const meta = await sharp(out.data, { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(3);
    expect(out.height).toBe(200);
  });

  it("rechaza lo que no es una imagen", async () => {
    await expect(optimizeImage(Buffer.from("<html></html>"))).rejects.toThrow();
  });
});

describe("optimizeForAds", () => {
  it("entrega JPEG sin transparencia para Meta", async () => {
    const src = await photo(1080, 1920, "png", true);
    const out = await optimizeForAds(src);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.hasAlpha).toBe(false);
    expect([out.width, out.height]).toEqual([1080, 1920]);
    expect(out.data.byteLength).toBeLessThan(src.byteLength);
  });
});

describe("withExt", () => {
  it("cambia solo la extensión", () => {
    expect(withExt("u/p/abc.png", "webp")).toBe("u/p/abc.webp");
    expect(withExt("u/p/abc", "webp")).toBe("u/p/abc.webp");
  });
});
