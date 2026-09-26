"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  CampaignTree,
  ChipInput,
  ConfigSection,
  ConfigSections,
  CreativeSlot,
  EmptyState,
  Field,
  Icon,
  Notice,
  PresetSelect,
  SegmentedControl,
  StructurePicker,
  TopBar,
  notify,
  type ChipValue,
  type TreeAdset,
} from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { AdsApiError, adsApi, uploadCreative } from "@/lib/ads/client";
import { ACCEPTED_MEDIA, MEDIA_FORMATS, durationLabel } from "@/lib/ads/media";
import { buildPreset, countChanges, DEFAULT_PRESET_FOR, isPresetKey, PANCHO_EXCLUDED_REGIONS, presetLabel, SYSTEM_PRESETS } from "@/lib/ads/presets";
import { nextMorning, startLabel } from "@/lib/ads/schedule";
import { adsetCount, dailyTotal, DESCRIPTION_LIMIT, HEADLINE_LIMIT, MAX_ADSETS, MAX_HEADLINES, MAX_PRIMARY_TEXTS, PRIMARY_TEXT_LIMIT, type EngineConfig, type LaunchConfig, type Structure, type TemplateConfig } from "@/lib/ads/schemas";
import { launchProblems, type ConfigSectionKey } from "@/lib/ads/validate";
import { amount, currencySymbol, money, parseMoney } from "@/lib/format";
import { COUNTRIES, countryName } from "@/lib/market";
import { productHref } from "@/lib/routes";
import type { AdMedia, AdTemplate, ProductAds } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EngineRules, engineSummary } from "./ads-engine";

// Etapa Anuncios: el configurador de lanzamiento (PantallasAnuncios1 y PantallasAnunciosEscritorio1,
// design-system/anuncios.md, docs/spec-anuncios.md §7). Estructura → plantilla → 5 secciones con su
// resumen → «Revisar y lanzar» → «Crear en pausa». Todo es editable y la configuración queda en ESTA
// campaña; se guarda sola como borrador.

const SAVE_DEBOUNCE_MS = 800;
const POLL_MS = 2500;
const CTAS = [
  { value: "SHOP_NOW", label: "Comprar" },
  { value: "ORDER_NOW", label: "Pedir ahora" },
  { value: "BUY_NOW", label: "Comprar ya" },
  { value: "LEARN_MORE", label: "Más información" },
] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Config {
  name: string;
  structure: Structure;
  templateKey: string | null;
  templateId: string | null;
  launch: LaunchConfig;
  engine: EngineConfig;
}

interface Upload {
  id: string;
  name: string;
  kind: "image" | "video";
  progress: number;
  error?: string;
  cancel?: () => void;
}

const errorText = (e: unknown, fallback: string) => (e instanceof AdsApiError ? e.message : fallback);

