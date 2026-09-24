// Los ajustes de un componente en la vista previa: los valores por defecto de su {% schema %}, como
// los ve una tienda recién instalada. Puro.

import { SETTINGS } from "./theme.generated";

export type Settings = Record<string, string | number | boolean | undefined>;

export function settingsOf(id: string): Settings {
  return (SETTINGS[id] ?? {}) as Settings;
}

/** «12» → «12px», para las variables CSS que el Liquid arma con un ajuste. */
export const px = (n: unknown) => `${Number(n) || 0}px`;

/** Parte un texto en tramos normales y **destacados**, como el Liquid (split: '**'). */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split("**").map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
}
