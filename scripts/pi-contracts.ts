import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generationContextJsonSchema, publishedSchemas } from "../lib/product-intelligence/mcp";

const destination = join(process.cwd(), "docs/product-intelligence/contracts/generated");
mkdirSync(destination, { recursive: true });
for (const [tool, schemas] of Object.entries(publishedSchemas())) {
  writeFileSync(join(destination, `${tool}.input.json`), `${JSON.stringify(schemas.input, null, 2)}\n`);
  writeFileSync(join(destination, `${tool}.output.json`), `${JSON.stringify(schemas.output, null, 2)}\n`);
}
writeFileSync(join(destination, "generation-context.json"), `${JSON.stringify(generationContextJsonSchema(), null, 2)}\n`);
console.log("Exported 12 input/output pairs and GenerationContext from the shared domain.");
