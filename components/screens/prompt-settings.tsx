"use client";

import { useState } from "react";
import { Button, notify } from "@/components/df";
import { ProductApiClientError } from "@/lib/products/client";
import type { PromptEffortView, PromptSettingsView, PromptVersionView } from "@/lib/prompts/view";

// Ajustes › Prompts (solo admin): el texto de cada prompt guardado en la base, con sus tags y su
// historial. Guardar crea una versión nueva y la deja activa; «Usar esta versión» vuelve a una anterior.
// Cada generación registra la versión que usó (ai_generations.prompt_version): npm run ai:metrics compara.

const EFFORT_NAMES: Record<PromptEffortView, string> = { low: "Bajo", medium: "Medio", high: "Alto" };
const field = "w-full rounded-md border border-input bg-background p-2.5 text-body font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";
const when = (iso: string) => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

async function call(url: string, method: "PUT" | "POST", body: unknown): Promise<PromptSettingsView> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }).catch(() => null);
  if (!res) throw new ProductApiClientError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProductApiClientError(data.error ?? "No pudimos guardar el prompt. Intenta de nuevo.", undefined, res.status);
  return data as PromptSettingsView;
}

function PromptCard({ initial }: { initial: PromptSettingsView }) {
  const [data, setData] = useState(initial);
  const active = data.versions.find((v) => v.active) ?? data.versions[0];
  const [base, setBase] = useState<PromptVersionView | undefined>(active);
  const [body, setBody] = useState(active?.body ?? "");
  const [effort, setEffort] = useState<PromptEffortView>(active?.effort ?? "high");
  const [maxTokens, setMaxTokens] = useState(String(active?.maxTokens ?? 16000));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const next = (data.versions[0]?.version ?? 0) + 1;
  const changed = body !== base?.body || effort !== base?.effort || maxTokens !== String(base?.maxTokens);
  const missing = data.tags.filter((t) => !body.includes(t.tag));

  const load = (v: PromptVersionView) => {
    setBase(v);
    setBody(v.body);
    setEffort(v.effort);
    setMaxTokens(String(v.maxTokens));
    setError(undefined);
  };

  const save = async () => {
    setBusy("save");
    setError(undefined);
    try {
      const fresh = await call(`/api/settings/prompts/${data.key}`, "PUT", { body, effort, maxTokens: Number(maxTokens), note });
      setData(fresh);
      const now = fresh.versions.find((v) => v.active);
      if (now) load(now);
      setNote("");
      notify(`Versión ${now?.version ?? next} guardada y activa`);
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos guardar el prompt. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  const activate = async (v: PromptVersionView) => {
    setBusy(v.id);
    setError(undefined);
    try {
      const fresh = await call(`/api/settings/prompts/${data.key}/activate`, "POST", { id: v.id });
      setData(fresh);
      load(fresh.versions.find((x) => x.id === v.id) ?? v);
      notify(`Versión ${v.version} activa`);
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos cambiar la versión. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`prompt-${data.key}`} className="flex flex-col gap-3 rounded-md border p-3">
      <div>
        <h3 id={`prompt-${data.key}`} className="text-row font-semibold">
          {data.name} {active ? <span className="text-label font-normal text-muted-foreground">· versión {active.version} activa</span> : null}
        </h3>
        <p className="text-label font-normal text-muted-foreground">{data.desc}</p>
      </div>
      <div>
        <p className="text-label font-semibold">Se llenan solos</p>
        <ul className="mt-1 flex flex-col gap-1 text-label font-normal">
          {data.tags.map((t) => (
            <li key={t.tag} className={missing.includes(t) ? "text-destructive" : undefined}>
              <code className="rounded-sm bg-muted px-1 font-mono">{t.tag}</code> {t.label}
              {missing.includes(t) ? " · falta en el texto" : ""}
            </li>
          ))}
        </ul>
      </div>
      <label className="flex flex-col gap-1 text-label">
        Texto del prompt {base && !base.active ? <span className="font-normal text-muted-foreground">(partiendo de la versión {base.version})</span> : null}
        <textarea rows={16} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} className={`min-h-11 resize-y font-mono text-label ${field}`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-label">
          Esfuerzo de la IA
          <select value={effort} onChange={(e) => setEffort(e.target.value as PromptEffortView)} className={`h-control ${field}`}>
            {(Object.keys(EFFORT_NAMES) as PromptEffortView[]).map((k) => (
              <option key={k} value={k}>
                {EFFORT_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label">
          Máximo de tokens de la respuesta
          <input inputMode="numeric" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value.replace(/\D/g, ""))} className={`h-control tabular-nums ${field}`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-label">
        Qué cambió (opcional)
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={`h-control ${field}`} />
      </label>
      {error ? (
        <p role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="primary" icon="check" className="self-start" loading={busy === "save"} disabled={!changed || missing.length > 0} onClick={save}>
        Guardar como versión {next}
      </Button>
      {data.versions.length > 1 ? (
        <details>
          <summary className="flex min-h-touch cursor-pointer items-center text-label font-semibold">Versiones anteriores</summary>
          <ul className="flex flex-col gap-2">
            {data.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 text-label font-normal">
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">Versión {v.version}</b> · {when(v.createdAt)}
                  {v.note ? ` · ${v.note}` : ""}
                  {v.active ? " · activa" : ""}
                </span>
                <Button size="sm" variant="ghost" onClick={() => load(v)}>
                  Ver
                </Button>
                {v.active ? null : (
                  <Button size="sm" loading={busy === v.id} onClick={() => activate(v)}>
                    Usar esta versión
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function PromptSettings({ prompts }: { prompts: PromptSettingsView[] }) {
  return (
    <div className="flex flex-col gap-3">
      {prompts.map((p) => (
        <PromptCard key={p.key} initial={p} />
      ))}
    </div>
  );
}
