import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { templateProblems } from "./render";
import { PROMPT_KEYS, type PromptKey } from "./tags";
import { toPromptSettings, type PromptSettingsView } from "./view";

// Los prompts guardados en la base (prompt_templates): la versión activa que usa la app y el historial
// que edita el administrador en Ajustes › Prompts. Cada guardado es una versión nueva; nunca se pisa una.

export type PromptEffort = "low" | "medium" | "high";

export interface PromptTemplate {
  id: string;
  key: PromptKey;
  version: number;
  body: string;
  model: string;
  effort: PromptEffort;
  max_tokens: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export class PromptError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** La versión que usa la app. Sin ella, el paso no puede correr. */
export async function activeTemplate(key: PromptKey): Promise<PromptTemplate> {
  const { data, error } = await adminClient().from("prompt_templates").select("*").eq("key", key).eq("is_active", true).maybeSingle();
  fail("Leer el prompt", error);
  if (!data) throw new PromptError("Falta el prompt de este paso. Pide a un administrador que lo active en Ajustes › Prompts.", 409);
  return data as PromptTemplate;
}

/** Todas las versiones, la más nueva primero. */
export async function listTemplates(key: PromptKey): Promise<PromptTemplate[]> {
  const { data, error } = await adminClient().from("prompt_templates").select("*").eq("key", key).order("version", { ascending: false });
  fail("Leer los prompts", error);
  return (data ?? []) as PromptTemplate[];
}

export interface TemplateInput {
  body: string;
  effort: PromptEffort;
  maxTokens: number;
  note?: string | null;
}

/** Guarda una versión nueva (la siguiente) y la deja activa. Falla si le falta un tag. */
export async function saveTemplate(key: PromptKey, input: TemplateInput, userId: string): Promise<PromptTemplate> {
  const problems = templateProblems(key, input.body);
  if (problems.length) throw new PromptError(problems.join(" "), 422);
  const db = adminClient();
  const current = await activeTemplate(key).catch(() => null);
  const last = await db.from("prompt_templates").select("version").eq("key", key).order("version", { ascending: false }).limit(1).maybeSingle();
  fail("Leer la última versión", last.error);
  const { data, error } = await db
    .from("prompt_templates")
    .insert({
      key,
      version: ((last.data?.version as number | undefined) ?? 0) + 1,
      body: input.body,
      model: current?.model ?? "claude-opus-5",
      effort: input.effort,
      max_tokens: input.maxTokens,
      note: input.note?.trim() || null,
      created_by: userId,
    })
    .select("*")
    .single();
  // Otro guardado tomó el mismo número al mismo tiempo.
  if (error?.code === "23505") throw new PromptError("Alguien guardó otra versión recién. Recarga y vuelve a intentarlo.", 409);
  fail("Guardar el prompt", error);
  await activateTemplate(data.id as string);
  return { ...(data as PromptTemplate), is_active: true };
}

/** Deja activa una versión (la anterior se apaga en la misma transacción). */
export async function activateTemplate(id: string): Promise<void> {
  fail("Activar el prompt", (await adminClient().rpc("activate_prompt_template", { p_id: id })).error);
}

/** Ajustes › Prompts: cada prompt con todas sus versiones. */
export async function promptSettings(): Promise<PromptSettingsView[]> {
  return Promise.all(
    PROMPT_KEYS.map(async (key) =>
      toPromptSettings(
        key,
        (await listTemplates(key)).map((t) => ({
          id: t.id,
          version: t.version,
          body: t.body,
          effort: t.effort,
          maxTokens: t.max_tokens,
          note: t.note,
          active: t.is_active,
          createdAt: t.created_at,
        })),
      ),
    ),
  );
}
