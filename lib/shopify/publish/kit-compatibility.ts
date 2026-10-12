import RELEASES from "./kit-releases.json";
import { isProtected, type Kit, type RemoteFile, type UpdatePlan } from "./kit";

export const UNKNOWN_THEME_CODE = "La tienda tiene código que esta versión de la app no reconoce. Recarga la app para comprobar si hay una actualización disponible.";
export interface KitReleases {
  versions: string[];
  codeChecksums: Record<string, string[]>;
}

export function knownKitVersion(kit: Kit, version: string | null, releases: KitReleases = RELEASES): boolean {
  return !version || version === kit.version || releases.versions.includes(version);
}

/** La desigualdad no implica antigüedad. No escribir sobre versiones o archivos desconocidos. */
export function themeUpdateProblem(kit: Kit, installedVersion: string | null, remote: RemoteFile[], plan: UpdatePlan, releases: KitReleases = RELEASES): string | undefined {
  const local = new Map(kit.files.map(f => [f.path, f.md5]));
  const files = new Map(remote.map(f => [f.path, f.md5]));
  const changedCode = plan.upsert.filter(path => !isProtected(path));
  if (hasThemeChanges(plan) && !knownKitVersion(kit, installedVersion, releases)) return UNKNOWN_THEME_CODE;
  for (const path of [...changedCode, ...plan.remove]) {
    const hash = files.get(path);
    // Un archivo ausente se puede restaurar. Uno presente sin huella no se ha verificado.
    if (files.has(path) && (!hash || (hash !== local.get(path) && !releases.codeChecksums[path]?.includes(hash)))) return UNKNOWN_THEME_CODE;
  }
  return undefined;
}

export function hasThemeChanges(plan: UpdatePlan): boolean {
  return plan.upsert.length > 0 || plan.restore.length > 0 || plan.remove.length > 0;
}
