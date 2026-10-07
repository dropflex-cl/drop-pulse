# ADR 018 — Persuasión por ángulo y experiencia renderizable

Estado: implementado en el árbol de trabajo; validación local. Producción y publicación piloto pendientes.

La variante por componente conserva contenido y selectores, pero no decide qué argumento desarrolla la página ni qué componentes sobran. Incorporamos una capa entre Strategy y la ejecución, sin cambiar ProductAnalysis ni ProductStrategy.

Elegimos dos aggregates: AnglePersuasionPlan declara creencias, presupuesto, jobs, claims y dirección creativa; LandingExperience fija una revisión del plan y los bindings que el tema puede mostrar. Se conservan snapshots, RPC, permisos, CAS, recibos y revisión humana existentes. Un stamp leído por el cliente protege también dependencias que no cambian el etag de la experiencia. El plan consumido por una experiencia activa no se modifica.

El registry amplía el catálogo Shopify real y no duplica contratos visuales. La ficha comercial sigue nativa. El runtime reordena/oculta solo contenido DropFlex prepublicado, sin HTML procedente de query y con restauración legacy. Dos flags habilitan el despliegue; la activación local exige publicación explícita para afectar la tienda.

Los agentes construyen la narrativa; el backend expone contexto, valida y persiste. No agregamos `generate_pdp`. Copy, gallery y UGC siguen sus writers y renders actuales. Overrides manuales se conservan: una regeneración delegada no puede reemplazar copy/assets protegidos por una experiencia. UGC generado no equivale a prueba social real.

El historial permite learning por revisión. Las métricas siguen atribuidas a campañas; un evento del runtime facilita integración posterior y no demuestra conversión ni causalidad.

Alternativas descartadas: duplicar research/personas bajo ProductAnalysis; normalizar cada creencia/sección en tablas nuevas; generar todo server-side; imponer una plantilla por angle; abrir una arquitectura por hook; atribuir campañas a secciones retrospectivamente. Introducen otra fuente de verdad o afirmaciones que los datos no permiten.

Consecuencias y límites: hasta siete bloques principales y dos apoyos, veinte heads de cada aggregate por producto en V1; review humana del alcance de claims; cardinalidad nativa de tablas/tarjetas con copy acotado; sin JS se sirve legacy. El rollback de una tienda exige retirar/republicar el manifest. [Auditoría y fases](../pdp-persuasion-audit.md), [operación y validación](../pdp-persuasion-runbook.md).
