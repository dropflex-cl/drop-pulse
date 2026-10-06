# ADR 003 — Identidad y permisos de UI y MCP

Estado: policy y OAuth/Supabase/sesión/grants locales implementados; hosted y host remoto pendientes. Fecha: 2026-10-06.

## Contexto

El SaaS usa cookies Supabase, un usuario/dueño y una conexión Shopify. `adminClient` salta RLS. El proxy exige sesión para `/api/*`, con excepciones acotadas. En Fase 0 no se comprobó OAuth remoto habilitado y el config local lo desactivaba. La actualización implementada se documenta en [ADR 008](008-supabase-oauth-isolation.md); no cambia producción. E02, E05–E08, E40 de la [auditoría](../audit-current-model.md#7-registro-de-evidencia).

## Decisión

Tenant físico V1 es `auth.users.id`. Un `Principal` confiable contiene dueño, actor, tipo, client y scopes; se construye desde sesión UI o bearer verificado. El cliente nunca puede elegir user_id/tenant_id. No introducir organizations/memberships sin necesidad comprobada. La adaptación de UI conserva sesión actual y pasa el principal al dominio compartido.

MCP es un resource server remoto OAuth. Validar firma/introspección, issuer, expiry, audience/resource y scopes en cada request, además del grant vigente al producto. Una identidad del proveedor se mapea explícitamente al dueño Supabase, sin confiar en email coincidente. No usar claves del comerciante, service_role ni cookies como token MCP. El servidor no pasa el bearer a Shopify/Meta. Metadata protegida/discovery y challenges se implementan según el [protocolo de autorización MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

Scopes del spec: `product_intelligence:read`, `product_intelligence:write`, `product_intelligence:verify`. Verify exige autorización explícita del dueño y permite revisar evidencia/uso; write normal solo propone unverified/pending y no modifica estados sensibles existentes. Tampoco puede reescribir statement/value/unit de un fact aprobado dejando su aprobación intacta: exigir verify y revisar evidencia del nuevo contenido. Admin de plantillas no adquiere acceso a otros comerciantes. Recursos ajenos retornan NOT_FOUND sin exponer dueño, estados ni refs; todas las relaciones se autorizan también.

ADR 006 amplía ejecución con scopes propuestos landing:generate y ugc:generate. El permiso write no incluye gastos de generación, publicación ni launch Meta. Autorización para leer operation_id/outputs vuelve a comprobar dueño/producto; credenciales de proveedores permanecen en backend y se requieren solo al ejecutar pasos que los utilizan.

Usar `pi_access_grants` para actor/client autorizado, scopes y revocación, con producto opcional y vigencia. Comprobar grant antes de replay/cursor. RLS por dueño y FKs compuestas complementan la policy del dominio; service_role no es una autorización de producto. Pruebas incluyen claims de otro issuer, audiencia distinta, expirados, scope ausente, revocado y relaciones de otro producto del mismo dueño.

## Límite y siguiente decisión

Se eligió Supabase OAuth nativo y se comprobó login, consentimiento, tokens/refresh, revocación y aislamiento local. Los permisos propios viven en grants, no en scopes OAuth personalizados. V1 concede el catálogo del dueño por 30 días; producto opcional sigue como ampliación. Ver ADR 008 para rol y separación de sesión que impiden usar el bearer en APIs/SaaS. Un host concreto sigue pendiente; no se presume compatibilidad con cualquier plan de ChatGPT.

La Fase 0 no modifica auth. El endpoint Next implementa una excepción estrecha de proxy para MCP/discovery, manteniendo validación bearer propia; las instrucciones del repositorio protegen `proxy.ts`, `lib/supabase/*` y auth. La autorización específica fue recibida y se aplicó el cambio documentado en auth-change-plan.md. No es un bloqueo para entregar esta auditoría.
