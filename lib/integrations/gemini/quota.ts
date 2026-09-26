// Las dos caras de un 429 de Gemini (portado de dropflex v1, lib/ai/gemini/quota.ts). Puro, con tests.
//
// Google responde toda cuota agotada con el mismo `429 RESOURCE_EXHAUSTED`, sea la ventana de un minuto,
// de un día o un proyecto sin presupuesto. Solo el cuerpo lo dice: el `quotaId` de sus `QuotaFailure`
// (`GenerateRequestsPerMinutePerProjectPerModel`, `…PerDay…`) y `limit: 0` cuando el modelo no tiene cuota.
// Leer todo 429 como «ocupado» dejó en v1 la portada fallando seis días con un «reintenta en unos
// minutos». Por eso lo predeterminado es `quota`: un 429 es pasajero solo si el cuerpo prueba que la
// ventana es corta.

export type Gemini429Kind = "rate" | "quota";

// Una ventana por minuto se repone sola: el reintento con espera es la respuesta.
const SHORT_WINDOW = /per\s*minute|perminute|try again later/i;
// Tope diario, modelo sin cuota o créditos prepagados agotados: nada de eso se repone en segundos. No
// «billing»: todo 429 de Gemini dice «check your plan and billing details», también el por minuto.
const LONG_WINDOW = /per\s*day|perday|limit:\s*0\b|prepa(?:y|id)|credits?|spend(?:ing)?\s*cap/i;

/**
 * @example
 * classifyGemini429('… "quotaId": "GenerateRequestsPerMinutePerProjectPerModel" …') // → "rate"
 * classifyGemini429('… "quotaId": "GenerateRequestsPerDayPerProjectPerModel" …')    // → "quota"
 * classifyGemini429("")                                                             // → "quota"
 */
export function classifyGemini429(message: string): Gemini429Kind {
  // La ventana larga gana aunque venga junto a una por minuto: pasado el minuto, el día sigue agotado.
  if (LONG_WINDOW.test(message)) return "quota";
  if (SHORT_WINDOW.test(message)) return "rate";
  return "quota";
}
