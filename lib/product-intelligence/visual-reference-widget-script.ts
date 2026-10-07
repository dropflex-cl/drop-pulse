/** JavaScript del iframe: literal para que el bundler no introduzca dependencias externas. */
export const referenceWidgetScript = String.raw`
function referenceWidget() {
    const host = () => window.openai;
    const image = document.querySelector("#reference");
    const button = document.querySelector("#attach");
    const status = document.querySelector("#status");
    const download = document.querySelector("#download");
    let current, busy = false;
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
            return;
        }
        const ref = value.data?.canonical_reference;
        if (!ref || typeof ref.url !== "string" || !/^https:\/\//.test(ref.url) || !/^[a-f0-9]{64}$/.test(ref.content_hash)) {
            status.textContent = "No pudimos mostrar la referencia. Recupera el contexto visual y vuelve a intentarlo.";
            button.disabled = true;
            return;
        }
        current = value;
        image.src = ref.url;
        image.hidden = false;
        download.href = ref.url;
        download.hidden = false;
        document.documentElement.dataset.theme = host()?.theme === "dark" ? "dark" : "light";
        button.disabled = busy || !host()?.uploadFile || !host()?.setWidgetState;
        status.textContent = button.disabled && !busy
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
            api.setWidgetState({ modelContent: { product_id: output.product_id, canonical_reference_image_id: ref.id, reference_content_hash: hash, reference_attached: true,
                    instruction: "Referencia original adjunta. Puedes inspeccionarla; no generes hasta que el usuario lo pida. Para generar debes pasar este archivo como entrada real y verificar la identidad del producto." },
                privateContent: {}, imageIds: [fileId] });
            status.textContent = "Referencia adjunta al chat. Puedes pedir que la revise antes de generar.";
            button.textContent = "Volver a adjuntar referencia";
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "No pudimos adjuntar la referencia. Abre la original y adjúntala al chat.";
        }
        finally {
            busy = false;
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
