import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { processImages, syncPageImages } from "@/lib/pipeline/page-images";

/** Recupera after() interrumpidos; el claim SQL impide reenviar un pedido ambiguo. */
export async function runGalleryOperation(id: string) {
  const db = adminClient();
  const { data: op, error } = await db.from("pi_gallery_operations").select("id,user_id,product_id,status").eq("id", id).maybeSingle();
  if (error) throw new Error("No pudimos leer la operación de galería.");
  if (!op || ["cancelled", "succeeded", "failed"].includes(op.status)) return;
  const before = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const lost = await db.from("page_images").update({ render_status: "failed", error_code: "dispatch_unknown", error_message: "El envío se interrumpió sin confirmación. Revisa el proveedor antes de repetirlo.", updated_at: new Date().toISOString() })
    .eq("pi_operation_id", id).eq("render_status", "queued").eq("error_code", "dispatching").lt("updated_at", before);
  if (lost.error) throw new Error("No pudimos conciliar el envío de galería.");
  const synchronous = await db.from("page_images").update({ render_status: "failed", error_code: "dispatch_unknown", error_message: "Gemini no confirmó el resultado. Revisa el proveedor antes de repetirlo.", updated_at: new Date().toISOString() })
    .eq("pi_operation_id", id).eq("render_status", "running").eq("provider", "gemini").is("hf_request_id", null).lt("updated_at", before);
  if (synchronous.error) throw new Error("No pudimos conciliar Gemini.");
  const ambiguous = await db.from("page_images").select("id").eq("pi_operation_id", id).eq("error_code", "dispatch_unknown").limit(1);
  if (ambiguous.error) throw new Error("No pudimos comprobar los envíos ambiguos.");
  if (ambiguous.data?.length) {
    const stopped = await db.from("page_images").update({ render_status: "failed", error_code: "dispatch_halted", error_message: "Otro envío quedó sin confirmar. Revisa el proveedor antes de solicitar más imágenes.", updated_at: new Date().toISOString() })
      .eq("pi_operation_id", id).eq("render_status", "queued").or("error_code.is.null,error_code.eq.busy");
    if (stopped.error) throw new Error("No pudimos detener los envíos pendientes.");
  }
  const { data: rows, error: queueError } = await db.from("page_images").select("id").eq("pi_operation_id", id).eq("render_status", "queued").or("error_code.is.null,error_code.eq.busy");
  if (queueError) throw new Error("No pudimos leer la cola de galería.");
  await processImages((rows ?? []).map(r => r.id));
  await syncPageImages(op.user_id, op.product_id);
  const { data: all, error: progressError } = await db.from("page_images").select("render_status,error_code").eq("pi_operation_id", id);
  if (progressError) throw new Error("No pudimos leer el avance de galería.");
  if (!all?.length) return;
  const status = all.some(r => r.error_code === "dispatch_unknown") ? "reconciling" : all.some(r => ["queued", "running"].includes(r.render_status)) ? "running" : all.some(r => r.render_status === "failed") ? "failed" : "succeeded";
  const update = await db.from("pi_gallery_operations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).neq("status", "cancelled");
  if (update.error) throw new Error("No pudimos guardar el avance de galería.");
}
export async function resumeGalleryOperations() {
  const { data, error } = await adminClient().from("pi_gallery_operations").select("id").in("status", ["queued", "running", "reconciling"]).order("updated_at").limit(8);
  if (error) throw new Error("No pudimos recuperar las operaciones de galería.");
  await Promise.all((data ?? []).map(op => runGalleryOperation(op.id)));
  return { resumed: data?.length ?? 0 };
}
