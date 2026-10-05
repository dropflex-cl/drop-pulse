// Ajustes › Prompts (solo admin): lo que ve la pantalla de cada prompt guardado en la base. Puro.
import { PROMPT_KEYS, PROMPT_NAMES, TAGS_BY_KEY, type PromptKey } from "./tags";

export type PromptEffortView = "low" | "medium" | "high";

export interface PromptVersionView {
  id: string;
  version: number;
  body: string;
  effort: PromptEffortView;
  maxTokens: number;
  note: string | null;
  active: boolean;
  createdAt: string;
}

export interface PromptSettingsView {
  key: PromptKey;
  name: string;
  desc: string;
  /** Lo que el sistema pone en cada tag. */
  tags: { tag: string; label: string }[];
  /** La más nueva primero. */
  versions: PromptVersionView[];
}

export function toPromptSettings(key: PromptKey, versions: PromptVersionView[]): PromptSettingsView {
  return { key, ...PROMPT_NAMES[key], tags: TAGS_BY_KEY[key], versions };
}

export { PROMPT_KEYS };
