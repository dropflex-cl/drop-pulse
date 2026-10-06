import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

async function files(dir: string): Promise<string[]> {
  const rows = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(rows.map((row) => row.isDirectory() ? files(path.join(dir, row.name)) : Promise.resolve([path.join(dir, row.name)])))).flat();
}

/** Evita reintroducir un writer de pago en una ruta menos visible. La excepción es el QA visual. */
describe("arquitectura · todo texto de marketing se escribe desde el chat", () => {
  it("los únicos callers de generateStructured son las tres revisiones de imágenes", async () => {
    const calls: string[] = [];
    for (const file of [...await files("lib"), ...await files("app")].filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))) {
      const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["generateStructured", "generateText", "writePage"].includes(node.expression.text)) calls.push(`${file}:${node.expression.text}`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(calls.sort()).toEqual(["lib/pipeline/creatives.ts:generateStructured", "lib/pipeline/page-images.ts:generateStructured", "lib/pipeline/video.ts:generateStructured"]);
  });
  it("el cliente UI no envía mutaciones a los writers retirados ni los dispara al continuar", async () => {
    const client = await readFile("lib/products/client.ts", "utf8");
    for (const name of ["writeCopy", "generateStrategy", "confirmStrategy", "proposeCreatives", "createChat", "writeScript", "proposePageImages", "writeUsageTip", "identifyProduct", "regeneratePackLabels"]) expect(client).not.toContain(`${name}:`);
    expect(await readFile("components/screens/page-images.tsx", "utf8")).not.toContain("productsApi.writeCopy");
  });
});
