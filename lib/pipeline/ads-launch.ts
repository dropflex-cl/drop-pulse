import "server-only";
import { adsContext, AD_MEDIA_BUCKET, fail, getCampaignRow, getDraft, listMediaRows, type CampaignRow, type MediaRow } from "@/lib/ads/store";
import { createAd, createAdset, createCampaign, createCreative, getAdAccount, lifetimeImpressions, setStartTime, setStatus, uploadImage, uploadVideo, videoStatus, videoThumbnailHash, waitVideoReady } from "@/lib/ads/meta/adapter";
import { buildTargeting, dynamicCreative, needsDynamicCreative, singleCreative, type UploadedMedia } from "@/lib/ads/meta/payloads";
import { creationDate } from "@/lib/ads/naming";
import { planLaunch, planSteps } from "@/lib/ads/plan";
import { nextMorning } from "@/lib/ads/schedule";
import { engineSchema, launchSchema } from "@/lib/ads/schemas";
import { launchProblems } from "@/lib/ads/validate";
import { adminClient } from "@/lib/integrations/admin";
import { MetaApiError, MetaAuthError, MetaPermissionError } from "@/lib/integrations/meta/client";
import { markMetaError, metaToken } from "@/lib/integrations/meta/connection";
import { liveProductUrl } from "@/lib/pipeline/publish";
import { ProductApiError } from "@/lib/products/http";
import { getProductRow } from "@/lib/products/store";

// Lanzar una campaña en Meta (docs/spec-anuncios.md §7.4). Orden: campaña → medios → por cada conjunto,
// el conjunto y sus anuncios (creativo + anuncio). TODO se crea en PAUSA: nada gasta hasta «Publicar».
// Cada objeto creado se anota en ad_campaigns.meta_objects apenas existe; si cualquier paso falla, se
// borra lo creado en orden inverso y el borrador vuelve con el motivo (no quedan campañas huérfanas).

/** Un lanzamiento que no avanza en este tiempo se da por interrumpido (el proceso murió). */
const LAUNCH_STALE_MS = 10 * 60 * 1000;
/** Plazo para que Meta procese los videos, dentro del tiempo de la función (maxDuration 300). */
const VIDEO_DEADLINE_MS = 3 * 60 * 1000;

type MetaObject = CampaignRow["meta_objects"][number];

const now = () => new Date().toISOString();

const NO_URL = "Tu producto no está a la venta en tu tienda online. Publícalo en Shopify (canal Tienda online) antes de lanzar.";

/** Lo que Meta dijo, en una frase para el comerciante. */
export function metaReason(e: unknown): string {
  if (e instanceof MetaAuthError) return "Tu conexión con Meta venció. Vuelve a conectarla en Ajustes.";
  if (e instanceof MetaPermissionError) return "Tu cuenta de Meta no dio permiso para crear anuncios. Revisa los permisos en Ajustes.";
  if (e instanceof MetaApiError) return e.userMessage ? `Meta dijo: ${e.userMessage}` : `Meta respondió con un error (${e.code ?? e.status ?? "sin código"}).`;
  if (e instanceof Error) return e.message;
  return "Algo falló al hablar con Meta.";
}

async function update(id: string, patch: Partial<CampaignRow>) {
  fail("Guardar la campaña", (await adminClient().from("ad_campaigns").update({ ...patch, updated_at: now() }).eq("id", id)).error);
}

/**
 * Valida el borrador y lo pasa a `launching` (una sola vez: si ya está en curso, 409). Devuelve la
 * campaña para correr `runLaunch` en segundo plano.
 */
