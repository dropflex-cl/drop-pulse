// Arma el prompt guardado con sus tags llenos, y revisa una versión antes de guardarla. Puro, con tests.

import { TAGS_BY_KEY, type PromptKey, type TagDef } from "./tags";

/** El prompt con cada tag reemplazado por su valor (todas las apariciones). Lo demás queda igual. */
export function renderPrompt<C>(body: string, tags: TagDef<C>[], ctx: C): string {
  return tags.reduce((text, t) => text.split(t.tag).join(t.resolve(ctx)), body);
}

/** Los valores de los tags, para guardarlos con la corrida (qué recibió el modelo). */
export function tagValues<C>(tags: TagDef<C>[], ctx: C): Record<string, string> {
  return Object.fromEntries(tags.map((t) => [t.tag, t.resolve(ctx)]));
}

/** Lo que está mal en una versión nueva: un tag que falta deja al modelo sin ese dato. */
export function templateProblems(key: PromptKey, body: string): string[] {
  const problems: string[] = [];
  if (body.trim().length < 50) problems.push("El prompt está vacío o es demasiado corto.");
  for (const t of TAGS_BY_KEY[key]) {
    if (!body.includes(t.tag)) problems.push(`Falta el tag ${t.tag} (${t.label}).`);
  }
  return problems;
}
