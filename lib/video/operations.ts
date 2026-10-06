import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { processShots, syncVideos } from "@/lib/pipeline/video";
/** El cron recupera after() interrumpidos. Nunca se despierta desde get_generation_status. */
export async function runUgcOperation(id: string) {
  const db = adminClient();
  const { data: op, error } = await db.from("pi_ugc_operations").select("id,user_id,product_id,status").eq("id", id).maybeSingle();
  if (error || !op || ["cancelled", "failed", "succeeded"].includes(op.status)) return;
  // Un submit cuyo proceso murió se concilia; no se considera seguro repetirlo.
  await db.from("video_shots").update({ render_status: "failed", error_code: "dispatch_unknown", error_message: "El envío se interrumpió sin confirmación. Revisa Higgsfield antes de repetirlo.", updated_at: new Date().toISOString() })
    .eq("operation_id", id).eq("render_status", "queued").eq("error_code", "dispatching").lt("updated_at", new Date(Date.now()-10*60*1000).toISOString());
  const { data: queued } = await db.from("video_shots").select("id").eq("operation_id", id).eq("render_status", "queued").is("superseded_at", null).neq("error_code", "dispatching");
  // PostgREST neq excludes NULL: select the regular queue separately.
  const { data: ready } = await db.from("video_shots").select("id").eq("operation_id", id).eq("render_status", "queued").is("superseded_at", null).is("error_code", null);
  await processShots([...(queued ?? []), ...(ready ?? [])].map((s) => s.id));
  await syncVideos(op.user_id, op.product_id);
  const { data: all } = await db.from("video_shots").select("render_status,error_code,superseded_at").eq("operation_id", id);
  if (!all?.length) return;
  const active = all.filter((s) => !s.superseded_at);
  const status = active.some((s) => s.render_status === "queued" || s.render_status === "running") ? "running" : active.some((s) => s.error_code === "dispatch_unknown") ? "reconciling" : active.some((s) => s.render_status === "failed") ? "failed" : "succeeded";
  await db.from("pi_ugc_operations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).neq("status", "cancelled");
}
export async function resumeUgcOperations() {
  const { data, error } = await adminClient().from("pi_ugc_operations").select("id").in("status", ["queued", "running"]).order("updated_at").limit(8);
  if (error) throw new Error(error.message);
  await Promise.all((data ?? []).map((o) => runUgcOperation(o.id)));
  return { resumed: data?.length ?? 0 };
}
