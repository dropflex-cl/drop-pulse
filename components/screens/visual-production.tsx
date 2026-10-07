"use client";

/* eslint-disable @next/next/no-img-element -- Private previews are already optimized; signed URLs must not enter the Next image cache. */

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Field, Notice, SegmentedControl, StatusBadge } from "@/components/df";
import type { ContentStatus } from "@/components/df/status-badge";
import type { VisualWorkbench } from "@/lib/types";
import { visualIdentitySchema, visualPlanSchema, type VisualIdentity, type VisualPlan, type VisualRecord, VISUAL_LIMITS } from "@/lib/product-intelligence/visual-schemas";

type Card = VisualWorkbench["records"][number];
const status = (s: string): ContentStatus => s === "approved" || s === "selected" ? "aprobado" : s === "rejected" || s === "archived" ? "rechazado" : s === "generated" ? "generado" : s === "failed" ? "error" : "revision";
const words = (value: unknown) => Array.isArray(value) ? value.map(String).join("\n") : String(value ?? "");
const list = (value: string) => value.split("\n").map(s => s.trim()).filter(Boolean);
const labels: Record<string, string> = { must_have: "Obligatoria", recommended: "Recomendada", optional: "Opcional", gallery_shot: "Galería", landing_section: "Página del producto", creative_concept: "Creativo", ugc_shot: "UGC", chatgpt: "ChatGPT", manual: "Archivo real", other: "Externo", product_depiction: "Producto", illustrative_demo: "Demostración ilustrativa", real_evidence: "Evidencia real" };
const tags = { wrong_product_shape: "Forma incorrecta", wrong_color: "Color incorrecto", too_fake: "Poco creíble", too_dirty: "Demasiada suciedad", bad_composition: "Composición", bad_text: "Texto", bad_reference_fidelity: "Fidelidad al producto", good_product_fidelity: "Buena fidelidad", good_demo: "Buena demostración", good_composition: "Buena composición" };
const when = (date: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "short" }).format(new Date(date));
function cleanPlan(r: VisualRecord): VisualPlan {
  const { name, strategy_id, identity_ref, visual_system, shots } = r.payload;
  return visualPlanSchema.parse({ name, strategy_id, identity_ref, visual_system, shots: (shots as Record<string, unknown>[]).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => !["shot_id", "shot_version", "shot_hash", "dependencies"].includes(k)))) });
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <label htmlFor={id} className="flex flex-col gap-2 text-label">{label}<textarea id={id} value={value} onChange={e => onChange(e.target.value)} rows={3}
    className="min-h-touch w-full rounded-md border border-input bg-background px-3 py-2 text-body font-normal" /></label>;
}
function Freshness({ record }: { record: Card }) {
  return record.validity.state === "current" ? null : <Notice title="Revisa el cambio" body={record.validity.reasons.map(r => r.message).join(" ")} />;
}

