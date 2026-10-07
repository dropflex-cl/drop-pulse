/** JavaScript del iframe: literal para que el bundler no introduzca dependencias externas. */
export const referenceWidgetScript = String.raw`
function referenceWidget() {
    const host = () => window.openai;
    const image = document.querySelector("#reference");
    const button = document.querySelector("#attach");
    const review = document.querySelector("#review");
    const status = document.querySelector("#status");
    const download = document.querySelector("#download");
    let current, busy = false;
    let attachedState;
    const pending = new Map();
    let sequence = 0;
    function request(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, { resolve, reject });
            window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });
    }
    function render(value) {
        if (!value?.ok) {
            current = undefined;
            button.disabled = true;
            review.hidden = true;
            return;
        }
        const ref = value.data?.canonical_reference;
        if (!ref || typeof ref.url !== "string" || !/^https:\/\//.test(ref.url) || !/^[a-f0-9]{64}$/.test(ref.content_hash)) {
            status.textContent = "No pudimos mostrar la referencia. Recupera el contexto visual y vuelve a intentarlo.";
            button.disabled = true;
            review.hidden = true;
            return;
        }
        current = value;
        image.src = ref.url;
        image.hidden = false;
        download.href = ref.url;
        download.hidden = false;
        document.documentElement.dataset.theme = host()?.theme === "dark" ? "dark" : "light";
        const stored = attachedState ?? host()?.widgetState;
        const content = stored?.modelContent;
        const sameReference = content?.product_id === value.product_id
            && content?.canonical_reference_image_id === ref.id && content?.reference_content_hash === ref.content_hash;
        const fileId = stored?.imageIds?.length === 1 && typeof stored.imageIds[0] === "string" ? stored.imageIds[0] : undefined;
        attachedState = sameReference && content?.reference_attached === true && fileId
            && (!content.reference_file_id || content.reference_file_id === fileId)
            ? { ...stored, modelContent: { ...content, reference_file_id: fileId } } : undefined;
        button.textContent = attachedState ? "Volver a adjuntar referencia" : "Adjuntar referencia al chat";
        review.hidden = !attachedState || !host()?.sendFollowUpMessage;
        review.disabled = busy;
        button.disabled = busy || !host()?.uploadFile || !host()?.setWidgetState;
        if (busy) return;
        status.textContent = attachedState
            ? "Archivo adjunto a ChatGPT. Revisa la referencia en un nuevo turno antes de generar."
            : button.disabled
            ? "Este cliente no permite adjuntar la referencia desde la tarjeta. Abre la original y adjúntala al chat."
            : "Revisa la foto original y adjúntala antes de generar.";
    }
    window.addEventListener("message", event => {
        if (event.source !== window.parent || event.data?.jsonrpc !== "2.0")
            return;
        const message = event.data;
        if (message.id !== undefined && pending.has(message.id)) {
            const task = pending.get(message.id);
            pending.delete(message.id);
            if (message.error)
                task.reject(message.error);
            else
                task.resolve(message.result);
        }
        else if (message.method === "ui/notifications/tool-result")
            render(message.params?.structuredContent);
    });
    window.addEventListener("openai:set_globals", () => render(host()?.toolOutput ?? current));
    button.onclick = async () => {
        const output = current, api = host();
        if (busy || !output || !api?.uploadFile || !api.setWidgetState)
            return;
        busy = true;
        button.disabled = true;
        status.textContent = "Adjuntando la referencia original…";
        try {
            const ref = output.data.canonical_reference;
            const response = await fetch(ref.url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
            if (!response.ok)
                throw new Error("No pudimos descargar la referencia. Recupera el contexto para renovar el enlace.");
            const blob = await response.blob();
            if (blob.size > 15 * 1024 * 1024)
                throw new Error("La referencia supera el tamaño permitido. Adjunta la original manualmente.");
            const bytes = await blob.arrayBuffer();
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
            if (hash !== ref.content_hash)
                throw new Error("La referencia cambió. Recupera el contexto visual antes de adjuntarla.");
            if (!["image/jpeg", "image/png", "image/webp"].includes(ref.mime_type))
                throw new Error("El formato no es compatible. Revisa la referencia en DropFlex.");
            const extension = ref.mime_type.split("/")[1];
            const { fileId } = await api.uploadFile(new File([bytes], "dropflex-" + ref.id + "." + extension, { type: ref.mime_type }));
            if (!fileId || typeof fileId !== "string")
                throw new Error("ChatGPT no confirmó el adjunto. Adjunta la original manualmente.");
            attachedState = { modelContent: { product_id: output.product_id, canonical_reference_image_id: ref.id, reference_content_hash: hash, reference_file_id: fileId, reference_attached: true,
                    instruction: "Referencia original adjunta. Puedes inspeccionarla; no generes hasta que el usuario lo pida. Para generar debes pasar este archivo como entrada real y verificar la identidad del producto." },
                privateContent: {}, imageIds: [fileId] };
            api.setWidgetState(attachedState);
            status.textContent = "Archivo adjunto a ChatGPT. Revisa la referencia en un nuevo turno antes de generar.";
            review.hidden = !api.sendFollowUpMessage;
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "No pudimos adjuntar la referencia. Abre la original y adjúntala al chat.";
        }
        finally {
            busy = false;
            button.disabled = false;
            review.disabled = false;
            button.textContent = attachedState ? "Volver a adjuntar referencia" : "Adjuntar referencia al chat";
        }
    };
    review.onclick = async () => {
        const api = host(), state = attachedState;
        if (busy || !current || !state || !api?.setWidgetState || !api.sendFollowUpMessage) return;
        busy = true;
        review.disabled = true;
        button.disabled = true;
        try {
            api.setWidgetState(state);
            const fileId = state.modelContent.reference_file_id;
            await api.sendFollowUpMessage({ prompt: "Revisa la referencia original adjunta desde la tarjeta de DropFlex (archivo de ChatGPT: " + fileId + "). Describe sus colores, mango, depósito y forma para comprobar que puedes ver sus píxeles. Distingue esa inspección de poder usarla como entrada del generador. No generes imágenes todavía." });
            status.textContent = "Revisión solicitada en el chat. Espera la respuesta antes de generar.";
        } catch {
            status.textContent = "No pudimos solicitar la revisión. Envía en el chat: Revisa la referencia adjunta, sin generar todavía.";
        } finally {
            busy = false;
            review.disabled = false;
            button.disabled = false;
        }
    };
    render(host()?.toolOutput);
    void request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "DropFlex Visual Reference", version: "1.0.0" }, appCapabilities: {} })
        .then(() => window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*"))
        .catch(() => { });
}
referenceWidget();
`;
