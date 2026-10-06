# ADR 011: contenido final escrito en chat

Estado: aceptada para contenido de landing; otros adaptadores pendientes.

La decisión del comerciante amplía chat-first: también el contenido final, los guiones y los planes de texto deben originarse en el chat. El SaaS valida/persiste/publica y conserva las capacidades de imágenes. Esto sustituye la suposición de conservar redacción final pagada de landing/UGC descrita en ADR 005/006/007. El render de video queda pendiente de aclaración; no se cambió.

La landing reutiliza los 16 componentes y ficha existentes. `get_landing_content` expone un contrato por componente y datos reales; `save_landing_content` ingiere un batch como propuestas, con merge, CAS de contexto y página, receipt y audit. Los servicios no llaman modelos, providers ni publicadores. Usan `product_intelligence:read/write`; no solicitan scopes de generación porque no gastan.

La ejecución usa `copy_runs` y `page_components`, con snapshot canónico/actor/source y supersession. No duplica el grafo PI ni crea una segunda fuente de verdad de páginas. Su etag cambia sin incrementar el análisis. La UI decide aprobación/uso e imágenes y mantiene el publicador existente. El origen chat evita dependencias legacy y bloquea reescritura backend de esa página.

Los facts no se convierten en ciertos por escribirse en un componente. Los datos de tienda siguen separados: precio calculado, packs, reseñas, inventario, políticas y archivos. El esquema/validador original impone restricciones conocidas; las afirmaciones no comprobables mecánicamente requieren revisión. `context_stale` es conservador sobre el snapshot completo.

Consecuencias: cuatro migraciones locales antes de despliegue, nueve tools anunciadas; quedan adaptadores de otros tipos de texto, retiro completo legacy, restores atómicos, render/jobs de imágenes/video y validación de host remoto. Producción permanece readonly. Detalle, evidencia y flujo: [landing-content-mcp.md](../landing-content-mcp.md).