export async function startLaunch(userId: string, productId: string, sourceCampaignId: string | null = null): Promise<CampaignRow> {
  const product = await getProductRow(userId, productId);
  if (!product) throw new ProductApiError("No encontramos ese producto.", 404);
  const [ctx, draft, media, url] = await Promise.all([adsContext(userId, product), getDraft(userId, productId, sourceCampaignId), listMediaRows(userId, productId), liveProductUrl(userId, productId)]);
  if (!ctx.metaReady) throw new ProductApiError("Conecta Meta Ads y elige cuenta, página y píxel en Ajustes.", 409);
  if (!url) throw new ProductApiError(NO_URL, 409);
  if (!draft) throw new ProductApiError("No hay una campaña por lanzar. Recarga la página.", 404);
  if (draft.status === "launching") throw new ProductApiError("La campaña ya se está creando.", 409);

  const problems = launchProblems(draft.structure, draft.launch, draft.engine, { media: media.map((m) => ({ id: m.id, kind: m.kind, status: m.status })), spendCap: ctx.spendCap, currency: ctx.currency });
  const first = Object.values(problems)[0];
  if (first) throw new ProductApiError(first, 422);
  if (!launchSchema.safeParse(draft.launch).success || !engineSchema.safeParse(draft.engine).success) throw new ProductApiError("Revisa la configuración: hay valores que no son válidos.", 422);

  // Solo un lanzamiento: el cambio de estado es condicional.
  const { data, error } = await adminClient()
    .from("ad_campaigns")
    .update({ status: "launching", error: null, progress: { step: "Preparando", done: 0, total: 1 }, meta_objects: [], ad_account_id: ctx.meta!.ad_account_id, updated_at: now() })
    .eq("id", draft.id)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  fail("Empezar el lanzamiento", error);
  if (!data) throw new ProductApiError("La campaña ya se está creando.", 409);
  return data as CampaignRow;
}

/** Borra en Meta lo creado, en orden inverso. Devuelve lo que no se pudo borrar. */
async function rollback(token: string, objects: MetaObject[]): Promise<MetaObject[]> {
  const left: MetaObject[] = [];
  // Borrar la campaña borra sus conjuntos y anuncios; igual se van de a uno por si la campaña falla.
  for (const o of [...objects].reverse()) {
    if (o.level === "creative") continue; // un creativo sin anuncio no se entrega ni cobra
    try {
      await setStatus(token, o.id, "DELETED");
    } catch (e) {
      console.error("[ads-launch] revertir", o, e);
      left.push(o);
    }
  }
  return left;
}

/** Sube un medio a la cuenta, o reusa lo que ya está ahí. */
async function ensureMedia(token: string, accountId: string, m: MediaRow, deadline: number): Promise<UploadedMedia> {
  const db = adminClient();
  const sameAccount = m.ad_account_id === accountId;
  if (m.kind === "image") {
    if (sameAccount && m.meta_image_hash) return { kind: "image", imageHash: m.meta_image_hash };
    const { data: blob, error } = await db.storage.from(AD_MEDIA_BUCKET).download(m.storage_path);
    if (error || !blob) throw new Error(`No encontramos la imagen «${m.name}». Súbela de nuevo.`);
    const hash = await uploadImage(token, accountId, Buffer.from(await blob.arrayBuffer()).toString("base64"));
    fail("Guardar el creativo", (await db.from("ad_media").update({ ad_account_id: accountId, meta_image_hash: hash, updated_at: now() }).eq("id", m.id)).error);
    return { kind: "image", imageHash: hash };
  }
  if (sameAccount && m.meta_video_id && m.thumbnail_hash && (await videoStatus(token, m.meta_video_id).catch(() => "error")) === "ready") {
    return { kind: "video", videoId: m.meta_video_id, thumbnailHash: m.thumbnail_hash };
  }
  const signed = await db.storage.from(AD_MEDIA_BUCKET).createSignedUrl(m.storage_path, 60 * 60);
  if (signed.error || !signed.data) throw new Error(`No encontramos el video «${m.name}». Súbelo de nuevo.`);
  const videoId = await uploadVideo(token, accountId, signed.data.signedUrl, m.name);
  fail("Guardar el creativo", (await db.from("ad_media").update({ ad_account_id: accountId, meta_video_id: videoId, thumbnail_hash: null, status: "processing", updated_at: now() }).eq("id", m.id)).error);
  await waitVideoReady(token, videoId, deadline);
  const thumb = await videoThumbnailHash(token, accountId, videoId);
  fail("Guardar el creativo", (await db.from("ad_media").update({ thumbnail_hash: thumb, status: "ready", updated_at: now() }).eq("id", m.id)).error);
  return { kind: "video", videoId, thumbnailHash: thumb };
}

