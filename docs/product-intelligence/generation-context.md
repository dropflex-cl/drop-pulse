# Contrato histórico de contexto de generación

`GenerationContext 1.0` se conserva como contrato compatible y de auditoría: [schema generado](contracts/generated/generation-context.json) y [ejemplo ficticio](contracts/generation-context.example.json). No determina disponibilidad, selección ni publicación. Las reglas operativas están en [contenido vigente](current-content.md).

La fábrica `freezeGenerationContext` y sus pruebas se retiraron: no tenía consumidores en ejecución y exigía revisiones, snapshots y dependencias idénticas antes de generar. Los servicios explícitos de galería y UGC ya preparan sus trabajos con datos autorizados y contratos propios. No conectar nuevos consumidores al flujo histórico.

El schema y su exportador permanecen porque los contratos publicados y sus validadores aún los consumen. Sus campos de revisiones, stamps y selección congelada describen procedencia técnica; el comerciante no los administra. Las variantes por ángulo o hook representan alternativas comerciales, no versiones de este contrato.

## Reglas para trabajos solicitados

- Solo iniciar generación cuando el comerciante la pide. Cambiar contexto, estrategia, hooks, precios o políticas no inicia trabajos ni desactiva archivos y usos existentes.
- Leer el contenido vigente autorizado al preparar el trabajo. Conservar el input del trabajo para trazabilidad e idempotencia, sin convertirlo en una segunda fuente de verdad ni exigir reconciliación posterior.
- Comprobar propietario, permisos, producto no eliminado, credenciales propias, límites de gasto y archivos existentes antes de llamar al proveedor. Mantener concurrencia y leases para evitar escrituras perdidas o trabajos duplicados.
- Conservar la referencia base primero en el grupo de imágenes del producto y optimizar los archivos al ingresar. Una URL firmada temporal no es la identidad persistida del archivo.
- Validar autenticidad y evidencia de afirmaciones nuevas. Guardar contenido no verifica hechos ni convierte hipótesis en pruebas.
- Mantener los estados operativos reales: en cola, generando, terminado o error. El resultado guardado queda disponible y su uso depende de decisiones explícitas de selección, destino, orden y visibilidad.

Publicación usa el contenido efectivo compartido con UI y preview. Comprueba contenido necesario, archivos, destinos, conexión y permisos reales; una estrategia anterior no invalida una imagen seleccionada.
