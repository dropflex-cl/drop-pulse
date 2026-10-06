# ADR 016 — Ingestión completa, aprendizaje medido y render de galería

Estado: implementado y verificado localmente; despliegue pendiente. Complementa ADR 014/015.

El retiro de writers dejó huecos para conceptos/arte/conversaciones, planes de galería, eventos y consejos WhatsApp. La UI base seguía escribiendo campos legacy y las métricas no tenían un cierre persistente de aprendizaje.

Reutilizamos tablas operativas/render/revisión existentes mediante servicios de contenido comunes, sin reconstruir fichas, avatares o rankings retirados. Se crean solo dos entidades: `pi_gallery_operations` para el despacho durable y `pi_product_learnings` para congelar una observación junto con su medición. Ambas desaparecen por cascada al borrar el producto; ningún bucket nuevo.

La revisión básica de la UI protege el contexto leído y la transacción usa CAS global. Contenido usa revisión, etag y huella; recibo, auditoría y propuesta se confirman juntos. El consejo exige decisión humana y evidencia vigente. Las conversaciones creativas son dramatizaciones; los selectores de landing acompañan a los estáticos publicados en Meta.

`generate_gallery_images` ejecuta las tomas guardadas, con permiso `landing:generate`, proveedor del comerciante y estimación explícita. Status solo lee la base. Claim reautoriza y comprueba contexto/base; cron recupera interrupciones y evita reenvío automático ambiguo. El contrato viejo `generate_landing` permanece cerrado porque mezclaba redacción retirada con generación; sus capacidades vigentes se cubren mediante ingestión de landing y render de galería.

Performance usa únicamente campañas y filas diarias cacheadas de Meta. Aprendizaje no declara ganador ni selecciona estrategia; puede referenciarse como fuente interna de research posterior. No inventamos cobros COD ni atribución retrospectiva de ángulos/hooks. Esas capacidades exigen datos comprobados adicionales.

Consecuencias: nueve migraciones aditivas, nuevo cron y despliegue coordinado antes de habilitar MCP. La estimación no limita la factura externa, y una petición aceptada no puede deshacerse con CAS. Las pruebas mock/locales demuestran reglas y persistencia, no la conexión hosted ni la ejecución pagada. [Contrato, recorrido, límites y rollback](../chat-content-and-learning.md).