/** Crea todo en Meta (en pausa). Nunca lanza: deja el resultado en la fila. */
export async function runLaunch(campaignId: string): Promise<void> {
  const db = adminClient();
  const { data } = await db.from("ad_campaigns").select("*").eq("id", campaignId).maybeSingle();
  const c = data as CampaignRow | null;
  if (!c || c.status !== "launching") return;
  const objects: MetaObject[] = [];
  let step = "Preparando";
  let done = 0;
  let total = 1;
  const progress = async (label: string) => {
    step = label;
    await update(campaignId, { progress: { step, done, total }, meta_objects: objects });
  };
  const token = await metaToken(c.user_id);

  try {
    if (!token) throw new MetaAuthError("Sin token");
    const product = await getProductRow(c.user_id, c.product_id);
    if (!product) throw new Error("El producto ya no existe.");
    const ctx = await adsContext(c.user_id, product);
    const meta = ctx.meta!;
    const accountId = meta.ad_account_id!;
    const account = await getAdAccount(token, accountId);
    // Los montos del borrador están en la moneda que se vio al configurar: si la cuenta cambió, no se adivina.
    if (account.currency !== c.currency) throw new Error(`Tu cuenta de Meta está en ${account.currency} y la campaña en ${c.currency}. Revisa los montos y lanza otra vez.`);
    if (account.accountStatus != null && account.accountStatus !== 1) throw new Error("Tu cuenta publicitaria no está activa en Meta. Revísala en Ads Manager.");

    // Se lee de Shopify al lanzar: el dominio principal de hoy, aunque haya cambiado desde Publicar.
    const link = await liveProductUrl(c.user_id, product.id);
    if (!link) throw new Error(NO_URL);

    const allMedia = await listMediaRows(c.user_id, c.product_id);
    const media = c.launch.creatives.map((id) => allMedia.find((m) => m.id === id)).filter((m): m is MediaRow => !!m);
    // Los nombres llevan la fecha de hoy en la cuenta: al rehacer o recrear, la del nuevo lanzamiento.
    const plan = planLaunch(c.structure, c.launch, media, { product: product.title, date: creationDate(new Date(), account.timezone) });
    total = planSteps(plan, media.length);
    const startTime = c.launch.start === "tomorrow" ? nextMorning(new Date(), c.launch.start_hour, account.timezone) : null;
    // El nombre queda en la fila desde ya: si algo falla, el aviso nombra la campaña como está en Meta.
    c.name = plan.name;
    await update(campaignId, { timezone: account.timezone, name: plan.name });

    // 1. La campaña.
    await progress("Creando la campaña");
    const metaCampaignId = await createCampaign(token, { accountId, name: plan.name, structure: c.structure, dailyBudget: plan.campaignBudget, currency: c.currency });
    objects.push({ level: "campaign", id: metaCampaignId });
    done++;

    // 2. Los medios (se reusan si ya están en la cuenta).
    const uploaded = new Map<string, UploadedMedia>();
    const deadline = Date.now() + VIDEO_DEADLINE_MS;
    for (const m of media) {
      await progress(m.kind === "video" ? `Subiendo y procesando «${m.name}»` : `Subiendo «${m.name}»`);
      uploaded.set(m.id, await ensureMedia(token, accountId, m, deadline));
      done++;
    }

    // 3. Cada conjunto y sus anuncios.
    // En DropFlex cada conjunto y anuncio se ve con su etiqueta (la campaña ya dice producto, estructura y fecha).
    const setRows: { id: string; name: string; meta: string; ads: { name: string; meta: string; creative: string; mediaId: string | null; copy: unknown }[]; budget: number | null; audience: unknown; position: number }[] = [];
    for (const [i, s] of plan.adsets.entries()) {
      await progress(`Creando ${s.label}`);
      const dynamic = s.ads.some((a) => needsDynamicCreative(a.mediaIds.length, { primaryTexts: a.primaryTexts, headlines: a.headlines }));
      const adsetId = await createAdset(token, { accountId, campaignId: metaCampaignId, name: s.name, targeting: buildTargeting(c.launch, s.audience), pixelId: meta.pixel_id!, dailyBudget: s.dailyBudget, currency: c.currency, startTime, dynamic });
      objects.push({ level: "adset", id: adsetId });
      done++;
      const ads: (typeof setRows)[number]["ads"] = [];
      for (const a of s.ads) {
        const mediaList = a.mediaIds.map((id) => uploaded.get(id)!).filter(Boolean);
        const text = { primaryTexts: a.primaryTexts, headlines: a.headlines, description: c.launch.description, link, cta: c.launch.cta };
        const payload =
          mediaList.length === 1 && a.primaryTexts.length === 1 && a.headlines.length === 1
            ? singleCreative(a.name, meta.page_id!, mediaList[0], { primaryText: a.primaryTexts[0], headline: a.headlines[0], description: c.launch.description, link, cta: c.launch.cta })
            : dynamicCreative(a.name, meta.page_id!, mediaList, text);
        const creativeId = await createCreative(token, accountId, payload);
        objects.push({ level: "creative", id: creativeId });
        done++;
        await progress(`Creando ${s.label}`);
        const adId = await createAd(token, { accountId, adsetId, creativeId, name: a.name });
        objects.push({ level: "ad", id: adId });
        done++;
        ads.push({ name: a.label, meta: adId, creative: creativeId, mediaId: a.mediaIds.length === 1 ? a.mediaIds[0] : null, copy: text });
      }
      setRows.push({ id: "", name: s.label, meta: adsetId, ads, budget: s.dailyBudget, audience: s.audience, position: i });
    }

    // 4. El espejo local.
    for (const s of setRows) {
      const { data: set, error } = await db
        .from("ad_sets")
        .insert({ user_id: c.user_id, campaign_id: c.id, meta_adset_id: s.meta, name: s.name, position: s.position, audience: s.audience, daily_budget: s.budget, status: "PAUSED" })
        .select("id")
        .single();
      fail("Guardar el conjunto", error);
      fail(
        "Guardar los anuncios",
        (await db.from("ads").insert(s.ads.map((a) => ({ user_id: c.user_id, campaign_id: c.id, adset_id: set!.id, meta_ad_id: a.meta, meta_creative_id: a.creative, name: a.name, media_id: a.mediaId, copy: a.copy, status: "PAUSED" })))).error,
      );
    }
    const at = now();
    await update(campaignId, { status: "paused", meta_campaign_id: metaCampaignId, meta_objects: objects, progress: null, error: null, launched_at: at, starts_at: startTime, daily_budget: plan.campaignBudget });
    fail("Anotar la creación", (await db.from("ad_changes").insert({ user_id: c.user_id, campaign_id: c.id, level: "campaign", unit_id: c.id, action: "create", after: { meta_campaign_id: metaCampaignId, adsets: setRows.length }, actor: "merchant" })).error);
  } catch (e) {
    console.error("[ads-launch]", campaignId, step, e);
    if (e instanceof MetaAuthError) await markMetaError(c.user_id, "expired").catch(() => {});
    const left = token ? await rollback(token, objects) : objects;
    // Lo local que alcanzó a guardarse también se va: la campaña vuelve a ser borrador. Un video que
    // quedó a medio procesar vuelve a estar listo (el archivo sigue en Storage; se sube de nuevo).
    await db.from("ad_sets").delete().eq("campaign_id", campaignId);
    await db.from("ad_media").update({ status: "ready", meta_video_id: null, thumbnail_hash: null }).eq("product_id", c.product_id).eq("status", "processing");
    const reason = `${step}: ${metaReason(e)}`;
    await update(campaignId, {
      status: "draft",
      meta_campaign_id: null,
      meta_objects: left,
      progress: null,
      error: left.length ? `${reason} No pudimos borrar todo lo creado: revisa la campaña «${c.name}» en Ads Manager.` : reason,
    });
  }
}

