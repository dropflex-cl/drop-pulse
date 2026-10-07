import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { downloadVisual, optimizeVisual, publicVisualAddress, visualByteHash } from "./visual-media";
const network = vi.hoisted(() => ({ dns: [{ address: "8.8.8.8", family: 4 }], responses: [] as { status: number; headers: Record<string, string>; bytes?: Buffer }[] }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => network.dns) }));
vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  return { request: vi.fn((_url, _options, callback) => {
    const req = new EventEmitter();
    return Object.assign(req, { end() {
      const next = network.responses.shift(); if (!next) throw new Error("Unexpected request");
      const emitter = new EventEmitter();
      const res = Object.assign(emitter, { statusCode: next.status, headers: next.headers, resume() {}, destroy(error?: Error) { if (error) emitter.emit("error", error); } });
      callback(res); queueMicrotask(() => { if (next.bytes) res.emit("data", next.bytes); res.emit("end"); });
    } });
  }) };
});
beforeEach(() => { vi.clearAllMocks(); network.dns = [{ address: "8.8.8.8", family: 4 }]; network.responses = []; });
describe("Ingestión visual · seguridad y bytes", () => {
  it.each(["127.0.0.1", "10.0.1.4", "172.16.3.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "192.0.2.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])("bloquea IP no pública %s", async ip => {
    expect(publicVisualAddress(ip)).toBe(false);
    await expect(downloadVisual(`https://${ip.includes(":") ? `[${ip}]` : ip}/image`)).rejects.toThrow("pública");
    expect(request).not.toHaveBeenCalled();
  });
  it("bloquea credenciales, puertos y protocolos alternativos", async () => {
    for (const url of ["http://example.test/image", "https://user:pass@example.test/image", "https://example.test:8443/image", "file:///image"]) await expect(downloadVisual(url)).rejects.toThrow("HTTPS");
    expect(request).not.toHaveBeenCalled();
  });
  it("rechaza DNS mixto público/privado antes de conectarse", async () => {
    network.dns.push({ address: "10.0.0.1", family: 4 });
    await expect(downloadVisual("https://example.test/image")).rejects.toThrow("pública"); expect(request).not.toHaveBeenCalled();
  });
  it("fija la IP pública validada y vuelve a validar un redirect", async () => {
    network.responses = [{ status: 302, headers: { location: "https://169.254.169.254/metadata" } }];
    await expect(downloadVisual("https://example.test/image")).rejects.toThrow("pública");
    expect(lookup).toHaveBeenCalledWith("example.test", { all: true }); expect(request).toHaveBeenCalledTimes(1);
    const options = vi.mocked(request).mock.calls[0][1] as { lookup: (host: string, opts: object, cb: (err: Error | null, ip: string, family: number) => void) => void };
    const cb = vi.fn(); options.lookup("example.test", {}, cb); expect(cb).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  });
  it("limita redirects, bytes y tipo de respuesta", async () => {
    network.responses = Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/next" } }));
    await expect(downloadVisual("https://example.test/image")).rejects.toThrow("redirecciones");
    network.responses = [{ status: 200, headers: { "content-type": "text/html" } }]; await expect(downloadVisual("https://example.test/image")).rejects.toThrow("imagen");
    network.responses = [{ status: 200, headers: { "content-type": "image/png", "content-length": "16000000" } }]; await expect(downloadVisual("https://example.test/image")).rejects.toThrow("15 MB");
  });
  it("comprueba contenido real, resolución y SHA-256, optimiza a WebP", async () => {
    await expect(optimizeVisual(Buffer.from("not an image"))).rejects.toThrow();
    const small = await sharp({ create: { width: 599, height: 600, channels: 3, background: "black" } }).png().toBuffer(); await expect(optimizeVisual(small)).rejects.toThrow("600");
    const gif = await sharp({ create: { width: 600, height: 600, channels: 3, background: "black" } }).gif().toBuffer(); await expect(optimizeVisual(gif)).rejects.toThrow("estática");
    const png = await sharp({ create: { width: 601, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const optimized = await optimizeVisual(png); expect(optimized.mime).toBe("image/webp"); expect(optimized.width).toBe(601); expect((await sharp(optimized.data).metadata()).hasAlpha).toBe(true);
    expect(visualByteHash(optimized.data)).toMatch(/^[a-f0-9]{64}$/); expect(visualByteHash(optimized.data)).not.toBe(visualByteHash(png));
  });
});
