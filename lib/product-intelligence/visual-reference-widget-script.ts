/** JavaScript del iframe: literal para que el bundler no introduzca dependencias externas. */
export const referenceWidgetScript = String.raw`
function referenceWidget() {
    const host = () => window.openai;
    const image = document.querySelector("#reference"), button = document.querySelector("#attach");
    const status = document.querySelector("#status"), download = document.querySelector("#download");
    let current, busy = false, attachedState, initialized = false;
    let sequence = 0;
    const pending = new Map();
    function request(method, params, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error("HOST_TIMEOUT")); }, timeout);
            pending.set(id, { resolve, reject, timer });
            window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });
    }
    async function bounded(promise, timeout = 30000) {
        let timer;
        try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("HOST_TIMEOUT")), timeout); })]); }
        finally { clearTimeout(timer); }
    }
    async function call(name, args, timeout = 15000) {
        const result = host()?.callTool ? await bounded(host().callTool(name, args), timeout)
            : await request("tools/call", { name, arguments: args }, timeout);
        return result?.structuredContent ?? result;
    }
    function matches(state, output) {
        const ref = output?.data?.canonical_reference, content = state?.modelContent;
        return ref && content?.product_id === output.product_id && content.canonical_reference_image_id === ref.id
            && content.reference_content_hash === ref.content_hash && content.reference_attached === true
            && state.imageIds?.length === 1 && typeof state.imageIds[0] === "string"
            && (!content.reference_file_id || content.reference_file_id === state.imageIds[0]);
    }
    function render(value) {
        if (!value?.ok) { current = undefined; attachedState = undefined; button.disabled = true; image.hidden = true; download.hidden = true; return; }
        const ref = value.data?.canonical_reference;
        if (!ref || typeof ref.url !== "string" || !/^https:\/\//.test(ref.url) || !/^[a-f0-9]{64}$/.test(ref.content_hash)) {
            current = undefined; button.disabled = true;
            status.textContent = "No pudimos mostrar la referencia. Recupera el contexto visual y vuelve a intentarlo.";
            return;
        }
        // Un evento de globals puede traer la URL anterior después de renovarla.
        if (current?.product_id === value.product_id && current?.data?.canonical_reference?.id === ref.id && current.data.canonical_reference.content_hash === ref.content_hash
            && (Date.parse(current.data.canonical_reference.expires_at) || 0) > (Date.parse(ref.expires_at) || 0)) value = current;
        current = value;
        image.src = value.data.canonical_reference.url; image.hidden = false;
        download.href = image.src; download.hidden = false;
        document.documentElement.dataset.theme = host()?.theme === "dark" ? "dark" : "light";
        const stored = attachedState ?? host()?.widgetState;
        attachedState = matches(stored, value) ? { ...stored, modelContent: { ...stored.modelContent, reference_file_id: stored.imageIds[0] } } : undefined;
        button.textContent = attachedState ? "Continuar con la referencia" : "Usar referencia y continuar";
        button.disabled = busy || !host()?.uploadFile || !host()?.setWidgetState;
        if (busy) return;
        status.textContent = attachedState ? "Archivo subido a ChatGPT. Falta comprobar que el generador pueda usarlo."
            : button.disabled ? "Este cliente no permite adjuntar la referencia desde la tarjeta. Abre la original y adjúntala al chat."
            : "Usa la foto original para continuar con tu pedido.";
    }
    window.addEventListener("message", event => {
        if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return;
        const message = event.data;
        if (message.id !== undefined && pending.has(message.id)) {
            const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
            if (message.error) task.reject(new Error("HOST_TOOL_ERROR")); else task.resolve(message.result);
        } else if (message.method === "ui/notifications/tool-result" && message.params?.structuredContent?.data?.canonical_reference)
            render(message.params.structuredContent);
    });
    window.addEventListener("openai:set_globals", () => {
        const output = host()?.toolOutput;
        render(output?.data?.canonical_reference ? output : current);
    });
    button.onclick = async () => {
        if (busy || !current || !host()?.uploadFile || !host()?.setWidgetState) return;
        const api = host(), original = current, attempt = crypto.randomUUID();
        const unchanged = () => current?.product_id === original.product_id
            && current?.data?.canonical_reference?.id === original.data.canonical_reference.id
            && current?.data?.canonical_reference?.content_hash === original.data.canonical_reference.content_hash;
        let stage = "reference_download", started = Date.now();
        const log = (state, error_code) => {
            if (!api.callTool && !initialized) return;
            const event = { event_id: crypto.randomUUID(), attempt_id: attempt, stage, state, duration_ms: Math.min(Date.now() - started, 300000),
                reference_image_id: original.data.canonical_reference.id, reference_content_hash: original.data.canonical_reference.content_hash };
            if (error_code) event.error_code = error_code;
            // Diagnóstico best effort; no retrasa ni cambia el resultado del adjunto.
            void call("record_visual_transfer_event", { product_id: original.product_id, event }, 3000).catch(() => {});
        };
        busy = true; button.disabled = true;
        status.textContent = "Recuperando la referencia vigente…";
        try {
            log("started");
            if (api.callTool || initialized) {
                const renewed = await call("get_visual_reference_image", { product_id: original.product_id,
                    reference_image_id: original.data.canonical_reference.id, reference_content_hash: original.data.canonical_reference.content_hash });
                if (!renewed?.ok) throw new Error(renewed?.error?.code === "INVALID_REFERENCE" ? "REFERENCE_CHANGED" : "REFERENCE_REFRESH_FAILED");
                const ref = renewed.data?.canonical_reference;
                if (renewed.product_id !== original.product_id || ref?.id !== original.data.canonical_reference.id || ref?.content_hash !== original.data.canonical_reference.content_hash)
                    throw new Error("REFERENCE_CHANGED");
                if (!unchanged()) throw new Error("REFERENCE_CHANGED");
                render(renewed);
            } else if (Date.parse(original.data.canonical_reference.expires_at) <= Date.now()) throw new Error("REFERENCE_EXPIRED");
            const ref = current.data.canonical_reference;
            if (!attachedState) {
                const response = await fetch(ref.url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
                if (!response.ok) throw new Error("REFERENCE_DOWNLOAD_FAILED");
                const blob = await response.blob();
                if (blob.size > 15 * 1024 * 1024) throw new Error("REFERENCE_TOO_LARGE");
                const bytes = await blob.arrayBuffer();
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), v => v.toString(16).padStart(2, "0")).join("");
                if (!unchanged()) throw new Error("REFERENCE_CHANGED");
                if (hash !== ref.content_hash) throw new Error("REFERENCE_CHANGED");
                if (!["image/jpeg", "image/png", "image/webp"].includes(ref.mime_type)) throw new Error("REFERENCE_FORMAT_INVALID");
                log("succeeded"); stage = "host_upload"; started = Date.now(); log("started");
                status.textContent = "Adjuntando la referencia original…";
                const { fileId } = await bounded(api.uploadFile(new File([bytes], "dropflex-" + ref.id + "." + ref.mime_type.split("/")[1], { type: ref.mime_type })));
                if (!unchanged()) throw new Error("REFERENCE_CHANGED");
                if (!fileId || typeof fileId !== "string") throw new Error("HOST_FILE_UNCONFIRMED");
                attachedState = { modelContent: { product_id: original.product_id, canonical_reference_image_id: ref.id, reference_content_hash: hash,
                    reference_file_id: fileId, reference_attached: true, reference_stage: "host_uploaded",
                    instruction: "Archivo original subido al host. Inspeccionar sus píxeles no demuestra que el generador lo recibió. Respeta el último pedido y la autorización del usuario." },
                    privateContent: {}, imageIds: [fileId] };
                api.setWidgetState(attachedState); log("succeeded");
            } else log("succeeded");
            if (!unchanged()) throw new Error("REFERENCE_CHANGED");
            stage = "followup"; started = Date.now();
            if (!api.sendFollowUpMessage) {
                status.textContent = "Archivo subido. Envía en el chat: Revisa la referencia adjunta y continúa con mi pedido.";
                log("failed", "FOLLOWUP_UNAVAILABLE"); return;
            }
            log("started"); api.setWidgetState(attachedState);
            await bounded(api.sendFollowUpMessage({ prompt: "Inspecciona la referencia original adjunta de DropFlex (archivo de ChatGPT: " + attachedState.modelContent.reference_file_id
                + "). Comprueba colores, forma, mango y depósito; después continúa con el último pedido del usuario, respetando sus límites y aprobaciones. Si pidió no generar, conserva ese límite. Si autorizó generar, recupera un plan e identidad aprobados y vigentes, y pasa este archivo como entrada real del generador. Si no puedes hacerlo, detente y explica la limitación. Para guardar el resultado usa ingest_chatgpt_visual_asset y confirma succeeded con get_visual_ingestion_status antes de decir que está guardado." }));
            log("succeeded"); status.textContent = "Referencia enviada al chat. Continúa con tu pedido respetando la revisión y aprobación.";
        } catch (error) {
            const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "HOST_TRANSFER_FAILED";
            log("failed", code);
            const messages = { REFERENCE_CHANGED: "La referencia cambió. Recupera el contexto visual antes de adjuntarla.",
                REFERENCE_EXPIRED: "El enlace venció. Recupera la referencia en el chat para renovarlo.",
                REFERENCE_REFRESH_FAILED: "No pudimos renovar la referencia. Recupera el contexto visual y vuelve a intentarlo.",
                REFERENCE_DOWNLOAD_FAILED: "No pudimos descargar la referencia. Recupera el contexto para renovar el enlace.",
                REFERENCE_TOO_LARGE: "La referencia supera el tamaño permitido. Adjunta la original manualmente.",
                REFERENCE_FORMAT_INVALID: "El formato no es compatible. Revisa la referencia en DropFlex.",
                HOST_FILE_UNCONFIRMED: "ChatGPT no confirmó el adjunto. Adjunta la original manualmente." };
            status.textContent = messages[code] ?? (attachedState ? "El archivo está subido. Toca Continuar con la referencia para reintentar el mensaje."
                : "No pudimos adjuntar la referencia. Abre la original y adjúntala al chat.");
        } finally {
            busy = false; button.disabled = !host()?.uploadFile || !host()?.setWidgetState || !current;
            button.textContent = attachedState ? "Continuar con la referencia" : "Usar referencia y continuar";
        }
    };
    render(host()?.toolOutput);
    void request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "DropFlex Visual Reference", version: "2.0.0" }, appCapabilities: {} })
        .then(() => { initialized = true; window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*"); })
        .catch(() => {});
}
referenceWidget();
`;