/** Edad mínima: se escribe libre y se ajusta a 18–65 al salir del campo (ajustar en cada tecla no deja borrar ni escribir). */
function AgeField({ value, onChange }: { value: number; onChange: (age: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(String(value));
  }
  const commit = () => {
    const age = Math.min(65, Math.max(18, Number(draft) || 18));
    setDraft(String(age));
    if (age !== value) onChange(age);
  };
  return (
    <Field
      label="Edad mínima"
      value={draft}
      suffix="años"
      inputMode="numeric"
      maxLength={2}
      hint="De 18 a 65"
      onValueChange={(v) => setDraft(v.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function AdsScreen({ data }: { data: ProductAds }) {
  const { product } = data;
  const router = useRouter();
  const desktop = useDesktop();
  const [cfg, setCfg] = useState<Config>({
    name: data.draft.name,
    structure: data.draft.structure,
    templateKey: data.draft.templateKey,
    templateId: data.draft.templateId,
    launch: data.draft.launch,
    engine: data.draft.engine,
  });
  const [media, setMedia] = useState<AdMedia[]>(data.media);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [templates, setTemplates] = useState<AdTemplate[]>(data.templates);
  const [spendCap, setSpendCap] = useState<number | null>(data.spendCap);
  const [capDraft, setCapDraft] = useState(data.spendCap ? amount(data.spendCap, data.currency) : "");
  const [editingCap, setEditingCap] = useState(data.spendCap == null);
  const [open, setOpen] = useState<Set<ConfigSectionKey>>(new Set());
  const [confirm, setConfirm] = useState<{ kind: "structure"; value: Structure } | { kind: "preset"; value: string } | { kind: "auto" } | null>(null);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [launching, setLaunching] = useState(data.draft.status === "launching");
  const [progress, setProgress] = useState(data.draft.progress);
  const [launchError, setLaunchError] = useState(data.draft.status === "failed" ? data.draft.error : null);
  const [regions, setRegions] = useState<ChipValue[] | null>(null);
  // Los problemas se marcan como error recién al intentar lanzar; antes, el resumen dice qué falta.
  const [attempted, setAttempted] = useState(false);
  // Lo último guardado: solo se guarda si la configuración cambió (en desarrollo los efectos corren dos veces).
  const saved = useRef(JSON.stringify({ name: data.draft.name, structure: data.draft.structure, templateKey: data.draft.templateKey, templateId: data.draft.templateId, launch: data.draft.launch, engine: data.draft.engine }));
  const { currency, timezone } = data;
  const from = data.sourceId;
  const sym = currencySymbol(currency);

  // ---------------------------------------------------------------- Plantilla y cambios
  const presetCtx = useMemo(
    () => ({ country: data.country, currency, cpaLimit: data.cpaLimit ?? 1, creatives: cfg.launch.creatives, texts: data.defaultTexts }),
    [data.country, currency, data.cpaLimit, cfg.launch.creatives, data.defaultTexts],
  );
  const base: TemplateConfig | null = useMemo(() => {
    if (cfg.templateId) {
      const t = templates.find((x) => x.id === cfg.templateId);
      return t ? fromTemplate(t, cfg.launch, data.defaultTexts) : null;
    }
    return cfg.templateKey && isPresetKey(cfg.templateKey) ? buildPreset(cfg.templateKey, presetCtx) : null;
  }, [cfg.templateId, cfg.templateKey, cfg.launch, templates, presetCtx, data.defaultTexts]);
  const current: TemplateConfig = { structure: cfg.structure, launch: cfg.launch, engine: cfg.engine };
  const changes = base ? countChanges(base, current) : 0;
  const presetValue = cfg.templateId ? `t:${cfg.templateId}` : (cfg.templateKey ?? "");

  const setLaunch = (patch: Partial<LaunchConfig>) => setCfg((c) => ({ ...c, launch: { ...c.launch, ...patch } }));
  const setEngine = (engine: EngineConfig) => setCfg((c) => ({ ...c, engine }));

  function apply(value: string) {
    setConfirm(null);
    if (value.startsWith("t:")) {
      const t = templates.find((x) => x.id === value.slice(2));
      if (!t) return;
      const next = fromTemplate(t, cfg.launch, cfg.launch);
      setCfg((c) => ({ ...c, structure: t.structure, templateId: t.id, templateKey: t.basedOn, launch: next.launch, engine: { ...next.engine, cpa_limit: c.engine.cpa_limit } }));
      return;
    }
    if (!isPresetKey(value)) return;
    const p = buildPreset(value, { ...presetCtx, texts: { primary_texts: cfg.launch.primary_texts, headlines: cfg.launch.headlines, description: cfg.launch.description } });
    setCfg((c) => ({ ...c, structure: p.structure, templateKey: value, templateId: null, launch: p.launch, engine: { ...p.engine, cpa_limit: c.engine.cpa_limit } }));
    if (value === "pancho") excludePancho();
  }

  async function excludePancho() {
    const list = regions ?? (await loadRegions());
    const hits = list.filter((r) => PANCHO_EXCLUDED_REGIONS.some((n) => norm(r.label).includes(norm(n))));
    if (hits.length) setLaunch({ excluded_regions: hits.map((r) => ({ key: r.id, name: r.label })) });
  }

  const pickStructure = (s: Structure) => {
    if (s === cfg.structure) return;
    if (changes > 0) setConfirm({ kind: "structure", value: s });
    else apply(DEFAULT_PRESET_FOR[s]);
  };
  const pickPreset = (v: string) => {
    if (v === presetValue) return;
    if (changes > 0) setConfirm({ kind: "preset", value: v });
    else apply(v);
  };
  const reset = () => apply(presetValue);

  // ---------------------------------------------------------------- Borrador (se guarda solo)
  // El próximo guardado deja el borrador al día con los ángulos de hoy (lo rehízo o decidió conservarlo).
  const syncAngles = useRef(false);
  const persist = useCallback(
    async (c: Config) => {
      setSave("saving");
      const snapshot = JSON.stringify(c);
      const sync = syncAngles.current;
      try {
        await adsApi.saveDraft(
          product.id,
          { name: c.name, structure: c.structure, template_key: c.templateKey, template_id: c.templateId, launch: c.launch, engine: c.engine, ...(sync ? { sync_angles: true } : {}) },
          from,
        );
        if (sync) syncAngles.current = false;
        saved.current = snapshot;
        setSave("saved");
      } catch (e) {
        setSave("error");
        setError(errorText(e, "No pudimos guardar el borrador."));
      }
    },
    [product.id, from],
  );
  useEffect(() => {
    if (launching || JSON.stringify(cfg) === saved.current) return;
    const t = window.setTimeout(() => persist(cfg), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [cfg, persist, launching]);

  // ---------------------------------------------------------------- Ángulos cambiados
  // El borrador se armó con otros ángulos (lib/ads/angles.ts): rehacerlo pone los textos de hoy y
  // cambia los creativos de ángulos anteriores por los de ahora; conservarlo solo deja de avisar.
  const [angles, setAngles] = useState(data.draftAngles);
  const rebuildFromAngles = () => {
    if (!angles) return;
    const old = new Set(angles.oldCreatives);
    const kept = cfg.launch.creatives.filter((id) => !old.has(id));
    const creatives = [...kept, ...angles.newCreatives].slice(0, MAX_ADSETS * 2);
    syncAngles.current = true;
    setLaunch({ primary_texts: data.defaultTexts.primary_texts, headlines: data.defaultTexts.headlines, description: data.defaultTexts.description, creatives });
    setAngles(null);
    notify("Borrador rehecho con tus ángulos de hoy");
  };
  const keepDraft = () => {
    syncAngles.current = true;
    setAngles(null);
    void persist(cfg);
  };

  // ---------------------------------------------------------------- Lanzamiento en curso (sondeo)
  useEffect(() => {
    if (!launching) return;
    const t = window.setInterval(async () => {
      try {
        const s = await adsApi.state(product.id, from);
        setProgress(s.draft.progress);
        if (s.draft.status !== "launching") {
          setLaunching(false);
          if (s.draft.status === "failed") setLaunchError(s.draft.error);
          else {
            const created = s.campaigns[0];
            notify("Campaña creada en pausa en Meta");
            router.push(created ? `/campaigns/${created.id}` : "/campaigns");
          }
        }
      } catch {
        /* el próximo sondeo reintenta */
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [launching, product.id, router, from]);

  // ---------------------------------------------------------------- Creativos
  const byId = new Map(media.map((m) => [m.id, m]));
  const chosen = cfg.launch.creatives.map((id) => byId.get(id)).filter((m): m is AdMedia => !!m);

  function addFiles(files: File[]) {
    for (const file of files) {
      const id = crypto.randomUUID();
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const job = uploadCreative(product.id, file, (p) => setUploads((l) => l.map((u) => (u.id === id ? { ...u, progress: p } : u))));
      setUploads((l) => [...l, { id, name: file.name, kind, progress: 0, cancel: job.cancel }]);
      job.done
        .then((m) => {
          setUploads((l) => l.filter((u) => u.id !== id));
          setMedia((l) => [...l, m]);
          setCfg((c) => ({ ...c, launch: { ...c.launch, creatives: [...c.launch.creatives, m.id] } }));
        })
        .catch((e) => {
          if (e instanceof AdsApiError && e.field === "abort") return setUploads((l) => l.filter((u) => u.id !== id));
          setUploads((l) => l.map((u) => (u.id === id ? { ...u, error: errorText(e, "No se pudo subir.") } : u)));
        });
    }
  }

  async function removeMedia(m: AdMedia) {
    setCfg((c) => ({ ...c, launch: { ...c.launch, creatives: c.launch.creatives.filter((x) => x !== m.id) } }));
    try {
      await adsApi.removeMedia(product.id, m.id);
      setMedia((l) => l.filter((x) => x.id !== m.id));
    } catch (e) {
      // Si está en una campaña lanzada, se queda en la biblioteca pero sale de esta configuración.
      if (!(e instanceof AdsApiError && e.status === 409)) setError(errorText(e, "No pudimos quitar el creativo."));
    }
  }

  const move = (id: string, delta: number) =>
    setCfg((c) => {
      const list = [...c.launch.creatives];
      const i = list.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return c;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...c, launch: { ...c.launch, creatives: list } };
    });
  const [dragging, setDragging] = useState<string | null>(null);

  // ---------------------------------------------------------------- Público
  const loadRegions = useCallback(async (): Promise<ChipValue[]> => {
    const country = cfg.launch.countries[0];
    if (!country) return [];
    const { options } = await adsApi.regions(country).catch(() => ({ options: [] }));
    const list = options.map((o) => ({ id: o.key, label: o.name }));
    setRegions(list);
    return list;
  }, [cfg.launch.countries]);

  const searchCountries = useCallback((q: string) => COUNTRIES.filter((c) => norm(c.name).includes(norm(q)) || c.code === q.toUpperCase()).map((c) => ({ id: c.code, label: c.name })), []);
  const searchRegions = useCallback(async (q: string) => (regions ?? (await loadRegions())).filter((r) => norm(r.label).includes(norm(q))), [regions, loadRegions]);
  const searchInterests = useCallback(async (q: string) => {
    if (q.length < 2) return [];
    const { options } = await adsApi.interests(q);
    return options.map((o) => ({ id: o.id, label: o.name, meta: o.audienceSize ? `Público de ${o.audienceSize.toLocaleString("es-CL")}+ personas` : undefined }));
  }, []);

  const setAudience = (i: number, patch: Partial<LaunchConfig["audiences"][number]>) => setLaunch({ audiences: cfg.launch.audiences.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  // ---------------------------------------------------------------- Tope diario
  async function saveCap() {
    const n = parseMoney(capDraft);
    if (!Number.isFinite(n) || n <= 0) return setError("Escribe el tope diario en números.");
    setBusy("cap");
    try {
      await adsApi.saveSpendCap(n);
      setSpendCap(n);
      setEditingCap(false);
      notify(`Tope diario de tu cuenta: ${money(n, currency)}`);
    } catch (e) {
      setError(errorText(e, "No pudimos guardar el tope."));
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- Plantilla propia
  async function saveTemplate() {
    if (!saveAs?.trim()) return;
    setBusy("template");
    try {
      const { template } = await adsApi.createTemplate({ name: saveAs.trim(), structure: cfg.structure, launch: cfg.launch, engine: cfg.engine, based_on: cfg.templateKey });
      setTemplates((l) => [...l, template]);
      setCfg((c) => ({ ...c, templateId: template.id }));
      setSaveAs(null);
      notify(`Plantilla guardada: ${template.name}`);
    } catch (e) {
      setError(errorText(e, "No pudimos guardar la plantilla."));
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- Lanzar
  const total = dailyTotal(cfg.structure, cfg.launch);
  const sets = adsetCount(cfg.structure, cfg.launch);
  const problems = launchProblems(cfg.structure, cfg.launch, cfg.engine, { media: [...media.map((m) => ({ id: m.id, kind: m.kind, status: m.status }))], spendCap, currency });
  const hasUploads = uploads.some((u) => !u.error);
  if (hasUploads && !problems.creatives) problems.creatives = "Espera a que terminen de subir los creativos.";

  function review() {
    setAttempted(true);
    const firstBad = (["creatives", "audience", "budget", "copy", "engine"] as const).find((k) => problems[k]);
    if (firstBad) {
      setOpen((s) => new Set(s).add(firstBad));
      requestAnimationFrame(() => document.getElementById(`cfg-${firstBad}`)?.querySelector("button")?.focus());
      return;
    }
    setReviewOpen(true);
  }

  async function launch() {
    setBusy("launch");
    setLaunchError(null);
    try {
      await persist(cfg);
      await adsApi.launch(product.id, from);
      setReviewOpen(false);
      setLaunching(true);
      setProgress({ step: "Creando la campaña", done: 0, total: 1 });
    } catch (e) {
      setLaunchError(errorText(e, "No pudimos crear la campaña. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- Resúmenes y vista en vivo
  const start = cfg.launch.start === "tomorrow" ? startLabel(nextMorning(new Date(), cfg.launch.start_hour, timezone), new Date(), timezone) : "al publicar";
  const countries = cfg.launch.countries.map((c) => countryName(c)).join(", ");
  const audienceText = (a: LaunchConfig["audiences"][number]) => (a.kind === "open" ? "abierto (Advantage+)" : a.interests.length ? `intereses: ${a.interests.map((i) => i.name).join(", ")}` : "intereses sin elegir");
  const summaries: Record<ConfigSectionKey, string> = {
    creatives:
      cfg.structure === "abo"
        ? `${chosen.length} ${chosen.length === 1 ? "listo" : "listos"} → ${sets} ${sets === 1 ? "conjunto" : "conjuntos"}`
        : cfg.launch.cbo_ads === "dco"
          ? `1 anuncio dinámico con ${chosen.length} creativos · ${sets} ${sets === 1 ? "conjunto" : "conjuntos"}`
          : `${chosen.length} anuncios en ${sets} ${sets === 1 ? "conjunto" : "conjuntos"}`,
    audience: `${countries} · ${cfg.launch.min_age}+ · ${cfg.launch.audiences.map(audienceText).join(" + ")}`,
    budget: `${money(cfg.launch.budget, currency)} ${cfg.structure === "abo" ? "por conjunto" : "/día en la campaña"} · empieza ${start}`,
    copy: `${cfg.launch.primary_texts.length} ${cfg.launch.primary_texts.length === 1 ? "texto" : "textos"} · ${cfg.launch.headlines.length} ${cfg.launch.headlines.length === 1 ? "título" : "títulos"} · ${CTAS.find((c) => c.value === cfg.launch.cta)?.label}`,
    engine: engineSummary(cfg.engine),
  };
  const edited = (k: ConfigSectionKey) => {
    if (!base) return false;
    const keys: Record<ConfigSectionKey, (keyof LaunchConfig)[]> = {
      creatives: ["cbo_ads"],
      audience: ["countries", "excluded_regions", "location", "min_age", "audiences"],
      budget: ["budget", "start", "start_hour"],
      copy: ["primary_texts", "headlines", "description", "cta"],
      engine: [],
    };
    if (k === "engine") return JSON.stringify(base.engine) !== JSON.stringify(cfg.engine);
    return keys[k].some((f) => JSON.stringify(base.launch[f]) !== JSON.stringify(cfg.launch[f]));
  };

  const tree: TreeAdset[] = useMemo(() => {
    const budget = money(cfg.launch.budget, currency);
    const aud = (a: LaunchConfig["audiences"][number]) => `${cfg.launch.countries.join(", ")} · ${cfg.launch.min_age}+ · ${a.kind === "open" ? "abierto" : "intereses"}`;
    const adOf = (m: AdMedia) => ({ name: m.name.replace(/\.[a-z0-9]+$/i, ""), type: m.kind });
    if (cfg.structure === "abo") {
      const out: TreeAdset[] = [];
      chosen.forEach((m) => cfg.launch.audiences.forEach((a) => out.push({ name: `Conjunto ${out.length + 1} · ${adOf(m).name}`, audience: aud(a), budget, ads: [adOf(m)] })));
      return out;
    }
    return cfg.launch.audiences.map((a, i) => ({
      name: `Conjunto ${i + 1} · ${a.kind === "open" ? "Abierto" : "Intereses"}`,
      audience: aud(a),
      ads: cfg.launch.cbo_ads === "dco" ? [{ name: `Dinámico · ${chosen.length} creativos` }] : chosen.map(adOf),
    }));
  }, [cfg.structure, cfg.launch, chosen, currency]);

  const adsetOf = (id: string) => {
    if (cfg.structure !== "abo") return undefined;
    const i = cfg.launch.creatives.indexOf(id);
    const n = cfg.launch.audiences.length;
    return n === 1 ? `Conjunto ${i + 1}` : `Conjuntos ${i * n + 1}–${i * n + n}`;
  };

  // ---------------------------------------------------------------- Vistas
  const subtitle = `${cfg.structure.toUpperCase()} · ${base ? (cfg.templateId ? (templates.find((t) => t.id === cfg.templateId)?.name ?? "Plantilla") : presetLabel(cfg.templateKey ?? "")) : "Sin plantilla"}${changes ? " (editada)" : ""}`;

  if (data.locked) {
    const toSettings = data.locked.includes("Meta");
    return (
      <div className="flex flex-col">
        <TopBar back={product.name} backHref={`/products/${product.id}`} title="Anuncios" subtitle="Lanzar campaña" className="lg:hidden" />
        <div className="px-4 pt-6 lg:px-8 lg:max-w-content">
          <EmptyState
            icon="lock"
            title={toSettings ? "Conecta Meta Ads" : "Termina la página del producto"}
            body={data.locked}
            action={
              <Button size="sm" iconEnd="chevron-right" href={toSettings ? "/settings" : productHref(product.id, "textos")}>
                {toSettings ? "Ir a Ajustes" : "Ir a la página del producto"}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const toggle = (k: ConfigSectionKey) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const section = (k: ConfigSectionKey, index: number, title: string, body: React.ReactNode) => (
    <ConfigSection
      key={k}
      id={`cfg-${k}`}
      index={index}
      title={title}
      summary={!attempted && problems[k] ? problems[k] : summaries[k]}
      open={open.has(k)}
      onToggle={() => toggle(k)}
      done={!problems[k] && k === "creatives" && chosen.length > 0}
      edited={edited(k)}
      error={attempted ? problems[k] : undefined}
      standalone={desktop}
    >
      {body}
    </ConfigSection>
  );

  const creativesBody = (
    <>
      <p className="m-0 text-caption text-muted-foreground">
        {cfg.structure === "abo"
          ? cfg.launch.audiences.length > 1
            ? `En ABO cada creativo crea un conjunto por público (${cfg.launch.audiences.length}).`
            : "En ABO cada creativo crea su propio conjunto."
          : "En CBO los creativos van como anuncios de cada conjunto."}
      </p>
      {cfg.structure === "cbo" ? (
        <SegmentedControl
          block
          label="Anuncios"
          value={cfg.launch.cbo_ads}
          onChange={(v) => setLaunch({ cbo_ads: v as LaunchConfig["cbo_ads"] })}
          options={[
            { value: "one_per_creative", label: "Un anuncio por creativo" },
            { value: "dco", label: "Un anuncio dinámico" },
          ]}
        />
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {chosen.map((m, i) => (
          <li
            key={m.id}
            draggable
            onDragStart={() => setDragging(m.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragging && dragging !== m.id) move(dragging, cfg.launch.creatives.indexOf(m.id) - cfg.launch.creatives.indexOf(dragging));
            }}
            onDragEnd={() => setDragging(null)}
            className={cn(dragging === m.id && "opacity-60")}
          >
            <CreativeSlot
              name={m.name}
              type={m.kind}
              src={m.url}
              ratio={m.ratio}
              duration={durationLabel(m.durationS)}
              state={m.status}
              error={m.error}
              adset={adsetOf(m.id)}
              detail={cfg.structure === "cbo" ? `Anuncio en ${sets} ${sets === 1 ? "conjunto" : "conjuntos"}` : undefined}
              onRemove={() => removeMedia(m)}
              handle={
                chosen.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Mover ${m.name} (posición ${i + 1} de ${chosen.length}). Usa las flechas.`}
                    title="Arrastra o usa las flechas para ordenar"
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        move(m.id, -1);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        move(m.id, 1);
                      }
                    }}
                    className="grid size-touch cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-accent"
                  >
                    <Icon name="grip" />
                  </button>
                ) : null
              }
            />
          </li>
        ))}
        {uploads.map((u) => (
          <li key={u.id}>
            <CreativeSlot
              name={u.name}
              type={u.kind}
              state={u.error ? "error" : "uploading"}
              progress={u.progress}
              error={u.error}
              onRemove={() => (u.error ? setUploads((l) => l.filter((x) => x.id !== u.id)) : u.cancel?.())}
            />
          </li>
        ))}
      </ul>
      <label className="flex min-h-touch cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-input px-4 py-4 text-center focus-within:ring-2 focus-within:ring-ring hover:bg-accent">
        <input
          type="file"
          multiple
          accept={ACCEPTED_MEDIA}
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="inline-flex items-center gap-1.5 text-row text-primary">
          <Icon name="upload" size="sm" />
          Sube imágenes o videos
        </span>
        <span className="text-caption text-muted-foreground">{MEDIA_FORMATS}</span>
      </label>
    </>
  );

  const audienceBody = (
    <>
      <ChipInput
        label="Países"
        values={cfg.launch.countries.map((c) => ({ id: c, label: countryName(c) }))}
        search={searchCountries}
        onAdd={(v) => setLaunch({ countries: [...cfg.launch.countries, v.id] })}
        onRemove={(id) => setLaunch({ countries: cfg.launch.countries.filter((c) => c !== id) })}
        max={10}
      />
      <ChipInput
        label="Regiones excluidas"
        values={cfg.launch.excluded_regions.map((r) => ({ id: r.key, label: r.name }))}
        search={searchRegions}
        onAdd={(v) => setLaunch({ excluded_regions: [...cfg.launch.excluded_regions, { key: v.id, name: v.label }] })}
        onRemove={(id) => setLaunch({ excluded_regions: cfg.launch.excluded_regions.filter((r) => r.key !== id) })}
        hint="Donde el despacho es lento o no llega. Advantage+ no las vuelve a incluir."
        placeholder="Buscar región…"
      />
      {cfg.launch.audiences.map((a, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label">{cfg.structure === "cbo" ? `Conjunto ${i + 1}` : cfg.launch.audiences.length > 1 ? `Público ${i + 1}` : "Tipo de público"}</span>
            {cfg.launch.audiences.length > 1 ? (
              <button type="button" className="min-h-touch cursor-pointer px-2 text-label text-primary" onClick={() => setLaunch({ audiences: cfg.launch.audiences.filter((_, j) => j !== i) })}>
                Quitar
              </button>
            ) : null}
          </div>
          <SegmentedControl
            block
            label={`Tipo de público ${i + 1}`}
            value={a.kind}
            onChange={(v) => setAudience(i, { kind: v as "open" | "interests" })}
            options={[
              { value: "open", label: "Abierto (Advantage+)" },
              { value: "interests", label: "Intereses" },
            ]}
          />
          <ChipInput
            label="Intereses"
            disabled={a.kind === "open"}
            values={a.interests.map((x) => ({ id: x.id, label: x.name }))}
            search={searchInterests}
            onAdd={(v) => setAudience(i, { interests: [...a.interests, { id: v.id, name: v.label }] })}
            onRemove={(id) => setAudience(i, { interests: a.interests.filter((x) => x.id !== id) })}
            hint={a.kind === "open" ? "Solo con público de intereses. Abierto deja que Meta encuentre a quién mostrarle." : "Del catálogo de Meta. Escribe al menos 2 letras."}
            placeholder="Buscar interés…"
            max={25}
          />
        </div>
      ))}
      {cfg.launch.audiences.length < 4 ? (
        <Button variant="ghost" size="sm" icon="plus" className="self-start" onClick={() => setLaunch({ audiences: [...cfg.launch.audiences, { kind: "interests", interests: [] }] })}>
          {cfg.structure === "cbo" ? "Agregar conjunto" : "Agregar público"}
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <AgeField value={cfg.launch.min_age} onChange={(min_age) => setLaunch({ min_age })} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ad-loc" className="text-label">
            Ubicación
          </label>
          <select
            id="ad-loc"
            value={cfg.launch.location}
            onChange={(e) => setLaunch({ location: e.target.value as LaunchConfig["location"] })}
            className="h-control cursor-pointer rounded-md border border-input bg-background px-3 text-body focus-visible:border-primary"
          >
            <option value="home_recent">Vive o estuvo</option>
            <option value="home">Solo vive</option>
          </select>
        </div>
      </div>
    </>
  );

  const budgetBody = (
    <>
      <div className="grid gap-3 @xl:grid-cols-[1fr_1fr_1.5fr]">
        <Field
          label={cfg.structure === "abo" ? "Presupuesto por conjunto" : "Presupuesto de la campaña"}
          prefix={sym}
          suffix="/día"
          inputMode="numeric"
          value={amount(cfg.launch.budget, currency)}
          onValueChange={(v) => {
            const n = parseMoney(v);
            if (Number.isFinite(n)) setLaunch({ budget: n });
          }}
          hint={cfg.structure === "abo" ? "ABO: se fija en cada conjunto" : "CBO: Meta lo reparte entre los conjuntos"}
        />
        <Field label="Puja" value="Menor costo" readOnly hint="Sin tope de costo" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="ad-start" className="text-label">
            Empieza
          </label>
          <div className="flex min-w-0 gap-2">
            <select
              id="ad-start"
              value={cfg.launch.start}
              onChange={(e) => setLaunch({ start: e.target.value as LaunchConfig["start"] })}
              className="h-control min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-background px-3 text-body"
            >
              <option value="tomorrow">A primera hora</option>
              <option value="now">Al publicar</option>
            </select>
            {cfg.launch.start === "tomorrow" ? (
              <select
                aria-label="Hora de inicio"
                value={cfg.launch.start_hour}
                onChange={(e) => setLaunch({ start_hour: Number(e.target.value) })}
                className="h-control w-24 shrink-0 cursor-pointer rounded-md border border-input bg-background px-3 text-body tabular-nums"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <span className="text-caption text-muted-foreground">
            {cfg.launch.start === "tomorrow" ? `Empieza ${start} · ` : ""}Hora de tu cuenta ({timezone.split("/").pop()?.replace(/_/g, " ")})
          </span>
        </div>
      </div>
      <p className="m-0 text-caption text-muted-foreground tabular-nums">
        Total diario: {money(total, currency)}
        {cfg.structure === "abo" ? ` (${sets} ${sets === 1 ? "conjunto" : "conjuntos"} × ${money(cfg.launch.budget, currency)})` : ""}.
      </p>
      {editingCap ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-3">
          <Field
            label="Tope de gasto diario de tu cuenta"
            prefix={sym}
            inputMode="numeric"
            value={capDraft}
            onValueChange={setCapDraft}
            hint="Ningún lanzamiento lo supera. Vale para todas tus campañas."
            className="min-w-48 flex-1"
          />
          <Button variant="primary" icon="check" loading={busy === "cap"} onClick={saveCap}>
            Guardar tope
          </Button>
        </div>
      ) : (
        <p className="m-0 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          Tope de tu cuenta: {money(spendCap ?? 0, currency)}/día
          <button type="button" className="min-h-touch cursor-pointer text-primary" onClick={() => setEditingCap(true)}>
            Cambiar
          </button>
        </p>
      )}
    </>
  );

  const list = (key: "primary_texts" | "headlines", label: string, limit: number, max: number, rows: number) => (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-label">{label}</legend>
      {cfg.launch[key].map((t, i) => (
        <div key={i} className="flex items-start gap-1">
          <div className="flex flex-1 flex-col gap-1">
            <textarea
              aria-label={`${label} ${i + 1}`}
              value={t}
              rows={rows}
              maxLength={limit}
              onChange={(e) => setLaunch({ [key]: cfg.launch[key].map((x, j) => (j === i ? e.target.value : x)) })}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-body focus-visible:border-primary"
            />
            <span className="self-end text-caption text-muted-foreground tabular-nums">
              {[...t].length}/{limit}
            </span>
          </div>
          {cfg.launch[key].length > 1 ? (
            <button type="button" aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`} className="grid size-touch cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent" onClick={() => setLaunch({ [key]: cfg.launch[key].filter((_, j) => j !== i) })}>
              <Icon name="x" />
            </button>
          ) : null}
        </div>
      ))}
      {cfg.launch[key].length < max ? (
        <Button variant="ghost" size="sm" icon="plus" className="self-start" onClick={() => setLaunch({ [key]: [...cfg.launch[key], ""] })}>
          Agregar
        </Button>
      ) : null}
    </fieldset>
  );

  const copyBody = (
    <>
      <p className="m-0 text-caption text-muted-foreground">
        Salen de tus desarrollos de Ángulos y de la página aprobada.{cfg.structure === "abo" ? " En ABO cada conjunto usa un texto principal distinto, en orden." : ""}
      </p>
      {list("primary_texts", "Textos principales", PRIMARY_TEXT_LIMIT, MAX_PRIMARY_TEXTS, 4)}
      {list("headlines", "Títulos", HEADLINE_LIMIT, MAX_HEADLINES, 1)}
      <Field label="Descripción" value={cfg.launch.description} maxLength={DESCRIPTION_LIMIT} onValueChange={(v) => setLaunch({ description: v })} hint={`${[...cfg.launch.description].length}/${DESCRIPTION_LIMIT}`} />
      <div className="grid gap-3 @xl:grid-cols-[1fr_--spacing(48)]">
        <Field label="URL del producto" value={data.productUrl ?? "Sin URL: publica el producto en tu tienda"} readOnly hint="Con UTM para saber qué anuncio vendió" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ad-cta" className="text-label">
            Botón
          </label>
          <select id="ad-cta" value={cfg.launch.cta} onChange={(e) => setLaunch({ cta: e.target.value as LaunchConfig["cta"] })} className="h-control cursor-pointer rounded-md border border-input bg-background px-3 text-body">
            {CTAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button variant="ghost" size="sm" icon="undo" className="self-start" onClick={() => setLaunch({ ...data.defaultTexts })}>
        Volver a los textos aprobados
      </Button>
    </>
  );

  const engineBody = (
    <>
      <SegmentedControl
        block
        label="Cómo actúa"
        value={cfg.engine.mode}
        onChange={(v) => (v === "auto" ? setConfirm({ kind: "auto" }) : setEngine({ ...cfg.engine, mode: "suggest" }))}
        options={[
          { value: "suggest", label: "Solo recomendar" },
          { value: "auto", label: "Automático" },
        ]}
      />
      {confirm?.kind === "auto" ? (
        <Notice
          tone="info"
          icon="alert"
          title="El motor pausará y subirá presupuestos solo."
          body={`Hasta +30 % por paso, un cambio por conjunto cada espera y nunca sobre ${money(cfg.engine.rules.find((r) => r.type === "daily_cap" && r.enabled && "amount" in r) ? (cfg.engine.rules.find((r) => r.type === "daily_cap") as { amount: number }).amount : total, currency)} diarios. Cada cambio queda con Deshacer. Crear una CBO de ganadores siempre te lo pregunta.`}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setEngine({ ...cfg.engine, mode: "auto" });
                  setConfirm(null);
                }}
              >
                Activar automático
              </Button>
            </div>
          }
        />
      ) : null}
      <Field
        label="CPA límite de esta campaña"
        prefix={sym}
        inputMode="numeric"
        value={amount(cfg.engine.cpa_limit, currency)}
        onValueChange={(v) => {
          const n = parseMoney(v);
          if (Number.isFinite(n) && n > 0) setEngine({ ...cfg.engine, cpa_limit: n });
        }}
        hint={data.cpaLimit ? `El CPA máximo del producto es ${money(data.cpaLimit, currency)}. Las reglas en × se ajustan solas.` : "Guarda el precio en Información base para calcular el CPA máximo."}
      />
      <EngineRules engine={cfg.engine} structure={cfg.structure} currency={currency} dailyTotal={total} onChange={setEngine} />
    </>
  );

  const confirmBanner =
    confirm && confirm.kind !== "auto" ? (
      <Notice
        title={confirm.kind === "structure" ? `¿Cambiar a ${confirm.value.toUpperCase()}?` : "¿Cambiar de plantilla?"}
        body={`Se conservan los creativos y los textos. Se reemplazan el público, el presupuesto y las reglas (${changes} ${changes === 1 ? "cambio" : "cambios"} tuyos).`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" onClick={() => apply(confirm.kind === "structure" ? DEFAULT_PRESET_FOR[confirm.value] : confirm.value)}>
              Cambiar
            </Button>
          </div>
        }
      />
    ) : null;

  const saveAsForm =
    saveAs != null ? (
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-3">
        <Field label="Nombre de la plantilla" value={saveAs} maxLength={60} onValueChange={setSaveAs} placeholder="Mi plantilla · Chile 23+" className="min-w-48 flex-1" autoFocus />
        <Button variant="ghost" onClick={() => setSaveAs(null)}>
          Cancelar
        </Button>
        <Button variant="primary" icon="check" loading={busy === "template"} disabled={!saveAs.trim()} onClick={saveTemplate}>
          Guardar
        </Button>
      </div>
    ) : null;

  const presets = (
    <PresetSelect
      value={presetValue}
      groups={[
        { label: "Plantillas de DropFlex", options: SYSTEM_PRESETS.filter((p) => p.structure === cfg.structure).map((p) => ({ value: p.key, label: p.key === "impulso" ? `${p.label} (base)` : p.label })) },
        { label: "Mis plantillas", options: templates.filter((t) => t.structure === cfg.structure).map((t) => ({ value: `t:${t.id}`, label: t.name })) },
      ]}
      onChange={pickPreset}
      source="Carga público, presupuesto, horario y reglas. Cámbiala cuando quieras."
      modified={changes}
      onReset={reset}
      onSaveAs={() => setSaveAs(cfg.templateKey ? `${presetLabel(cfg.templateKey)} · mía` : "Mi plantilla")}
      disabled={launching}
    />
  );

  const sections = [
    section("creatives", 1, "Creativos", creativesBody),
    section("audience", 2, "Público", audienceBody),
    section("budget", 3, "Presupuesto y horario", budgetBody),
    section("copy", 4, "Textos del anuncio", copyBody),
    section("engine", 5, "Motor de decisión", engineBody),
  ];

  const treeView = (
    <CampaignTree
      name={cfg.name}
      structure={cfg.structure}
      budget={money(cfg.launch.budget, currency)}
      adsets={tree}
      note={cfg.structure === "abo" ? "Presupuesto en cada conjunto. Un anuncio por conjunto." : "Presupuesto en la campaña: Meta lo reparte entre los conjuntos."}
    />
  );

  const saveLabel = save === "saving" ? "Guardando…" : save === "saved" ? "Borrador guardado" : save === "error" ? "No se guardó" : null;

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Anuncios" stageKey="anuncios" image={product.image} />
      <TopBar back={product.name} backHref={`/products/${product.id}`} title="Lanzar campaña" subtitle={subtitle} actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        } className="sticky top-0 z-sticky lg:hidden" />

      <div className="flex flex-1 flex-col @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_--spacing(95)]">
        <div className="flex min-w-0 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
          <p className="hidden text-body text-muted-foreground lg:block">
            Lanzar campaña · {subtitle}
            {saveLabel ? <span className="ml-2 text-caption">· {saveLabel}</span> : null}
          </p>
          {launching ? (
            <EmptyState icon="megaphone" busy title="Creando la campaña en Meta" body={progress ? `${progress.step} (${progress.done} de ${progress.total})` : "Campaña → medios → creativos → conjuntos y anuncios. Todo queda en pausa."} />
          ) : null}
          {launchError ? (
            <div role="alert" className="rounded-md bg-destructive-soft p-3 text-label font-normal text-destructive">
              {launchError} No quedó nada creado en Meta: corrige y toca Revisar y lanzar otra vez.
            </div>
          ) : null}
          {angles?.stale && !launching ? (
            <Notice
              title="Cambiaste tus ángulos."
              body={`El borrador tiene los textos${angles.oldCreatives.length ? " y creativos" : ""} de tus ángulos anteriores. Rehacerlo cambia textos, títulos${
                angles.oldCreatives.length || angles.newCreatives.length ? " y creativos" : ""
              }; el presupuesto y los públicos quedan igual.`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon="sparkle" onClick={rebuildFromAngles}>
                    Rehacer con mis ángulos
                  </Button>
                  <Button size="sm" variant="ghost" onClick={keepDraft}>
                    Mantener como está
                  </Button>
                </div>
              }
            />
          ) : null}
          {data.source ? (
            <Notice tone="info" icon="trend" title={`CBO con los ganadores de «${data.source}».`} body="Revisa los creativos y el presupuesto. Se crea aparte, en pausa, y la campaña de testeo sigue igual." />
          ) : null}
          {data.campaigns.length && !data.source ? (
            <Notice
              tone="info"
              icon="megaphone"
              title={data.campaigns.length === 1 ? "Este producto ya tiene una campaña." : `Este producto ya tiene ${data.campaigns.length} campañas.`}
              body="Una nueva se crea aparte, con su propia configuración."
              action={
                <Button size="sm" variant="secondary" iconEnd="chevron-right" href={`/campaigns/${data.campaigns[0].id}`}>
                  Ver campaña
                </Button>
              }
            />
          ) : null}
          <div className={cn("flex flex-col gap-4", launching && "pointer-events-none opacity-60")} aria-disabled={launching || undefined}>
            <div className="grid gap-4 @4xl:grid-cols-[1.3fr_1fr] @4xl:items-start">
              <StructurePicker value={cfg.structure} onChange={pickStructure} disabled={launching} />
              {presets}
            </div>
            {confirmBanner}
            {saveAsForm}
            {desktop ? <div className="flex flex-col gap-3">{sections}</div> : <ConfigSections>{sections}</ConfigSections>}
          </div>
          {error ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <aside aria-label="Se creará en Meta" className="hidden border-l bg-sidebar px-6 pt-6 pb-4 @4xl:block">
          <div className="sticky top-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-heading">Se creará en Meta</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">En pausa</span>
            </div>
            {treeView}
          </div>
        </aside>
      </div>

      <StickyActions
        variant="bar"
        stack
        className="lg:px-8"
        summary="Se crea en pausa: campaña → medios → creativos → conjuntos y anuncios. Tú la activas."
        mobileNote="Se crea en pausa. Tú la activas."
      >
        <Button variant="ghost" className="max-lg:hidden" loading={save === "saving"} disabled={launching} onClick={() => persist(cfg)}>
          Guardar borrador
        </Button>
        <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" iconEnd="chevron-right" disabled={launching || hasUploads} onClick={review}>
          Revisar y lanzar
        </Button>
      </StickyActions>

      <Drawer open={reviewOpen} onOpenChange={setReviewOpen} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
        <DrawerContent className="max-h-[90svh] lg:max-h-none lg:w-120">
          <DrawerTitle className="px-4 pt-3 text-heading">Revisar y lanzar</DrawerTitle>
          <DrawerDescription className="px-4 text-caption text-muted-foreground">Se crea en pausa en {data.meta.account ?? "tu cuenta"}. Nada gasta hasta que toques Publicar.</DrawerDescription>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
            <Field label="Nombre de la campaña" value={cfg.name} maxLength={120} onValueChange={(v) => setCfg((c) => ({ ...c, name: v }))} />
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-label font-normal">
              {(
                [
                  ["Creativos", summaries.creatives],
                  ["Público", summaries.audience],
                  ["Presupuesto", `${summaries.budget} · total ${money(total, currency)}/día`],
                  ["Textos", summaries.copy],
                  ["Motor", summaries.engine],
                  ["Página y píxel", `${data.meta.page ?? "—"} · ${data.meta.pixel ?? "—"}`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="m-0">{v}</dd>
                </div>
              ))}
            </dl>
            {treeView}
            {launchError ? (
              <p role="alert" className="m-0 text-label font-normal text-destructive">
                {launchError}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2 border-t px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]">
            <Button variant="ghost" onClick={() => setReviewOpen(false)} className="flex-1">
              Seguir editando
            </Button>
            <Button variant="primary" icon="megaphone" loading={busy === "launch"} onClick={launch} className="flex-[1.5]">
              Crear en pausa
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Una plantilla propia aplicada: sus valores, con los creativos y los textos de este producto. */
function fromTemplate(t: AdTemplate, launch: LaunchConfig, texts: Pick<LaunchConfig, "primary_texts" | "headlines" | "description">): TemplateConfig {
  return {
    structure: t.structure,
    launch: { ...t.launch, creatives: launch.creatives, primary_texts: texts.primary_texts, headlines: texts.headlines, description: texts.description },
    engine: t.engine,
  };
}