export function VisualProduction({ initial, identityOnly = false, initialTab = "plan" }: { initial: VisualWorkbench | null; identityOnly?: boolean; initialTab?: "plan" | "assets" }) {
  const [data, setData] = useState(initial), [tab, setTab] = useState(identityOnly ? "identity" : initialTab), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [identityDraft, setIdentityDraft] = useState<VisualIdentity | null>(null), [planDraft, setPlanDraft] = useState<VisualPlan | null>(null), [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [reason, setReason] = useState(""), [reviewTags, setReviewTags] = useState<string[]>([]), [compare, setCompare] = useState<string[]>([]), [operation, setOperation] = useState<string | null>(null);
  const [source, setSource] = useState("chatgpt"), [instruction, setInstruction] = useState(""), [uploadShot, setUploadShot] = useState<{ plan: Card; key: string } | null>(null);
  const [targetChoice, setTargetChoice] = useState<Record<string, string>>({}), [comparison, setComparison] = useState<Card[]>([]), [reuse, setReuse] = useState<Record<string, (Card & { reuse: { compatible: boolean; reasons: string[]; transformation: string | null } })[]>>({});
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initial?.pending_ingestions?.[0]) setOperation(initial.pending_ingestions[0].id); }, [initial]);
  useEffect(() => { setData(initial); }, [initial]);
  const endpoint = `/api/products/${data?.product_id}/visual`;
  async function refresh(offset = data?.asset_offset ?? 0) {
    const response = await fetch(`${endpoint}?offset=${offset}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No pudimos recuperar las piezas. Actualiza la página.");
    const next: VisualWorkbench = await response.json(); setData(next); return next;
  }
  async function request(tool: string, payload: Record<string, unknown>, state = data) {
    if (!state) throw new Error("Recupera el producto antes de decidir.");
    const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool,
      input: { product_id: state.product_id, ...(!tool.startsWith("get_") && !tool.startsWith("list_") ? { schema_version: "1.0", expected_revision: state.revision,
        expected_etag: state.etag, expected_dependency_stamp: state.dependency_stamp, idempotency_key: crypto.randomUUID(), dry_run: false } : {}), ...payload } }) });
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? "No pudimos guardar. Recupera el contexto e intenta de nuevo.");
    return body as { data: Record<string, unknown> };
  }
  async function act(work: () => Promise<void>) { setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo."); } finally { setBusy(false); } }
  useEffect(() => {
    if (!operation || !data) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "get_visual_ingestion_status", input: { product_id: data.product_id, operation_id: operation } }) });
        const result = await response.json();
        if (result.data?.state === "succeeded") { const next = await refresh(); setOperation(next.pending_ingestions?.[0]?.id ?? null); toast.success("Imagen guardada para revisar"); }
        else if (result.data?.state === "failed") { setOperation(null); setError(result.data.error ?? "No pudimos recibir la imagen. Sube otro archivo."); }
        else if (!response.ok) { setOperation(null); setError("No pudimos consultar la subida. Actualiza la página."); }
      } catch { setError("No pudimos consultar la subida. Revisa tu conexión."); }
    }, 3000);
    return () => window.clearInterval(timer);
    // This poll follows one durable operation and ends at its terminal result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, data?.product_id]);
  if (!data) return null;
  const identities = data.records.filter(r => r.kind === "identity"), identity = identities[0], plans = data.records.filter(r => r.kind === "plan" && r.status !== "archived");
  const assets = data.records.filter(r => r.kind === "asset"), bindings = data.records.filter(r => r.kind === "binding" && r.status !== "archived"), iterations = data.records.filter(r => r.kind === "iteration");
  async function decide(record: Card, decision: string) {
    await act(async () => {
      await request("review_visual_record", { record_id: record.id, expected_etag: record.etag, decision, reason, tags: reviewTags });
      await refresh(); setReason(""); setReviewTags([]); toast.success("Decisión guardada");
    });
  }
  const decisions = (r: Card) => r.status === "archived" ? <Button disabled={busy} onClick={() => void decide(r, "reopen")}>Recuperar para revisar</Button> : <div className="flex flex-wrap gap-2">
    {r.status !== "approved" || r.validity.state !== "current" ? <Button disabled={busy || r.validity.state === "blocked"} onClick={() => void decide(r, "approve")}>{r.validity.state === "needs_review" && r.kind === "asset" ? "Revisar vigencia" : "Aprobar"}</Button> : <Button disabled={busy} onClick={() => void decide(r, "reopen")}>Volver a revisar</Button>}
    <Button disabled={busy} onClick={() => void decide(r, "reject")}>Descartar</Button>
    <Button disabled={busy} onClick={() => void decide(r, "archive")}>Archivar</Button>
  </div>;
  async function copyBrief(plan: Card, shotKey: string) {
    const p = cleanPlan(plan), s = p.shots.find(s => s.shot_key === shotKey)!;
    await navigator.clipboard.writeText([`Producto: ${identity?.payload.identity_description ?? ""}`, `Objetivo: ${s.objective}`, `Escena: ${s.scene.environment}. ${s.scene.action}`,
      `Composición: ${s.composition.framing}. ${s.composition.camera}. Formato ${s.composition.aspect_ratio}`, `Conserva: ${words(identity?.payload.preserve)}`, `Evita: ${words(identity?.payload.forbidden_variations)}\n${s.avoid.join("\n")}`,
      `Mensaje: ${s.message.takeaway}`, `Sistema visual: ${p.visual_system.photography_style}; ${p.visual_system.lighting}; ${p.visual_system.consistency_notes}`,
      `Recupera la referencia canónica y esta toma con get_visual_generation_plan. Usa prepare_visual_iteration antes de generar y guarda el resultado con ingest_external_visual_asset.`].join("\n\n"));
    toast.success("Brief copiado para tu chat");
  }
  async function ingestFile(file: File) {
    await act(async () => {
      if (!uploadShot) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > VISUAL_LIMITS.uploadBytes) throw new Error("Elige una imagen JPG, PNG o WebP de hasta 15 MB.");
      const started = await request("prepare_visual_iteration", { plan_ref: { id: uploadShot.plan.id, version: uploadShot.plan.version, etag: uploadShot.plan.etag }, shot_key: uploadShot.key,
        source_system: source, resolved_instruction: instruction.trim() || null });
      const it = (started.data.records as VisualRecord[])[0]; let next = await refresh();
      const ticket = await request("prepare_visual_asset_upload", { iteration_id: it.id, mime_type: file.type, size_bytes: file.size }, next);
      const signed = ticket.data.upload as { url: string }; const sent = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!sent.ok) throw new Error("No pudimos subir el archivo. Revisa tu conexión; el intento queda pendiente y puedes abandonarlo antes de subir otro.");
      next = await refresh();
      const accepted = await request("ingest_external_visual_asset", { iteration_id: it.id, source: { type: "upload_ticket", ticket_id: ticket.data.operation_id } }, next);
      setOperation(String(accepted.data.operation_id)); setUploadShot(null); setTab("assets");
    });
  }
  return <section aria-label="Producción visual" className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-title font-semibold">Producción visual</h2><p className="text-caption text-muted-foreground">Prepara las imágenes desde tu chat conectado. Revisa aquí la identidad, las tomas y sus usos.</p></div><Button disabled={busy} onClick={() => void act(async () => { await refresh(); })}>Actualizar</Button></div>
    {!identityOnly ? <SegmentedControl label="Producción visual" block value={tab} onChange={setTab} options={[{ value: "identity", label: "Identidad" }, { value: "plan", label: "Plan" }, { value: "assets", label: "Piezas" }]} /> : null}
    {error ? <p role="alert" className="text-label text-destructive">{error}</p> : null}
    {operation ? <p role="status" className="text-label">Recibiendo y validando la imagen…</p> : null}
    <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Subir resultado visual" onChange={e => { const file = e.target.files?.[0]; if (file) void ingestFile(file); e.target.value = ""; }} />
    {tab === "identity" ? <>
      {data.canonical_reference?.url ? <img src={data.canonical_reference.url} alt="Referencia canónica del producto" className="aspect-square w-full max-w-sm rounded-md object-contain" /> : <Notice title="Elige una imagen base" body="Agrega las referencias en Información base antes de definir la identidad." />}
      {identity ? <><StatusBadge status={status(identity.status)} label={identity.status === "archived" ? "Archivada" : undefined} /><Freshness record={identity} /><p className="text-body">{words(identity.payload.identity_description)}</p>
        {(["preserve", "allowed_variations", "forbidden_variations"] as const).map((key, i) => <div key={key}><h3 className="text-label font-semibold">{["Conserva", "Puede variar", "Evita"][i]}</h3><p className="whitespace-pre-line text-caption">{words(identity.payload[key])}</p></div>)}{decisions(identity)}</> : <Notice tone="info" title="Define la identidad" body="Tu chat puede proponerla a partir de la referencia. También puedes describirla aquí." />}
      <Button disabled={busy || !data.canonical_reference?.content_hash} onClick={() => setIdentityDraft(identity ? visualIdentitySchema.parse(Object.fromEntries(Object.entries(identity.payload).filter(([k]) => !["dependencies", "identity_hash", "archived_at"].includes(k)))) : { canonical_reference_image_id: data.canonical_reference!.id, reference_content_hash: data.canonical_reference!.content_hash!, reference_mode: "strict_product_identity", identity_description: "", preserve: [], allowed_variations: [], forbidden_variations: [] })}>Editar identidad</Button>
      {identityDraft ? <div className="flex flex-col gap-3"><TextArea label="Describe el producto" value={identityDraft.identity_description} onChange={v => setIdentityDraft({ ...identityDraft, identity_description: v })} />
        {(["preserve", "allowed_variations", "forbidden_variations"] as const).map((key, i) => <TextArea key={key} label={`${["Conserva", "Puede variar", "Evita"][i]} · una característica por línea`} value={words(identityDraft[key])} onChange={v => setIdentityDraft({ ...identityDraft, [key]: list(v) })} />)}
        <Button disabled={busy} onClick={() => void act(async () => { await request("save_visual_identity", { identity_id: identity?.id ?? null, identity: { ...identityDraft, canonical_reference_image_id: data.canonical_reference!.id, reference_content_hash: data.canonical_reference!.content_hash } }); setIdentityDraft(null); await refresh(); })}>Guardar propuesta</Button></div> : null}
    </> : null}
    {tab === "plan" ? <>
      {!plans.length ? <Notice tone="info" title="Prepara el plan desde tu chat" body="Pide: Analiza el producto y prepara las imágenes de la página. Las tomas guardadas aparecerán aquí para revisar." /> : null}
      {plans.map(p => <article key={p.id} className="flex flex-col gap-3 rounded-md border border-border p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-label font-semibold">{words(p.payload.name)} · <span className="tabular-nums">v{p.version}</span></h3><StatusBadge status={status(p.status)} /></div><Freshness record={p} />
        {cleanPlan(p).shots.map(s => <div key={s.shot_key} className="flex flex-col gap-2 border-t border-border pt-3"><div className="flex flex-wrap justify-between gap-2"><h4 className="text-label font-semibold">{s.name}</h4><span className="text-caption">{labels[s.priority]}</span></div><p className="text-body">{s.objective}</p><p className="text-caption text-muted-foreground">{s.shot_family} · {s.persuasion_job} · {s.composition.aspect_ratio}</p>
          {p.shot_validity?.[s.shot_key]?.state !== "current" && p.shot_validity?.[s.shot_key] ? <Notice title="Revisa esta toma" body={p.shot_validity[s.shot_key].reasons.map(r => r.message).join(" ")} /> : null}
          {assets.filter(a => a.payload.shot_key === s.shot_key && (a.payload.plan_ref as { id: string }).id === p.id).slice(0, 1).map(a => <div key={a.id} className="flex flex-wrap items-center gap-2"><span className="text-caption">Última pieza recibida</span><StatusBadge status={status(a.status)} /></div>)}
          <details><summary className="flex min-h-touch cursor-pointer items-center text-label">Ver dirección y restricciones</summary><p className="whitespace-pre-line text-caption">{s.scene.environment}. {s.scene.action}<br />{s.composition.framing}. {s.composition.focus}<br />{s.message.takeaway}<br />{s.avoid.join("; ")}<br />{words(identity?.payload.forbidden_variations)}</p></details>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void act(() => copyBrief(p, s.shot_key))}>Copiar brief</Button><Button disabled={busy || p.status !== "approved" || p.shot_validity?.[s.shot_key]?.state === "blocked" || p.shot_validity?.[s.shot_key]?.state === "needs_review"} onClick={() => setUploadShot({ plan: p, key: s.shot_key })}>Subir resultado</Button><Button disabled={busy} onClick={() => void act(async () => { const result = await request("get_visual_reuse_candidates", { plan_ref: { id: p.id, version: p.version, etag: p.etag }, shot_key: s.shot_key }); setReuse({ ...reuse, [`${p.id}:${s.shot_key}`]: result.data.items as (Card & { reuse: { compatible: boolean; reasons: string[]; transformation: string | null } })[] }); })}>Buscar piezas existentes</Button></div>
          {reuse[`${p.id}:${s.shot_key}`] ? <div className="flex flex-col gap-3">{!reuse[`${p.id}:${s.shot_key}`].length ? <p className="text-caption">No hay piezas de esta familia para reutilizar.</p> : null}{reuse[`${p.id}:${s.shot_key}`].map(a => <div key={a.id} className="flex flex-col gap-2 rounded-md border border-border p-3">{a.file ? <img src={a.file.url} alt={`Pieza para ${s.name}`} className="aspect-square w-full max-w-sm rounded-md object-contain" /> : null}<StatusBadge status={status(a.status)} /><p className="text-caption">{a.reuse.compatible ? "Compatible con esta toma" : a.reuse.reasons.join(" ")}</p><label className="text-label">Destino de reutilización<select aria-label="Destino de reutilización" value={targetChoice[a.id] ?? ""} onChange={e => setTargetChoice({ ...targetChoice, [a.id]: e.target.value })} className="min-h-touch w-full rounded-md border border-input bg-background px-3"><option value="">Elige un espacio</option>{data.targets.map(t => <option key={t.key} value={t.key}>{labels[t.target.type]} · {t.target.type === "gallery_shot" ? t.target.slot : t.target.type === "landing_section" ? t.target.section_key : t.target.type === "creative_concept" ? t.target.ratio : t.target.slot}</option>)}</select></label><Button disabled={busy || !targetChoice[a.id] || !a.reuse.compatible} onClick={() => void act(async () => { const t = data.targets.find(t => t.key === targetChoice[a.id])!; await request("save_visual_binding_suggestions", { asset_id: a.id, bindings: [{ target: t.target, target_etag: t.etag, reason: `Reutilización revisada para la toma ${s.name} de la misma familia visual.` }] }); await refresh(); setTab("assets"); toast.success("Uso propuesto para revisar"); })}>Proponer reutilización</Button></div>)}</div> : null}
          {uploadShot?.plan.id === p.id && uploadShot.key === s.shot_key ? <div className="flex flex-col gap-2"><label className="text-label">Origen<select aria-label="Origen del archivo" value={source} onChange={e => setSource(e.target.value)} className="min-h-touch w-full rounded-md border border-input bg-background px-3"><option value="chatgpt">Imagen del chat</option><option value="manual">Foto real</option><option value="other">Otro generador</option></select></label><TextArea label="Instrucción usada, si la tienes" value={instruction} onChange={setInstruction} /><Button disabled={busy} onClick={() => upload.current?.click()}>Elegir archivo</Button></div> : null}
        </div>)}
        <details><summary className="flex min-h-touch cursor-pointer items-center text-label">Ver intentos de producción</summary><div className="flex flex-col gap-3">{iterations.filter(it => (it.payload.plan_ref as { id: string }).id === p.id).map(it => <div key={it.id} className="flex flex-col gap-2"><p className="text-caption">{words(it.payload.shot_key)} · {when(it.created_at)} · {it.status === "prepared" ? "Pendiente de resultado" : it.status === "failed" ? "Intento fallido" : it.status === "abandoned" ? "Intento abandonado" : "Resultado guardado"}<br />{words(it.payload.failure_detail)}</p>{it.status === "prepared" ? <Button disabled={busy} onClick={() => void act(async () => { await request("record_visual_iteration_result", { iteration_id: it.id, state: "abandoned", detail: reason.trim() || "El comerciante decidió abandonar este intento externo." }); await refresh(); })}>Abandonar intento</Button> : null}</div>)}</div></details>
        {decisions(p)}<Button disabled={busy} onClick={() => { setEditingPlan(p.id); setPlanDraft(cleanPlan(p)); }}>Editar toma</Button>
      </article>)}
      {data.records.some(r => r.kind === "plan" && r.status === "archived") ? <details><summary className="flex min-h-touch cursor-pointer items-center text-label">Ver planes archivados</summary><div className="flex flex-col gap-3">{data.records.filter(r => r.kind === "plan" && r.status === "archived").map(p => <div key={p.id} className="flex flex-wrap items-center gap-2"><p className="text-label">{words(p.payload.name)}</p>{decisions(p)}</div>)}</div></details> : null}
      {planDraft ? <div className="flex flex-col gap-3"><Field label="Nombre del plan" value={planDraft.name} onValueChange={v => setPlanDraft({ ...planDraft, name: v })} />
        {planDraft.shots.map((s, i) => <div key={s.shot_key} className="flex flex-col gap-2"><h4 className="text-label font-semibold">{s.name}</h4><TextArea label="Objetivo" value={s.objective} onChange={v => setPlanDraft({ ...planDraft, shots: planDraft.shots.map((n, j) => j === i ? { ...n, objective: v } : n) })} /><TextArea label="Acción en la escena" value={s.scene.action} onChange={v => setPlanDraft({ ...planDraft, shots: planDraft.shots.map((n, j) => j === i ? { ...n, scene: { ...n.scene, action: v } } : n) })} /></div>)}
        <Button disabled={busy} onClick={() => void act(async () => { const old = plans.find(p => p.id === editingPlan)!; const stale = old.validity.state !== "current";
          const next = { ...planDraft, identity_ref: identity?.status === "approved" ? { id: identity.id, version: identity.version, etag: identity.etag } : planDraft.identity_ref };
          if (stale && !reason.trim()) throw new Error("Explica cómo resolviste el cambio antes de guardar el plan.");
          await request(stale ? "save_visual_reconciliation" : "save_visual_generation_plan", { plan_id: editingPlan, plan: next, ...(stale ? { resolutions: next.shots.map(s => ({ shot_key: s.shot_key, action: "replace", reason })) } : {}) }); setPlanDraft(null); setEditingPlan(null); await refresh(); })}>Guardar propuesta</Button></div> : null}
    </> : null}
    {tab === "assets" ? <>
      {!assets.length ? <Notice tone="info" title="Todavía no hay piezas" body="Genera desde tu chat o sube el resultado desde una toma aprobada." /> : null}
      {compare.length >= 2 ? <Button disabled={busy} onClick={() => void act(async () => { const result = await request("get_visual_comparison", { asset_ids: compare }); setComparison(result.data.items as Card[]); })}>Comparar piezas</Button> : null}
      {comparison.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{comparison.map(a => <figure key={a.id}>{a.file ? <img src={a.file.url} alt={words(a.payload.shot_key)} className="aspect-square w-full rounded-md object-contain" /> : null}<figcaption className="text-caption">{words(a.payload.shot_family)} · {labels[words(a.payload.source_system)] ?? words(a.payload.source_system)} · {when(a.created_at)}<br />{a.reviews.map(r => words(r.payload.reason)).join("; ")}</figcaption></figure>)}</div> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{assets.map(a => <article key={a.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
        {a.file ? <img src={a.file.url} alt={words(a.payload.shot_key)} className="aspect-square w-full rounded-md object-contain" /> : null}<div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-label font-semibold">{words(a.payload.shot_family)}</h3><StatusBadge status={status(a.status)} label={a.status === "archived" ? "Archivada" : undefined} /></div>
        <Freshness record={a} /><p className="text-caption text-muted-foreground">{labels[words(a.payload.source_system)] ?? words(a.payload.source_system)} · {when(a.created_at)} · Identidad v{words((a.payload.identity_ref as { version: number }).version)}<br />{labels[words(a.payload.representation)]}</p>
        {decisions(a)}<label className="flex min-h-touch items-center gap-2 text-label"><input type="checkbox" checked={compare.includes(a.id)} disabled={!compare.includes(a.id) && compare.length >= 4} onChange={e => setCompare(e.target.checked ? [...compare, a.id] : compare.filter(id => id !== a.id))} />Comparar</label>
        <Button disabled={busy} onClick={() => void act(async () => { await navigator.clipboard.writeText(`Prepara otra versión de ${words(a.payload.shot_key)}. Usa get_visual_iteration_history y el feedback guardado. Toma ${a.id} como parent_asset_id y conserva la referencia canónica.`); toast.success("Solicitud copiada para tu chat"); })}>Pedir otra versión</Button>
        <details><summary className="flex min-h-touch cursor-pointer items-center text-label">Ver historial y feedback</summary><div className="flex flex-col gap-2 text-caption">{iterations.filter(it => (it.payload.result_asset_ids as string[]).includes(a.id) || it.payload.parent_asset_id === a.id).map(it => <p key={it.id}>{when(it.created_at)} · {it.status === "failed" ? "Intento fallido" : it.status === "abandoned" ? "Intento abandonado" : "Versión recibida"}<br />{words(it.payload.failure_detail)}{it.payload.parent_asset_id ? " · Parte de una versión anterior" : ""}</p>)}{a.reviews.map(r => <p key={r.id}>{when(r.created_at)} · {words(r.payload.reason)}<br />{(r.payload.tags as string[]).map(t => tags[t as keyof typeof tags]).join(", ")}</p>)}</div></details>
        {bindings.filter(b => b.payload.asset_id === a.id).map(b => <div key={b.id} className="flex flex-col gap-2 border-t border-border pt-2"><p className="text-caption">{labels[words((b.payload.target as { type: string }).type)]} · {words(b.payload.target_key)} · {b.status === "selected" ? "Uso seleccionado" : "Uso propuesto"}</p><Freshness record={b} /><Button disabled={busy || b.status !== "selected" && (a.status !== "approved" || a.validity.state !== "current")} onClick={() => void decide(b, b.status === "selected" ? "unselect" : "select")}>{b.status === "selected" ? "Quitar uso" : "Usar aquí"}</Button></div>)}
        <label className="text-label">Elige dónde usarla<select className="min-h-touch w-full rounded-md border border-input bg-background px-3" aria-label="Destino de la pieza" value={targetChoice[a.id] ?? ""} onChange={e => setTargetChoice({ ...targetChoice, [a.id]: e.target.value })}><option value="">Elige un espacio</option>{data.targets.map(t => <option key={t.key} value={t.key}>{labels[t.target.type]} · {t.target.type === "gallery_shot" ? `${t.target.slot === "cover" ? "Portada" : "Galería"} ${t.target.position ?? ""}` : t.target.type === "landing_section" ? `${t.target.section_key} · ${t.target.slot}` : t.target.type === "creative_concept" ? t.target.ratio : t.target.slot}</option>)}</select></label>
        <Button disabled={busy || !targetChoice[a.id]} onClick={() => void act(async () => { const t = data.targets.find(t => t.key === targetChoice[a.id])!; await request("bind_visual_asset", { asset_id: a.id, bindings: [{ target: t.target, target_etag: t.etag }] }); await refresh(); })}>Proponer uso</Button>
      </article>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-caption tabular-nums">{data.asset_total} piezas</p><Button disabled={busy || data.asset_offset === 0} onClick={() => void act(async () => { await refresh(Math.max(0, data.asset_offset - 12)); })}>Anteriores</Button><Button disabled={busy || data.asset_offset + assets.length >= data.asset_total} onClick={() => void act(async () => { await refresh(data.asset_offset + 12); })}>Siguientes</Button></div>
    </> : null}
    <details><summary className="flex min-h-touch cursor-pointer items-center text-label">Explica tu decisión</summary><div className="flex flex-col gap-3"><TextArea label="Motivo o corrección para la siguiente versión" value={reason} onChange={setReason} /><div className="flex flex-wrap gap-2">{Object.entries(tags).map(([key, label]) => <label key={key} className="flex min-h-touch items-center gap-2 text-caption"><input type="checkbox" checked={reviewTags.includes(key)} onChange={e => setReviewTags(e.target.checked ? [...reviewTags, key] : reviewTags.filter(t => t !== key))} />{label}</label>)}</div></div></details>
  </section>;
}
