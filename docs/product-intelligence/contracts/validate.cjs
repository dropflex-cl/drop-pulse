/* eslint-disable @typescript-eslint/no-require-imports -- CLI CommonJS: tsx/cjs carga la calculadora pura de TypeScript. */
// Valida diseño y schemas generados completos; sin red, credenciales ni Supabase.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats").default;
const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8"));
const schema = read("schemas.json");
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema, "pi");
const compiled = new Map();
for (const name of Object.keys(schema.$defs)) {
  compiled.set(name, ajv.compile({ $ref: `pi#/$defs/${name}` }));
}
const catalog = read("tools.json");
const generated = new Map();
assert.equal(catalog.tools.length, 9);
assert.equal(new Set(catalog.tools.map((tool) => tool.name)).size, 9);
for (const tool of catalog.tools) {
  assert.equal(tool.input_schema, `schemas.json#/$defs/${tool.name}Input`);
  assert.equal(tool.output_schema, `schemas.json#/$defs/${tool.name}Output`);
  assert.equal(schema.$defs[`${tool.name}Input`].type, "object");
  assert.equal(schema.$defs[`${tool.name}Output`].type, "object");
  generated.set(`${tool.name}Input`, ajv.compile(read(`generated/${tool.name}.input.json`)));
  generated.set(`${tool.name}Output`, ajv.compile(read(`generated/${tool.name}.output.json`)));
}
function limits(value, maxBytes) {
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= maxBytes, "Envelope byte limit");
  function visit(item) {
    if (typeof item === "string") assert.ok(Buffer.byteLength(item) <= 8192, "Field UTF-8 byte limit");
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  }
  visit(value);
}
function check(entry, suffix) {
  limits(entry.payload, suffix === "Input" ? 262144 : 131072);
  const validate = compiled.get(`${entry.tool}${suffix}`);
  assert.ok(validate, `Missing tool schema ${entry.tool}`);
  assert.ok(validate(entry.payload), `${entry.name}: ${JSON.stringify(validate.errors)}`);
  const domainValidate = generated.get(`${entry.tool}${suffix}`);
  assert.ok(domainValidate(entry.payload), `Generated ${entry.name}: ${JSON.stringify(domainValidate.errors)}`);
}
const examples = read("examples.json");
examples.requests.forEach((entry) => check(entry, "Input"));
examples.responses.forEach((entry) => check(entry, "Output"));
for (const entry of examples.schema_invalid) {
  const validate = compiled.get(`${entry.tool}Input`);
  assert.equal(validate(entry.payload), false, `Invalid example accepted: ${entry.name}`);
  assert.equal(generated.get(`${entry.tool}Input`)(entry.payload), false, `Generated schema accepted: ${entry.name}`);
}
// Casos de tamaño real, distintos del límite de caracteres del JSON Schema.
assert.throws(() => limits({ field: "😀".repeat(3000) }, 262144), /UTF-8/);
assert.throws(() => limits({ fields: Array(40).fill("x".repeat(8000)) }, 262144), /Envelope/);
const context = read("generation-context.example.json");
limits(context, 262144);
assert.ok(compiled.get("GenerationContext")(context), JSON.stringify(compiled.get("GenerationContext").errors));
const generatedContext = ajv.compile(read("generated/generation-context.json"));
assert.ok(generatedContext(context), JSON.stringify(generatedContext.errors));
assert.equal(context.reference_images[0].is_base, true);
assert.ok(context.approved_fact_ids.every((id) => context.strategy.facts.some((fact) => fact.id === id && fact.verification_status === "verified" && fact.usage_status === "approved")));
// Los importes de la fixture salen de la calculadora actual, no de otro cálculo.
require("tsx/cjs");
const { buildPricingPlan } = require("../../../lib/pricing/plan.ts");
const plan = buildPricingPlan({ unitCost: 7000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75, salePrice: 29990, compareAtPrice: 44990, extraUnitDiscount: 50 }, "CLP");
assert.ok(plan);
assert.equal(context.pricing.recommended_price_minor, plan.recommendedPrice);
assert.equal(context.pricing.profit_decimal, String(plan.profit));
assert.deepEqual(context.pricing.packs.map((pack) => [pack.units, pack.price_minor, pack.recommended, pack.per_unit_price_decimal]), plan.packs.map((pack) => [pack.units, pack.price, pack.recommended, String(pack.perUnitPrice)]));
console.log(`Validated ${catalog.tools.length} tools, ${examples.requests.length} requests, ${examples.responses.length} responses, ${examples.schema_invalid.length} rejected inputs, 2 byte-limit cases and frozen context/pricing.`);
console.log("Scope: Ajv 8 draft 2020-12, design + generated domain schemas. DB/OAuth/HTTP/providers are not exercised.");
