import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { VISUAL_LIMITS } from "./visual-schemas";

type Pending = { resolve: (url: string) => void; reject: (error: Error) => void };
const signingError = () => new Error("No pudimos abrir la imagen. Intenta de nuevo.");
/** Vive solamente en una lectura autorizada. Deduplica también entre referencias y assets. */
export function createVisualUrlSigner(db = adminClient()) {
  const signed = new Map<string, Promise<string>>();
  let pending = new Map<string, Map<string, Pending>>(), scheduled = false;
  const flush = async () => {
    const batches = pending; pending = new Map(); scheduled = false;
    await Promise.all([...batches].map(async ([bucket, files]) => {
      try {
        const { data, error } = await db.storage.from(bucket).createSignedUrls([...files.keys()], VISUAL_LIMITS.snapshotSeconds);
        if (error || !data) throw signingError();
        const byPath = new Map(data.map(item => [item.path, item]));
        for (const [path, item] of files) {
          const result = byPath.get(path);
          if (!result || result.error || !result.signedUrl) item.reject(signingError());
          else item.resolve(result.signedUrl);
        }
      } catch {
        for (const item of files.values()) item.reject(signingError());
      }
    }));
  };
  return (bucket: string, path: string): Promise<string> => {
    const key = JSON.stringify([bucket, path]);
    const prior = signed.get(key); if (prior) return prior;
    const promise = new Promise<string>((resolve, reject) => {
      const files = pending.get(bucket) ?? new Map<string, Pending>();
      files.set(path, { resolve, reject }); pending.set(bucket, files);
    });
    signed.set(key, promise);
    if (!scheduled) { scheduled = true; queueMicrotask(() => { void flush(); }); }
    return promise;
  };
}

const requestSigner = Symbol("visualRequestSigner");
type SignedState = { [requestSigner]?: ReturnType<typeof createVisualUrlSigner> };
export function stateVisualSigner(state: object, signer?: ReturnType<typeof createVisualUrlSigner>) {
  const owned = state as SignedState;
  if (!owned[requestSigner]) Object.defineProperty(owned, requestSigner, { value: signer ?? createVisualUrlSigner() });
  return owned[requestSigner]!;
}