/** Lanzamientos interrumpidos (el proceso murió): se revierten y el borrador vuelve con el motivo. */
export async function expireStaleLaunches(userId: string): Promise<void> {
  const db = adminClient();
  const { data } = await db
    .from("ad_campaigns")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "launching")
    .lt("updated_at", new Date(Date.now() - LAUNCH_STALE_MS).toISOString());
  for (const c of (data ?? []) as CampaignRow[]) {
    const token = await metaToken(userId);
    const left = token ? await rollback(token, c.meta_objects ?? []) : (c.meta_objects ?? []);
    await db.from("ad_sets").delete().eq("campaign_id", c.id);
    await update(c.id, {
      status: "draft",
      meta_campaign_id: null,
      meta_objects: left,
      progress: null,
      error: left.length ? `El lanzamiento se interrumpió. Revisa la campaña «${c.name}» en Ads Manager.` : "El lanzamiento se interrumpió y borramos lo que alcanzó a crearse. Toca Revisar y lanzar otra vez.",
    });
  }
}

/**
 * «Publicar»: activa campaña → conjuntos → anuncios. Desde aquí gasta dinero. Si algo falla a mitad,
 * lo que quedó en pausa se puede reintentar (se vuelve a pedir ACTIVE a todo).
 *
 * `startNow`: antes de activar, el inicio de cada conjunto pasa a ahora (Meta retiene la entrega hasta
 * el `start_time` aunque todo esté activo). Si Meta no acepta el cambio, no se activa nada: activar
 * igual dejaría la campaña «publicada» pero muda hasta la fecha original. También sirve con la campaña
 * ya publicada que espera su hora.
 */
