"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Notice, StatusBadge, notify } from "@/components/df";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { ListingPreview } from "@/components/store-preview/listing";
import { componentCapability } from "@/lib/product-intelligence/component-capabilities";
import { componentName, LISTING_SLOTS, type ListingSlot } from "@/lib/copy/page-ui";
import { contentVariants } from "@/lib/copy/variants";
import type { LandingExperience, PdpWorkbench, ProductCopy } from "@/lib/types";
import { imagesBySlot } from "./component-editor";

const status = (value: string) => value === "approved" || value === "active" ? "aprobado" : value === "review" ? "revision" : value === "archived" ? "rechazado" : "generado";
const selectClass = "min-h-touch w-full rounded-md border border-input bg-background px-3 text-body";
export function PersuasionWorkbench({ initial, data }: { initial: PdpWorkbench; data: ProductCopy }) {
  const router = useRouter();
  const firstExperience = initial.experiences.find(e => e.payload.persuasion_plan_id === initial.plans[0]?.id);
  const [work, setWork] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [planId, setPlanId] = useState(initial.plans[0]?.id ?? "");
  const [experienceId, setExperienceId] = useState(firstExperience?.id ?? "");
  const [draft, setDraft] = useState<LandingExperience | null>(firstExperience?.payload ?? null);
  const [variantName, setVariantName] = useState("alternative");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [preview, setPreview] = useState(false);
  if (shown !== initial) {
    setShown(initial); setWork(initial);
    if (!planId && initial.plans.length) setPlanId(initial.plans[0].id);
  }
  const retries = useRef(new Map<string, string>());
  const plan = work.plans.find(p => p.id === planId), experience = work.experiences.find(e => e.id === experienceId);
  async function save(tool: "save_angle_persuasion_plan" | "save_landing_experience", input: object) {
    setBusy(true); setError(undefined);
    const signature = JSON.stringify({ tool, input, revision: work.revision, planning_stamp: work.planning_stamp });
    const idempotency_key = retries.current.get(signature) ?? crypto.randomUUID(); retries.current.set(signature, idempotency_key);
    try {
      const response = await fetch(`/api/products/${data.product.id}/pdp`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input: { product_id: data.product.id, schema_version: "1.0", expected_revision: work.revision, expected_planning_stamp: work.planning_stamp, idempotency_key, ...input } }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "No pudimos guardar el recorrido. Recupera el contexto e intenta de nuevo.");
      const read = await fetch(`/api/products/${data.product.id}/pdp`, { cache: "no-store" });
      if (!read.ok) throw new Error("No pudimos recuperar el contexto. Intenta de nuevo con la misma decisión.");
      const next = await read.json() as PdpWorkbench;
      if (!next) throw new Error("El recorrido ya no está habilitado. Actualiza la página.");
      retries.current.delete(signature); setWork(next);
      if (tool === "save_landing_experience") { setExperienceId(result.data.id); setDraft(next.experiences.find(e => e.id === result.data.id)?.payload ?? null); }
      notify(tool === "save_angle_persuasion_plan" ? "Plan aprobado" : "Recorrido guardado"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el recorrido. Recupera el contexto e intenta de nuevo."); }
    finally { setBusy(false); }
  }
  async function recover() {
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${data.product.id}/pdp`, { cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos recuperar el recorrido. Intenta de nuevo.");
      const next = await response.json() as PdpWorkbench | null;
      if (!next) { router.refresh(); return; }
      const saved = next.experiences.find(e => e.id === experienceId);
      retries.current.clear(); setWork(next); setDraft(saved?.payload ?? null); setExperienceId(saved?.id ?? ""); setError(undefined); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos recuperar el recorrido. Intenta de nuevo."); }
    finally { setBusy(false); }
  }
  function newExperience() {
    if (!plan) return;
    const p = plan.payload;
    const sections = p.sections.map(s => {
      const row = data.components.find(c => c.component === s.selected_component);
      const variants = contentVariants(row?.content);
      const variant = variants.find(v => v.angle_id === p.landing_angle_id && v.hook_id === null) ?? variants.find(v => v.key === "default");
      return { section_key: s.section_key, component: s.selected_component, content_variant_key: variant?.key ?? "default",
        persuasion_job: s.primary_job, belief_keys: s.belief_keys, enabled: true, images: [], asset_refs: s.source_asset_refs, manual_overrides: [] };
    });
    setExperienceId(""); setDraft({ schema_version: "1.0", strategy_id: p.strategy_id, angle_id: p.angle_id, persuasion_plan_id: plan.id,
      plan_revision: plan.revision, landing_angle_id: p.landing_angle_id, landing_hook_id: null, experience_key: `${p.landing_angle_id}_${variantName}`.slice(0, 64),
      architecture_variant: variantName, is_default: false, status: "draft", sections });
  }
  function patchSection(index: number, patch: Partial<LandingExperience["sections"][number]>, field: LandingExperience["sections"][number]["manual_overrides"][number]) {
    if (!draft) return;
    setDraft({ ...draft, sections: draft.sections.map((s, i) => i === index ? { ...s, ...patch, manual_overrides: [...new Set([...s.manual_overrides, field])] } : s) });
  }
  function move(index: number, offset: number) {
    if (!draft) return;
    const sections = [...draft.sections], target = index + offset;
    if (target < 1 || target >= sections.length || componentCapability(sections[index].component)?.placement !== componentCapability(sections[target].component)?.placement) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    for (const i of [index, target]) sections[i] = { ...sections[i], manual_overrides: [...new Set([...sections[i].manual_overrides, "order" as const])] };
    setDraft({ ...draft, sections });
  }
  const previewRows = draft?.sections.filter(s => s.enabled).map(s => {
    const row = data.components.find(c => c.component === s.component), variant = contentVariants(row?.content).find(v => v.key === s.content_variant_key);
    return { section: s, row, variant };
  }) ?? [];
  const hero = previewRows.find(r => r.section.component === "listing");
  const validVariant = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(variantName);
  const experiences = work.experiences.filter(e => e.payload.persuasion_plan_id === planId);
  const slots: Partial<Record<ListingSlot, React.ReactNode>> = {};
  for (const item of previewRows.filter(r => r.section.component !== "listing" && componentCapability(r.section.component)?.placement === "hero")) {
    const Preview = PREVIEWS[item.section.component], slot = LISTING_SLOTS[item.section.component];
    if (Preview && slot && item.variant) slots[slot] = <>{slots[slot]}<Preview content={item.variant.content} facts={data.facts} images={imagesBySlot(item.variant.images ?? item.row?.images ?? [], data.images)} /></>;
  }
  return <section className="rounded-lg border bg-card p-4" aria-label="Recorrido de la página">
    <h2 className="text-title-sm font-semibold">Recorrido de la página</h2>
    <p className="mt-2 text-caption text-muted-foreground">Editar textos e imágenes conserva el plan. Cambia el argumento en el chat cuando necesites otro recorrido.</p>
    {!plan ? <Notice tone="info" icon="chat" title="Planifica el recorrido en el chat" body="Elige una estrategia y un ángulo. Guarda el plan antes de decidir qué bloques aparecen." /> : <>
      <label className="mt-4 block text-label">Elige un plan<select className={selectClass} value={planId} disabled={busy} onChange={e => {
        setPlanId(e.target.value); const next = work.experiences.find(x => x.payload.persuasion_plan_id === e.target.value);
        setExperienceId(next?.id ?? ""); setDraft(next?.payload ?? null);
      }}>
        {work.plans.map(p => <option key={p.id} value={p.id}>{p.payload.landing_angle_id} · {p.payload.thesis.recognition}</option>)}
      </select></label>
      <div className="mt-3 flex items-center gap-2"><StatusBadge status={status(plan.payload.status)} /><span className="text-caption tabular-nums">{plan.payload.sections.length} bloques</span></div>
      <ol className="mt-3 flex flex-col gap-2">{plan.payload.beliefs.map(b => <li key={b.key} className="text-body"><span className="text-muted-foreground">{b.current_belief}</span><span aria-hidden> → </span>{b.target_belief}</li>)}</ol>
      {plan.issues.map((i, n) => <p key={n} className={i.severity === "error" ? "mt-2 text-caption text-destructive" : "mt-2 text-caption text-muted-foreground"}>{i.message}</p>)}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy || plan.payload.status === "approved" || plan.issues.some(i => i.severity === "error")} onClick={() => save("save_angle_persuasion_plan", { plan_id: plan.id, expected_etag: plan.etag, plan: { ...plan.payload, status: "approved" } })}>Aprueba el plan</Button>
        <Button disabled={busy || !validVariant} onClick={newExperience}>Crea una experiencia</Button>
      </div>
    </>}
    {experiences.length ? <label className="mt-4 block text-label">Elige una experiencia<select className={selectClass} value={experienceId} disabled={busy} onChange={e => { setExperienceId(e.target.value); setDraft(experiences.find(x => x.id === e.target.value)?.payload ?? null); }}>
      <option value="">Nueva variante</option>{experiences.map(e => <option key={e.id} value={e.id}>{e.payload.experience_key}</option>)}
    </select></label> : null}
    <label className="mt-4 block text-label">Nombre de la variante<input className={selectClass} value={variantName} maxLength={40} disabled={busy} onChange={e => setVariantName(e.target.value)} /></label>
    {draft ? <>
      <div className="mt-3"><StatusBadge status={status(draft.status)} /></div>
      <label className="mt-2 flex min-h-touch items-center gap-2 text-label"><input type="checkbox" checked={draft.is_default} disabled={busy} onChange={e => setDraft({ ...draft, is_default: e.target.checked })} />Usa como recorrido predeterminado</label>
      <ol className="mt-4 flex flex-col gap-3">{draft.sections.map((s, index) => <li key={s.section_key} className="rounded-md border p-3">
        <div className="flex items-center gap-2"><span className="flex-1 text-label">{componentName(s.component)}</span>
          <IconButton icon="arrow-up" label="Sube la sección" disabled={busy || index < 2 || componentCapability(s.component)?.placement !== componentCapability(draft.sections[index - 1].component)?.placement} onClick={() => move(index, -1)} />
          <IconButton icon="arrow-down" label="Baja la sección" disabled={busy || index === 0 || index === draft.sections.length - 1 || componentCapability(s.component)?.placement !== componentCapability(draft.sections[index + 1].component)?.placement} onClick={() => move(index, 1)} />
        </div>
        <p className="text-caption text-muted-foreground">{work.plans.find(p => p.id === draft.persuasion_plan_id)?.payload.sections.find(p => p.section_key === s.section_key)?.necessity}</p>
        <label className="mt-2 flex min-h-touch items-center gap-2 text-label"><input type="checkbox" checked={s.enabled} disabled={busy || s.component === "listing"} onChange={e => patchSection(index, { enabled: e.target.checked }, "enabled")} />Usa esta sección</label>
        <label className="mt-2 block text-label">Componente<select className={selectClass} value={s.component} disabled={busy || s.component === "listing"} onChange={e => patchSection(index, { component: e.target.value, content_variant_key: "default", images: [] }, "component")}>
          {data.components.filter(c => c.component === s.component || componentCapability(c.component)?.supported_jobs.includes(s.persuasion_job)).map(c => <option key={c.component} value={c.component}>{componentName(c.component)}</option>)}
        </select></label>
        <label className="mt-2 block text-label">Variante de contenido<select className={selectClass} value={s.content_variant_key} disabled={busy} onChange={e => patchSection(index, { content_variant_key: e.target.value, images: [] }, "content")}>
          {contentVariants(data.components.find(c => c.component === s.component)?.content).map(v => <option key={v.key} value={v.key}>{v.key}</option>)}
        </select></label>
      </li>)}</ol>
      <p className="mt-3 text-caption text-muted-foreground">Activar prepara la experiencia. Publica desde la etapa Publicar para cambiar la tienda.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy} onClick={() => save("save_landing_experience", { experience_id: experienceId || null, expected_etag: experience?.etag ?? work.empty_etag, experience: { ...draft, status: "draft" } })}>Guarda el recorrido</Button>
        <Button disabled={busy} onClick={() => save("save_landing_experience", { experience_id: experienceId || null, expected_etag: experience?.etag ?? work.empty_etag, experience: { ...draft, status: "active" } })}>Activa la experiencia</Button>
        {experience ? <Button disabled={busy} onClick={() => save("save_landing_experience", { experience_id: experience.id, expected_etag: experience.etag, experience: { ...draft, status: "archived" } })}>Archiva la experiencia</Button> : null}
        <Button disabled={busy || !validVariant} onClick={() => { setExperienceId(""); setDraft({ ...draft, status: "draft", experience_key: `${draft.landing_angle_id}_${variantName}`.slice(0, 64), architecture_variant: variantName, is_default: false }); }}>Crea una variante</Button>
        <Button onClick={() => setPreview(!preview)}>Revisa la vista móvil</Button>
      </div>
      {preview ? <StoreFrame accent={data.accent} className="mt-4 max-w-sm overflow-hidden rounded-lg">
        {hero?.variant ? <ListingPreview content={hero.variant.content as import("@/lib/copy/listing").Listing} facts={data.facts} images={{}} slots={slots} /> : null}
        {previewRows.filter(r => componentCapability(r.section.component)?.placement === "body").map(r => { const Preview = PREVIEWS[r.section.component]; return Preview && r.variant ? <Preview key={r.section.section_key} content={r.variant.content} facts={data.facts} images={imagesBySlot(r.variant.images ?? r.row?.images ?? [], data.images)} /> : null; })}
      </StoreFrame> : null}
    </> : null}
    {error ? <div className="mt-3"><p role="alert" className="text-label text-destructive">{error}</p>
      <p className="mt-2 text-caption text-muted-foreground">Recuperar carga la última versión guardada.</p>
      <Button className="mt-2" disabled={busy} onClick={recover}>Recupera el recorrido</Button>
    </div> : null}
  </section>;
}
