"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Switch, notify } from "@/components/df";
import { componentName } from "@/lib/copy/page-ui";
import { componentCapability } from "@/lib/product-intelligence/component-capabilities";
import type { PdpWorkbench, ProductCopy, LandingExperience } from "@/lib/types";

/** Edición de lo persistido con CAS e idempotencia. Las trazas y el plan creativo no son tareas del comerciante. */
export function PersuasionWorkbench({ initial, data }: { initial: PdpWorkbench; data: ProductCopy }) {
  const router = useRouter();
  const [id, setId] = useState(initial.experiences.find(e => e.payload.is_default)?.id ?? initial.experiences[0]?.id ?? "");
  const saved = initial.experiences.find(e => e.id === id);
  const [draft, setDraft] = useState<LandingExperience | null>(saved?.payload ?? null);
  const baseline = useRef({ saved, revision: initial.revision, planningStamp: initial.planning_stamp });
  if(saved && (saved !== baseline.current.saved || initial.planning_stamp !== baseline.current.planningStamp) && draft === baseline.current.saved?.payload) {
    baseline.current = { saved, revision: initial.revision, planningStamp: initial.planning_stamp }; setDraft(saved.payload);
  }
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const retries = useRef(new Map<string, string>());
  function move(index: number, offset: number) {
    if (!draft) return;
    const sections = [...draft.sections], target = index + offset;
    if (target < 1 || index < 1 || target >= sections.length || componentCapability(sections[index].component)?.placement !== componentCapability(sections[target].component)?.placement) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    for (const i of [index, target]) sections[i] = { ...sections[i], manual_overrides: [...new Set([...sections[i].manual_overrides, "order" as const])] };
    setDraft({ ...draft, sections });
  }
  async function save() {
    const snapshot = baseline.current;
    if (!draft || !snapshot.saved) return;
    setBusy(true); setError(undefined);
    const signature = JSON.stringify([draft, snapshot.saved.etag, snapshot.planningStamp]);
    const key = retries.current.get(signature) ?? crypto.randomUUID(); retries.current.set(signature, key);
    try {
      const response = await fetch(`/api/products/${data.product.id}/pdp`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "save_landing_experience", input: {
        product_id: data.product.id, schema_version: "1.0", expected_revision: snapshot.revision, expected_planning_stamp: snapshot.planningStamp,
        idempotency_key: key, experience_id: snapshot.saved.id, expected_etag: snapshot.saved.etag, experience: draft,
      } }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "No pudimos guardar. Actualiza e intenta de nuevo.");
      retries.current.delete(signature); setDraft(snapshot.saved.payload); notify("Versión de página guardada"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo."); }
    finally { setBusy(false); }
  }
  if (!draft) return null;
  return <div className="flex flex-col gap-3 pt-3">
    <label className="text-label">Versión de página<select className="mt-2 min-h-touch w-full rounded-md border border-input bg-background px-3 text-body" value={id} disabled={busy} onChange={e => { const next = initial.experiences.find(x => x.id === e.target.value); baseline.current = { saved: next, revision: initial.revision, planningStamp: initial.planning_stamp }; setId(e.target.value); setDraft(next?.payload ?? null); }}>
      {initial.experiences.map((e, index) => <option key={e.id} value={e.id}>{e.payload.is_default ? "Página principal" : `Versión ${index + 1}`}</option>)}
    </select></label>
    <Switch label="Usar como página principal" checked={draft.is_default} disabled={busy} onChange={is_default => setDraft({ ...draft, is_default })} />
    <ol className="flex flex-col gap-2">{draft.sections.map((section, index) => <li key={section.section_key} className="rounded-md border p-3">
      <div className="flex items-center gap-2"><span className="flex-1 text-label">{componentName(section.component)}</span>
        <IconButton icon="arrow-up" label={`Subir ${componentName(section.component)}`} disabled={busy || index < 2} onClick={() => move(index, -1)} />
        <IconButton icon="arrow-down" label={`Bajar ${componentName(section.component)}`} disabled={busy || index === 0 || index === draft.sections.length - 1} onClick={() => move(index, 1)} />
      </div>
      {section.component !== "listing" ? <Switch label="Mostrar en esta versión" checked={section.enabled} disabled={busy} onChange={enabled => setDraft({ ...draft, sections: draft.sections.map((s, i) => i === index ? { ...s, enabled, manual_overrides: [...new Set([...s.manual_overrides, "enabled" as const])] } : s) })} /> : null}
    </li>)}</ol>
    <p className="text-caption text-muted-foreground">Guardar conserva esta versión. Publica para mostrar sus cambios en la tienda.</p>
    <Button onClick={save} loading={busy}>Guardar versión</Button>
    {error ? <p role="alert" className="text-body text-destructive">{error}</p> : null}
  </div>;
}
