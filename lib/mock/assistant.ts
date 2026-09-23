// Conversaciones de ejemplo del asistente (ScreenAsistente y ScreenDeskProducto de bundle.js).
import type { AssistantMessage } from "@/components/df/assistant-sheet";

export const ASSISTANT_THREADS: Record<string, { messages: AssistantMessage[]; suggestions: string[] }> = {
  // El precio vive en Información base (stageKey "importado").
  "corrector-de-postura:importado": {
    messages: [
      { from: "user", text: "¿Me conviene bajar a $19.990?" },
      {
        from: "ai",
        text: [
          "Con $19.990 ganarías $3.590 por venta (18%). Si tu CPA sube a $7.000, pierdes dinero.",
          "Mejor: mantén $24.990 y ofrece 2 unidades por $39.990.",
        ],
        apply: "Crear oferta 2×$39.990",
      },
    ],
    suggestions: ["¿Qué precio usa la competencia?", "Escribe una garantía", "Otra oferta"],
  },
  "corrector-de-postura:textos": {
    messages: [
      { from: "user", text: "¿El título suena exagerado?" },
      {
        from: "ai",
        text: "“15 minutos al día” es concreto y creíble. Evita “cura” o “elimina el dolor”: Meta puede rechazar el anuncio.",
      },
    ],
    suggestions: ["Más corto", "Tono más cercano"],
  },
};

export const DEFAULT_SUGGESTIONS = ["¿Qué le falta para publicar?", "Escribe una garantía", "¿Qué precio me conviene?"];

/** Respuesta mientras el asistente no está conectado a la IA: dice qué pasa y qué hacer. */
export const OFFLINE_REPLY =
  "Todavía no puedo responder en esta versión de prueba. Tus decisiones sobre textos, imágenes y precio siguen disponibles en cada etapa.";
