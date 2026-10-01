import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// La API de Anthropic (Claude) con la clave del comerciante, igual que Higgsfield y Gemini: no hay
// clave del servidor de respaldo (nunca se lee ANTHROPIC_API_KEY). Las llamadas de la IA viven en
// lib/ai/claude.ts; aquí, el cliente, la validación de la clave y los errores. Nunca se loguea la clave.

/** Qué pasó, con un código para el registro y un mensaje en español para la pantalla. */
export class AnthropicError extends Error {
  constructor(
    public code: "invalid_key" | "no_access" | "no_credits" | "busy" | "unavailable" | "network",
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Cliente con la clave dada. `apiKey` siempre explícita: el SDK leería ANTHROPIC_API_KEY si faltara. */
export function anthropicClient(apiKey: string, maxRetries = 2): Anthropic {
  if (!apiKey) throw new AnthropicError("invalid_key", "Falta la clave de Anthropic.");
  return new Anthropic({ apiKey, maxRetries });
}

const NO_CREDITS = /credit balance is too low|billing/i;
// Una clave sin workspace (de la organización) recibe 400 «not scoped to a workspace».
const NO_WORKSPACE = /workspace/i;

/** Errores del SDK que dependen de la cuenta del comerciante (clave, saldo, acceso); null si no. */
export function accountError(e: unknown): AnthropicError | null {
  if (e instanceof AnthropicError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AnthropicError("invalid_key", "Anthropic no reconoce tu clave. Pega una nueva en Ajustes.", 401);
  if (e instanceof Anthropic.PermissionDeniedError) return new AnthropicError("no_access", "Tu clave de Anthropic no tiene permiso para usar Claude. Crea una nueva en la consola de Anthropic.", 403);
  if (e instanceof Anthropic.BadRequestError && NO_CREDITS.test(e.message)) {
    return new AnthropicError("no_credits", "Tu cuenta de Anthropic no tiene saldo. Carga créditos en la consola de Anthropic y reintenta.", 400);
  }
  if (e instanceof Anthropic.BadRequestError && NO_WORKSPACE.test(e.message)) {
    return new AnthropicError("no_access", "Esa clave es de la organización. Crea una dentro de un workspace (consola de Anthropic › Workspaces › API keys).", 400);
  }
  return null;
}

/**
 * Valida la clave con una lectura que no cuesta (los datos del modelo de la app). Lanza AnthropicError
 * con el motivo en español si Anthropic la rechaza.
 */
export async function checkKey(key: string, model: string): Promise<void> {
  try {
    await anthropicClient(key, 0).models.retrieve(model, undefined, { timeout: 15_000 });
  } catch (e) {
    const account = accountError(e);
    if (account) throw account;
    if (e instanceof Anthropic.NotFoundError) throw new AnthropicError("no_access", "Tu cuenta de Anthropic no tiene acceso al modelo que usa DropFlex (Claude Opus 5).", 404);
    if (e instanceof Anthropic.RateLimitError) throw new AnthropicError("busy", "Anthropic está con mucha demanda. Intenta de nuevo en un minuto.", 429);
    if (e instanceof Anthropic.APIConnectionError) throw new AnthropicError("network", "No pudimos conectarnos con Anthropic. Intenta de nuevo en un momento.");
    if (e instanceof Anthropic.APIError) throw new AnthropicError("unavailable", "Anthropic no respondió. Intenta de nuevo en un momento.", e.status);
    throw new AnthropicError("network", "No pudimos conectarnos con Anthropic. Intenta de nuevo en un momento.");
  }
}
