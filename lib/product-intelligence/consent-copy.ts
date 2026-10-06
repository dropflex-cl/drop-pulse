import type { PiScope } from "./policy";

/** Textos de design-system/oauth.md. */
export const consentPermissions: readonly { scope: PiScope; label: string; hint: string }[] = [
  { scope: "product_intelligence:read", label: "Consultar contexto y estrategia", hint: "Lee los productos, análisis y decisiones guardadas." },
  { scope: "product_intelligence:write", label: "Guardar análisis y estrategia", hint: "Guarda el contenido del chat y cambia la estrategia seleccionada." },
  { scope: "product_intelligence:verify", label: "Revisar hechos y evidencia", hint: "Puede confirmar o descartar hechos y sus fuentes." },
  { scope: "landing:generate", label: "Generar página del producto", hint: "Puede iniciar generación con tus proveedores y consumir créditos." },
  { scope: "ugc:generate", label: "Generar UGC", hint: "Puede iniciar guiones, imágenes y clips con tus proveedores y consumir créditos." },
  { scope: "performance:read", label: "Consultar métricas", hint: "Lee resultados y métricas disponibles del producto." },
];
