import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { referenceImageContent, REFERENCE_IMAGE_BYTES } from "./visual-reference";

describe("Referencia visual para el chat", () => {
  it("entrega los bytes originales y su hash cuando caben en MCP", async () => {
    const original = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 101, g: 24, b: 180, alpha: 0.5 } } }).png().toBuffer();
    const result = await referenceImageContent(original);
    expect(Buffer.from(result.content.data, "base64")).toEqual(original);
    expect(result.metadata).toMatchObject({ width: 600, height: 600, derived: false, mime_type: "image/png", content_hash: createHash("sha256").update(original).digest("hex") });
    expect(result.content).toMatchObject({ type: "image", mimeType: "image/png" });
  });
  it("reduce sin recortar, conserva transparencia y distingue la huella derivada", async () => {
    // PNG sin compresión: fuerza una preview incluso para un producto sencillo.
    const original = await sharp({ create: { width: 1800, height: 1200, channels: 4, background: { r: 101, g: 24, b: 180, alpha: 0.5 } } }).png({ compressionLevel: 0 }).toBuffer();
    expect(original.length).toBeGreaterThan(REFERENCE_IMAGE_BYTES);
    const result = await referenceImageContent(original), delivered = Buffer.from(result.content.data, "base64");
    expect(delivered.length).toBeLessThanOrEqual(REFERENCE_IMAGE_BYTES);
    expect(result.metadata.derived).toBe(true);
    expect(result.metadata.width / result.metadata.height).toBeCloseTo(1.5, 2);
    expect(result.metadata.content_hash).not.toBe(createHash("sha256").update(original).digest("hex"));
    expect((await sharp(delivered).metadata()).hasAlpha).toBe(true);
    const pixel = await sharp(delivered).raw().toBuffer();
    expect(pixel[0]).toBeCloseTo(101, -1); expect(pixel[2]).toBeCloseTo(180, -1);
  });
  it("aplica la orientación EXIF antes de entregar la referencia", async () => {
    const original = await sharp({ create: { width: 600, height: 800, channels: 3, background: "black" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await referenceImageContent(original);
    expect(result.metadata).toMatchObject({ width: 800, height: 600, derived: true });
    expect((await sharp(Buffer.from(result.content.data, "base64")).metadata()).orientation).toBeUndefined();
  });
  it("rechaza formatos inválidos y archivos fuera del presupuesto", async () => {
    await expect(referenceImageContent(Buffer.from("no image"))).rejects.toThrow();
    await expect(referenceImageContent(Buffer.alloc(16 * 1024 * 1024))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const gif = await sharp({ create: { width: 600, height: 600, channels: 3, background: "black" } }).gif().toBuffer();
    await expect(referenceImageContent(gif)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