export async function publishCampaign(userId: string, campaignId: string, opts: { startNow?: boolean } = {}): Promise<CampaignRow> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c) throw new ProductApiError("No encontramos esa campaña.", 404);
  if (!c.meta_campaign_id || !["paused", "active"].includes(c.status)) throw new ProductApiError("Esta campaña todavía no está creada en Meta.", 409);
  const token = await metaToken(userId);
  if (!token) throw new ProductApiError("Tu conexión con Meta venció. Vuelve a conectarla en Ajustes.", 409);
  const db = adminClient();
  const [{ data: sets }, { data: ads }] = await Promise.all([db.from("ad_sets").select("id, meta_adset_id").eq("campaign_id", c.id), db.from("ads").select("id, meta_ad_id").eq("campaign_id", c.id)]);
  const at = now();
  // Solo si el inicio sigue en el futuro: uno ya pasado no se puede mover y tampoco hace falta.
  const moveStart = Boolean(opts.startNow && c.starts_at && Date.parse(c.starts_at) > Date.now());
  if (moveStart) {
    try {
      for (const s of sets ?? []) if (s.meta_adset_id) await setStartTime(token, s.meta_adset_id as string, at);
    } catch (e) {
      if (e instanceof MetaAuthError) await markMetaError(userId, "expired").catch(() => {});
      throw new ProductApiError(`No pudimos adelantar el inicio: ${metaReason(e)} La campaña sigue en pausa; puedes publicarla a su hora.`, 502);
    }
    await update(c.id, { starts_at: at });
  }
  try {
    await setStatus(token, c.meta_campaign_id, "ACTIVE");
    for (const s of sets ?? []) if (s.meta_adset_id) await setStatus(token, s.meta_adset_id as string, "ACTIVE");
    for (const a of ads ?? []) if (a.meta_ad_id) await setStatus(token, a.meta_ad_id as string, "ACTIVE");
  } catch (e) {
    if (e instanceof MetaAuthError) await markMetaError(userId, "expired").catch(() => {});
    throw new ProductApiError(`No se pudo activar todo: ${metaReason(e)} Lo que quedó en pausa se activa al tocar Publicar otra vez.`, 502);
  }
  await db.from("ad_sets").update({ status: "ACTIVE", updated_at: at }).eq("campaign_id", c.id);
  await db.from("ads").update({ status: "ACTIVE", updated_at: at }).eq("campaign_id", c.id);
  await update(c.id, { status: "active", published_at: c.published_at ?? at });
  await db.from("ad_changes").insert({
    user_id: userId,
    campaign_id: c.id,
    level: "campaign",
    unit_id: c.id,
    action: "publish",
    before: { status: c.status, starts_at: c.starts_at },
    after: { status: "active", starts_at: moveStart ? at : c.starts_at },
    actor: "merchant",
  });
  return (await getCampaignRow(userId, campaignId))!;
}

/** Las filas de una campaña que dependen de lo creado en Meta (métricas, decisiones, historial). */
const LAUNCH_TABLES = ["ad_sets", "ad_changes", "ad_decisions", "ad_insights_daily", "ad_insights_snapshots"] as const;

