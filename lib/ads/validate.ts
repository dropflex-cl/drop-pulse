// Qué le falta a una configuración para lanzarse (docs/spec-anuncios.md §7.1 y §7.4), por sección del
// configurador: una sección con error bloquea «Revisar y lanzar» y lleva el foco a ella. Lo usan la
// pantalla (en vivo) y el servidor (antes de crear nada en Meta). Puro.

import { money } from "@/lib/format";
import { adsetCount, dailyTotal, engineProblems, engineSchema, launchSchema, MAX_ADSETS, MAX_DCO_MEDIA, type EngineConfig, type LaunchConfig, type Structure } from "./schemas";

export const CONFIG_SECTIONS = ["creatives", "audience", "budget", "copy", "engine"] as const;
export type ConfigSectionKey = (typeof CONFIG_SECTIONS)[number];

export interface MediaFacts {
  id: string;
  kind: "image" | "video";
  status: "uploading" | "processing" | "ready" | "error";
}

export interface LaunchFacts {
  media: MediaFacts[];
  /** Tope de gasto diario de la cuenta (Ajustes); null si todavía no se definió. */
  spendCap: number | null;
  currency: string;
}

const SECTION_OF: Record<string, ConfigSectionKey> = {
  creatives: "creatives",
  countries: "audience",
  excluded_regions: "audience",
  location: "audience",
  min_age: "audience",
  audiences: "audience",
  cbo_ads: "creatives",
  budget: "budget",
  start: "budget",
  start_hour: "budget",
  primary_texts: "copy",
  headlines: "copy",
  description: "copy",
  cta: "copy",
};

const FIELD_MESSAGE: Record<string, string> = {
  countries: "Elige al menos un país.",
  budget: "Escribe un presupuesto diario.",
  primary_texts: "Escribe al menos un texto principal (hasta 500 caracteres).",
  headlines: "Escribe al menos un título (hasta 40 caracteres).",
  description: "La descripción tiene hasta 30 caracteres.",
  min_age: "La edad mínima va de 18 a 65.",
};

/** El primer problema de cada sección, en el orden del configurador. */
export function launchProblems(structure: Structure, launch: LaunchConfig, engine: EngineConfig, facts: LaunchFacts): Partial<Record<ConfigSectionKey, string>> {
  const out: Partial<Record<ConfigSectionKey, string>> = {};
  const set = (k: ConfigSectionKey, msg: string) => {
    if (!out[k]) out[k] = msg;
  };

  // Creativos
  const byId = new Map(facts.media.map((m) => [m.id, m]));
  const chosen = launch.creatives.map((id) => byId.get(id)).filter((m): m is MediaFacts => !!m);
  if (chosen.length === 0) set("creatives", "Sube al menos un creativo.");
  else if (chosen.some((m) => m.status === "uploading")) set("creatives", "Espera a que terminen de subir los creativos.");
  else if (chosen.some((m) => m.status === "error")) set("creatives", "Quita los creativos con error.");
  if (structure === "cbo" && launch.cbo_ads === "dco" && chosen.length > MAX_DCO_MEDIA) set("creatives", `El anuncio dinámico lleva hasta ${MAX_DCO_MEDIA} creativos.`);
  if (adsetCount(structure, launch) > MAX_ADSETS) set("creatives", `Son ${adsetCount(structure, launch)} conjuntos: el máximo es ${MAX_ADSETS}. Quita creativos o públicos.`);

  // Lo que dice el esquema, campo a campo.
  const parsed = launchSchema.safeParse(launch);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      const section = SECTION_OF[field];
      if (!section) continue;
      set(section, issue.code === "custom" ? issue.message : (FIELD_MESSAGE[field] ?? "Revisa esta sección."));
    }
  }

  // Presupuesto contra el tope de la cuenta.
  const total = dailyTotal(structure, launch);
  if (facts.spendCap == null) set("budget", "Define el tope de gasto diario de tu cuenta antes de lanzar.");
  else if (total > facts.spendCap) set("budget", `El total diario (${money(total, facts.currency)}) pasa tu tope de ${money(facts.spendCap, facts.currency)}.`);

  // Motor
  const eng = engineSchema.safeParse(engine);
  if (!eng.success) set("engine", "Revisa los valores de las reglas.");
  else for (const p of engineProblems(engine, total)) set("engine", p);

  return out;
}
