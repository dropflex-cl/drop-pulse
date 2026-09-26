import "server-only";
import { IMAGE_PROVIDER_NAME, pickImageProvider, type ImageProvider, type ImageProviderChoice, type ImageStage } from "@/lib/image-provider";
import { adminClient } from "./admin";
import { getGeminiConnection } from "./gemini/connection";
import { getHiggsfieldConnection } from "./higgsfield/connection";

// La elección de proveedor de imágenes por etapa (lib/image-provider.ts): qué hay disponible para el
// comerciante (su clave de Higgsfield o de Gemini, conectada y válida) y qué eligió. Todo con
// service_role, como las conexiones.

const TABLE = "image_provider_choices";

async function savedChoice(userId: string, stage: ImageStage): Promise<ImageProvider | null> {
  const { data, error } = await adminClient().from(TABLE).select("provider").eq("user_id", userId).eq("stage", stage).maybeSingle();
  if (error) throw new Error(`Leer el proveedor de imágenes: ${error.message}`);
  return (data?.provider as ImageProvider | undefined) ?? null;
}

/** Los proveedores de una etapa, cuál se usa y por qué no se puede usar el otro. */
export async function imageProviderChoice(userId: string, stage: ImageStage): Promise<ImageProviderChoice> {
  const [conn, gemini, saved] = await Promise.all([getHiggsfieldConnection(userId), getGeminiConnection(userId), savedChoice(userId, stage)]);
  const available = { higgsfield: conn?.status === "connected", gemini: gemini?.status === "connected" };
  return {
    value: pickImageProvider(saved, available),
    saved,
    options: [
      {
        id: "higgsfield",
        name: IMAGE_PROVIDER_NAME.higgsfield,
        available: available.higgsfield,
        ...(available.higgsfield ? {} : { reason: conn?.last_error ?? "Conecta tu cuenta de Higgsfield en Ajustes." }),
      },
      {
        id: "gemini",
        name: IMAGE_PROVIDER_NAME.gemini,
        available: available.gemini,
        ...(available.gemini ? {} : { reason: gemini?.last_error ?? "Conecta tu cuenta de Gemini en Ajustes." }),
      },
    ],
  };
}

/** Guarda la elección de la etapa. Lanza con el motivo si ese proveedor no se puede usar hoy. */
export async function saveImageProvider(userId: string, stage: ImageStage, provider: ImageProvider): Promise<ImageProviderChoice> {
  const choice = await imageProviderChoice(userId, stage);
  const option = choice.options.find((o) => o.id === provider);
  if (!option?.available) throw new ImageProviderUnavailable(option?.reason ?? "Ese proveedor no está disponible.");
  const { error } = await adminClient().from(TABLE).upsert({ user_id: userId, stage, provider, updated_at: new Date().toISOString() }, { onConflict: "user_id,stage" });
  if (error) throw new Error(`Guardar el proveedor de imágenes: ${error.message}`);
  return { ...choice, value: provider, saved: provider };
}

export class ImageProviderUnavailable extends Error {}

/**
 * Por qué no se puede generar en la etapa: la clave rechazada, si alguna lo fue (dice qué hacer), o que
 * falta conectar un proveedor.
 */
export function noProviderReason(choice: ImageProviderChoice, what: string): string {
  const rejected = choice.options.find((o) => o.reason && !/^Conecta tu cuenta/.test(o.reason));
  return rejected?.reason ?? `Conecta tu cuenta de Higgsfield o de Gemini en Ajustes para generar ${what}.`;
}
