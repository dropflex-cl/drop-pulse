// Qué piezas de un concepto se muestran. Puro, con tests.
import type { ImageProvider } from "@/lib/image-provider";

type Piece = { ratio: string; provider: ImageProvider; render: "queued" | "running" | "succeeded" | "failed" };

/**
 * Una pieza por proporción y proveedor: la más reciente (el reintento del QA reemplaza al primero),
 * salvo que haya fallado y ya exista una lista del mismo proveedor. Cambiar de proveedor nunca esconde
 * lo que se generó con el otro.
 */
export function latestPieces<T extends Piece>(assets: T[]): T[] {
  const out = new Map<string, T>();
  for (const a of assets) {
    const key = `${a.ratio}|${a.provider}`;
    const prev = out.get(key);
    if (a.render === "failed" && prev?.render === "succeeded") continue;
    out.set(key, a);
  }
  return [...out.values()].sort((a, b) => a.ratio.localeCompare(b.ratio) || a.provider.localeCompare(b.provider));
}

/** Falta generar esa proporción con el proveedor elegido (lo del otro proveedor no cuenta). */
export function needsRender(assets: Piece[], ratio: string, provider: ImageProvider | null): boolean {
  return !assets.some((a) => a.ratio === ratio && (!provider || a.provider === provider));
}
