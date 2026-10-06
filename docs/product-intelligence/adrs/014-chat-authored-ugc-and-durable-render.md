# ADR 014: guiones UGC desde chat y render durable

Estado: implementado en código y Supabase local; commit en main y migración aplicada/verificada en producción el 2026-10-06. Verificación hosted y actualización del tema pendientes. [Registro](../production-ugc-migration-2026-10-06.md). Continúa ADR 006/011/013.

El comerciante quiere redactar guiones y planificar tomas con su suscripción de ChatGPT. El SaaS debe validar y persistir esa propuesta, conservar revisión humana y generar los medios con las integraciones existentes.

Se agregan get/save_ugc_content y get_ugc_montage; generate_ugc ejecuta únicamente imágenes clave o clips de un guion aprobado. Se retira el writer de guiones pagado, sin fallback. La propuesta identifica estrategia, ángulo, hook y ejecución. Varias ejecuciones del mismo ángulo coexisten; persona y mascota conservan versiones independientes.

Se extienden video_scripts/video_shots y se añade pi_ugc_operations. UI y MCP comparten transacciones, CAS y cola. El worker reclama cada toma antes del submit, revalida el acceso/contexto y deja los envíos ambiguos pendientes de conciliación humana. Cron recupera after() interrumpidos. No se afirma idempotencia externa cuando el proveedor acepta una solicitud sin devolver su identificador.

Se conserva el montaje local, QA opcional y revisión del MP4. Cambios de guion/tomas invalidan clips/final. Shopify recibe videos finales aprobados por variante; Meta dirige cada ejecución a los mismos selectores, y ambos publicadores verifican vigencia. No se mezclan actores/IA con testimonios de compradores ni se convierte una selección en un ganador.

El costo es mantener versiones y una cola nueva. Se reutilizan Storage, medios, scripts y publicadores, sin crear otro pipeline creativo ni duplicar proveedores. Se necesita migración antes de la app, kit Shopify actualizado, cron operativo y aceptación hosted. [Flujo, garantías, rollout y rollback](../ugc-chat-mcp.md).
