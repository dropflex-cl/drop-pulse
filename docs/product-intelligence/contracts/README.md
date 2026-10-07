# Contratos exportados

Fuente vigente: Zod en `lib/product-intelligence/`. **36 pares input/output** más GenerationContext en [generated/](generated/); siete tools PDP se anuncian solo con flag. El servidor usa esos mismos schemas; la tool generate_landing fue eliminada.

[schemas.json](schemas.json) y [tools.json](tools.json) conservan el subconjunto de diseño inicial de nueve tools aún válidas. [examples.json](examples.json) tiene 15 entradas, 14 salidas y 20 rechazos de ese subconjunto. No son el catálogo completo ni se usan en runtime. Las nuevas verticales tienen fixtures y pruebas de dominio/DB junto al código.

`npm run pi:contracts` exporta el catálogo completo y comprueba schemas draft 2020-12/Ajv, ejemplos, límites UTF-8 y pricing contra la calculadora. `npx vitest run lib/product-intelligence` comprueba dominio y SDK. Las suites opt-in DB usan Supabase local, fixtures propios y limpieza; no invocan proveedores pagados.

[Semántica](../mcp-contracts.md), [estado](../implementation-status.md), [casos](domain-cases.md), [UGC](ugc.example.json) y [contexto ficticio](generation-context.example.json). El spec original se conserva sin cambios; actor/tenant nunca provienen del input del chat.
