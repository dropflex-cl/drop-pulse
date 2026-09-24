import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zip } from "./zip";

describe("zip", () => {
  it("lo abre unzip con los mismos bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "df-zip-"));
    const liquid = Buffer.from("{% comment %} ñandú · «hola» {% endcomment %}\n".repeat(50));
    const bin = Buffer.from([0, 1, 2, 255, 254, 10, 13]);
    writeFileSync(join(dir, "t.zip"), zip([
      { name: "sections/df-hola.liquid", data: liquid },
      { name: "assets/df-bin.woff2", data: bin },
    ]));
    execFileSync("unzip", ["-q", join(dir, "t.zip"), "-d", join(dir, "out")]);
    expect(readFileSync(join(dir, "out/sections/df-hola.liquid"))).toEqual(liquid);
    expect(readFileSync(join(dir, "out/assets/df-bin.woff2"))).toEqual(bin);
  });

  it("el mismo contenido da el mismo ZIP", () => {
    const a = zip([{ name: "a.txt", data: Buffer.from("x") }]);
    const b = zip([{ name: "a.txt", data: Buffer.from("x") }]);
    expect(a.equals(b)).toBe(true);
  });
});
