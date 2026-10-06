> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

> Estado actual: aplicar las cinco migraciones PI, incluyendo `20261105000000_product_intelligence_landing.sql` y `20261106000000_product_intelligence_pack_labels.sql`, antes del código. Runtime anuncia once tools persistentes. Producción continúa readonly; este runbook no autoriza desplegar/configurar producción.

# Verificación y activación OAuth MCP

Estado: local comprobado; piloto no activado. Producción sigue en solo lectura.

## Desarrollo local

Aplicar las migraciones locales sin reset: `supabase migration up --local`. `supabase/config.toml` habilita el servidor OAuth y `pi_custom_access_token_hook` solo en el runtime local. La migración usa las tablas nativas Auth de la versión probada. No ejecutar `db push`, `config push` ni comandos remotos para estas pruebas.

Preview: `MCP_ENABLED=true MCP_RESOURCE_URL=http://localhost:3000/api/mcp npm run dev -- --webpack`. `.env.local` debe apuntar a `http://127.0.0.1:55321` y APP_URL a `http://localhost:3000`. El estado habitual sin MCP_ENABLED=true oculta el enlace y devuelve 404 en MCP/metadata. Configurado, publica las siete tools persistentes de contexto/conocimiento/estrategia. Aplicar antes las migraciones OAuth, contexto y conocimiento; la calculadora UI también depende de la RPC de contexto. Las tools pendientes no se anuncian ni ejecutan generación.

Pruebas repetibles, con runtime local ya iniciado:

```sh
node --env-file=.env.local --import tsx scripts/pi-oauth-local.ts
node --env-file=.env.local --import tsx scripts/pi-oauth-ui-local.ts
```

La segunda requiere preview en puerto 3000. Ambas se niegan a escribir si Supabase URL no es exactamente la local; crean usuarios/clientes ficticios y solo borran los que crearon. No imprimen claves, JWT ni refresh tokens. La segunda deja capturas en `/private/tmp/pi-oauth-consent-<ancho>-<tema>.png`. El servidor Next puede registrar URLs de callback local; los códigos de prueba se consumen y se revocan, y esos logs no se deben publicar.

## Configuración necesaria antes del piloto

1. Primero completar el DomainExecutor y sus pruebas transaccionales, receipts/audit, replay y outbox. El transporte recibe un ejecutor real; no sustituir el gate con fixtures.
2. En entorno hosted de prueba autorizado, comprobar versión/campos de Auth, JWT asimétrico disponible por JWKS, metadatos OAuth, recurso exacto, grants y separación de sesión. Repetir explícitamente Auth PUT, REST/RPC/Storage, cookie delegada, refresh y revocación. Si falla una frontera, mantener MCP deshabilitado.
3. Registrar el cliente objetivo con sus redirect_uri reales. DCR permanece apagado; no asumir que un host puede usar registro manual. Verificar discovery y OAuth con ChatGPT/Codex elegido, y después tools de lectura/escritura sin generación de pago.
4. Recurso `MCP_RESOURCE_URL=https://<app>/api/mcp`, APP_URL con ese mismo origen, NEXT_PUBLIC_SUPABASE_URL del proyecto correcto. MCP_ALLOWED_ORIGINS opcional: lista separada por comas de orígenes HTTPS confiables; no comodines. No derivar recurso/issuer de headers.
5. Configurar hook y OAuth hosted solo con autorización de escritura productiva explícita. Consent path `/oauth/consent`. Mantener `pi_mcp` fuera de authenticator y sin login/privilegios, y no crear auth.sessions para los identificadores de delegación.
6. Verificar Next/Vercel y región gru1, preservando coordinación Supabase sa-east-1. No se hizo un deploy en esta entrega.

En la instancia local, el gateway devuelve 404 en el discovery RFC 8414 de raíz, pero expone OIDC discovery en `/auth/v1/.well-known/openid-configuration`. El SDK oficial 1.32.0 encontró correctamente el issuer usando ese fallback. Comprobar también el endpoint de raíz hosted documentado por Supabase; no anunciar que ambos gateways son iguales.

## Rollback operativo

Apagar MCP_ENABLED primero: herramientas y metadata dejan de exponerse. Revocar grants locales y las sesiones OAuth nativas de los clientes MCP; conservar datos/catálogo/piezas y grants para diagnóstico. No borrar tablas ni revertir migraciones para un rollback operativo.

Si se retira el hook, **deshabilitar el servidor OAuth y revocar sus sesiones/refresh antes**. Quitar el hook dejando OAuth activo puede emitir tokens normales authenticated a clientes delegados. Conservar la validación merchant y la separación del rol; esperar la expiración/revocación de JWT existentes y verificar que no se minten otros antes de quitar defensas. La auth merchant puede mantener el hook mientras OAuth esté desactivado: para sus sesiones devuelve claims originales.

No habilitar automáticamente el pipeline anterior, publicar, lanzar Meta ni repetir una generación pagada como parte del rollback.
