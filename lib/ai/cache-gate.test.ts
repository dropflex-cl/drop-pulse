import { describe, expect, it } from "vitest";
import { afterCacheWarm } from "./cache-gate";

const later = <T,>(value: T, ms: number, log: string[], name: string) =>
  new Promise<T>((resolve) =>
    setTimeout(() => {
      log.push(name);
      resolve(value);
    }, ms),
  );

describe("afterCacheWarm", () => {
  it("la primera llamada sale sola y las demás esperan a que termine", async () => {
    const log: string[] = [];
    const started: string[] = [];
    const call = (name: string, ms: number) => () => {
      started.push(name);
      return later(name, ms, log, name);
    };
    const results = await Promise.all([afterCacheWarm("p1", call("a", 20)), afterCacheWarm("p1", call("b", 1)), afterCacheWarm("p1", call("c", 1))]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(started[0]).toBe("a");
    expect(log[0]).toBe("a");
  });

  it("otra clave no espera", async () => {
    const log: string[] = [];
    await Promise.all([afterCacheWarm("p2", () => later("x", 20, log, "x")), afterCacheWarm("p3", () => later("y", 1, log, "y"))]);
    expect(log).toEqual(["y", "x"]);
  });

  it("si la primera falla, las demás salen igual", async () => {
    const first = afterCacheWarm("p4", () => Promise.reject(new Error("falló")));
    const second = afterCacheWarm("p4", async () => "ok");
    await expect(first).rejects.toThrow("falló");
    await expect(second).resolves.toBe("ok");
  });

  it("pasados 4 minutos, la caché venció y la llamada sale sin esperar", async () => {
    const t0 = Date.now();
    let release!: () => void;
    const slow = afterCacheWarm("p5", () => new Promise<string>((r) => (release = () => r("vieja"))), t0);
    // No espera a la anterior (sigue pendiente): se convierte en la nueva primera.
    await expect(afterCacheWarm("p5", async () => "nueva", t0 + 5 * 60_000)).resolves.toBe("nueva");
    release();
    await expect(slow).resolves.toBe("vieja");
  });
});
