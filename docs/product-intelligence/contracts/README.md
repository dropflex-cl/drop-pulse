# Artefactos revisables de contrato

Contrato `1.0` previo al despliegue. Hay dominio Zod y servidor SDK local; faltan endpoint remoto y tablas PI. Semántica: [mcp-contracts.md](../mcp-contracts.md), [GenerationContext](../generation-context.md), [ADR 007](../adrs/007-contracts-and-generation-boundaries.md) y [estado](../implementation-status.md).

- [schemas.json](schemas.json): borrador de diseño JSON Schema 2020-12. Se conserva para comprobar equivalencia de ejemplos; no se importa desde runtime.
- [generated/](generated/): diez pares de schemas y contexto interno exportados desde [schemas.ts](../../../lib/product-intelligence/schemas.ts). El SDK publica estos contratos derivados, con `$defs` locales completos.
- [tools.json](tools.json): catálogo propuesto, scopes y annotations; no es un endpoint ni un resultado de discovery ejecutado.
- [examples.json](examples.json): 17 entradas válidas, 16 salidas válidas y 20 entradas que deben rechazarse por schema. Secuencia ficticia, cuatro personas/ocho ángulos; sin contenido de producción.
- [generation-context.example.json](generation-context.example.json): contexto congelado ficticio; IDs/checksums/versiones son ilustrativos. Pricing procede de la calculadora real del repositorio.
- [domain-cases.md](domain-cases.md): cobertura de dominio y casos aún pendientes del servicio/DB/host.
- [validate.cjs](validate.cjs): verificador local sin red, credenciales ni Supabase.

Desde la raíz del repo:

```bash
npm run pi:contracts
npx vitest run lib/product-intelligence
```

Usa Ajv 8 como dependencia explícita, draft 2020-12 completo y tsx para importar la calculadora pura. Verifica ambos juegos de schemas, referencias, límites y ejemplos/pricing. El SDK oficial 1.32.0 se prueba con Client/InMemoryTransport, discovery paginado y envelopes. Estos comandos no abren red ni usan Supabase/proveedores. OAuth/RLS, transacciones de contexto/grafo/estrategia y cursores tienen pruebas locales separadas; generación y cliente remoto siguen pendientes. Ver estado de implementación.

No editar el spec original para ocultar cambios de alcance: estos contratos concretan la dirección posterior del usuario. Cambios antes del primer despliegue revisan el borrador; una vez publicado, cambios incompatibles necesitan versión nueva y estrategia de compatibilidad. Los tipos se reexportan en `lib/types.ts`; la UI sigue leyendo por `lib/data/`.