/**
 * «Rehacer»: una campaña que NUNCA entregó vuelve a ser borrador. Se borra en Meta (la campaña arrastra
 * sus conjuntos y anuncios) y la misma fila vuelve a `draft` con su configuración, para editar
 * cualquier cosa y lanzar otra vez (con la URL y el inicio de ese momento). Sin entrega no hay
 * aprendizaje, interacciones ni métricas que perder. Lo que decide es Meta (impresiones de toda la
 * vida), no nuestras lecturas, que pueden tener una hora de atraso.
 */
export async function redoCampaign(userId: string, campaignId: string): Promise<CampaignRow> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c) throw new ProductApiError("No encontramos esa campaña.", 404);
  if (!c.meta_campaign_id || !["paused", "active"].includes(c.status)) throw new ProductApiError("Esta campaña no se puede rehacer.", 409);
  const token = await metaToken(userId);
  if (!token) throw new ProductApiError("Tu conexión con Meta venció. Vuelve a conectarla en Ajustes.", 409);
  let impressions: number;
  try {
    impressions = await lifetimeImpressions(token, c.meta_campaign_id);
  } catch (e) {
    if (e instanceof MetaAuthError) await markMetaError(userId, "expired").catch(() => {});
    throw new ProductApiError(`No pudimos revisar la campaña en Meta: ${metaReason(e)}`, 502);
  }
  if (impressions > 0) throw new ProductApiError("Esta campaña ya empezó a entregar: rehacerla perdería su aprendizaje. Crea una campaña nueva.", 409);

  const db = adminClient();
  // El borrador que haya quedado abierto para el producto (el configurador guarda solo) cede su lugar:
  // solo puede haber uno, y el que se rehace es el que el comerciante eligió.
  let open = db.from("ad_campaigns").select("id, status").eq("user_id", userId).eq("product_id", c.product_id).in("status", ["draft", "launching"]);
  open = c.source_campaign_id ? open.eq("source_campaign_id", c.source_campaign_id) : open.is("source_campaign_id", null);
  const { data: other } = await open.maybeSingle();
  if (other?.status === "launching") throw new ProductApiError("Hay otra campaña de este producto creándose en Meta. Espera a que termine.", 409);
  if (other) fail("Descartar el borrador abierto", (await db.from("ad_campaigns").delete().eq("id", other.id)).error);

  // Una sola vez: pasa a `launching` solo si sigue como la leímos (ni publicada ni rehecha entremedio).
  // Si el proceso muere aquí, expireStaleLaunches borra lo de meta_objects y la deja en borrador.
  const { data: locked, error } = await db
    .from("ad_campaigns")
    .update({ status: "launching", progress: { step: "Borrando la campaña en Meta", done: 0, total: 1 }, meta_objects: [{ level: "campaign", id: c.meta_campaign_id }], updated_at: now() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id")
    .maybeSingle();
  fail("Empezar a rehacer", error);
  if (!locked) throw new ProductApiError("La campaña cambió mientras tanto. Recarga la página.", 409);

  try {
    await setStatus(token, c.meta_campaign_id, "DELETED");
  } catch (e) {
    if (e instanceof MetaAuthError) await markMetaError(userId, "expired").catch(() => {});
    await update(c.id, { status: c.status, progress: null, meta_objects: c.meta_objects });
    throw new ProductApiError(`No pudimos borrar la campaña en Meta: ${metaReason(e)} Sigue igual que antes.`, 502);
  }
  for (const t of LAUNCH_TABLES) fail("Limpiar la campaña", (await db.from(t).delete().eq("campaign_id", c.id)).error);
  await update(c.id, {
    status: "draft",
    meta_campaign_id: null,
    meta_objects: [],
    progress: null,
    error: null,
    launched_at: null,
    starts_at: null,
    published_at: null,
    last_delivery_at: null,
    last_changed_at: null,
    last_synced_at: null,
    sync_error: null,
  });
  return (await getCampaignRow(userId, campaignId))!;
}

/** Lo que entra en la copia de una campaña: su configuración completa, tal como se lanzó. */
const COPY_FIELDS = ["name", "structure", "template_key", "template_id", "launch", "engine", "daily_budget", "currency", "timezone", "ad_account_id", "angles_stamp", "source_campaign_id"] as const;

/**
 * «Recrear»: un borrador nuevo con la configuración exacta de una campaña ya creada (estructura,
 * plantilla, creativos, públicos, presupuesto, horario, textos y reglas del motor), para cambiar lo que
 * haga falta y lanzarla otra vez. La campaña original no se toca, ni aquí ni en Meta. El borrador abierto
 * del producto cede su lugar (solo puede haber uno; la pantalla pide un segundo toque). Los creativos que
 * ya no existen quedan fuera.
 */
export async function recreateCampaign(userId: string, campaignId: string): Promise<CampaignRow> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c || !["paused", "active", "archived"].includes(c.status)) throw new ProductApiError("No encontramos esa campaña.", 404);
  const db = adminClient();
  // El borrador abierto que ocupa su lugar (el de testeo o, en una CBO de ganadores, el de su origen).
  const open = await getDraft(userId, c.product_id, c.source_campaign_id);
  if (open?.status === "launching") throw new ProductApiError("Hay otra campaña de este producto creándose en Meta. Espera a que termine.", 409);
  if (open) fail("Descartar el borrador abierto", (await db.from("ad_campaigns").delete().eq("id", open.id)).error);

  const media = new Set((await listMediaRows(userId, c.product_id)).map((m) => m.id));
  const copy = Object.fromEntries(COPY_FIELDS.map((k) => [k, c[k]]));
  const { data, error } = await db
    .from("ad_campaigns")
    .insert({ ...copy, user_id: userId, product_id: c.product_id, launch: { ...c.launch, creatives: c.launch.creatives.filter((id) => media.has(id)) }, status: "draft" })
    .select("*")
    .single();
  if (error?.code === "23505") throw new ProductApiError("Se abrió otro borrador de este producto mientras tanto. Recarga la página.", 409);
  fail("Recrear la campaña", error);
  return data as CampaignRow;
}

/**
 * «Eliminar»: la campaña sale de DropFlex con todo lo suyo (conjuntos, anuncios, métricas, decisiones y
 * cambios). En Meta se PAUSA, no se borra: el historial queda en Ads Manager y nada sigue gastando sin que
 * DropFlex lo vea. Si ya no existe en Meta (se borró en Ads Manager), se elimina igual. Si Meta no deja
 * pausarla, no se elimina nada. Los creativos son del producto y se quedan.
 */
export async function deleteCampaign(userId: string, campaignId: string): Promise<{ productId: string }> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c) throw new ProductApiError("No encontramos esa campaña.", 404);
  if (c.status === "launching") throw new ProductApiError("La campaña se está creando en Meta. Espera a que termine.", 409);
  const db = adminClient();
  // Un borrador de ganadores de esta campaña no puede quedar suelto: pasaría a competir con el de testeo.
  const { data: drafts, error: draftsError } = await db.from("ad_campaigns").select("id, status").eq("user_id", userId).eq("source_campaign_id", c.id).in("status", ["draft", "launching"]);
  fail("Leer los borradores", draftsError);
  if (drafts?.some((d) => d.status === "launching")) throw new ProductApiError("La CBO de ganadores de esta campaña se está creando en Meta. Espera a que termine.", 409);

  if (c.meta_campaign_id && ["paused", "active"].includes(c.status)) {
    const token = await metaToken(userId);
    if (!token) throw new ProductApiError("Tu conexión con Meta venció. Vuelve a conectarla en Ajustes para pausar la campaña antes de eliminarla.", 409);
    try {
      await setStatus(token, c.meta_campaign_id, "PAUSED");
    } catch (e) {
      // Ya borrada en Ads Manager (código 100: el objeto no existe): no hay nada que pausar.
      if (!(e instanceof MetaApiError && e.code === 100)) {
        if (e instanceof MetaAuthError) await markMetaError(userId, "expired").catch(() => {});
        throw new ProductApiError(`No pudimos pausarla en Meta: ${metaReason(e)} No eliminamos nada.`, 502);
      }
    }
  }
  if (drafts?.length) fail("Descartar la CBO de ganadores", (await db.from("ad_campaigns").delete().in("id", drafts.map((d) => d.id))).error);
  fail("Eliminar la campaña", (await db.from("ad_campaigns").delete().eq("id", c.id).eq("user_id", userId)).error);
  return { productId: c.product_id };
}
