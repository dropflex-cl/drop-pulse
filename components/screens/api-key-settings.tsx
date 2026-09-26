"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ConnectionCard, Field, notify } from "@/components/df";
import { ProductApiClientError, apiKeyApi, type ApiKeyProvider } from "@/lib/products/client";

// Ajustes › Anuncios con IA: la clave propia del comerciante para cada proveedor de imágenes
// (docs/spec-creativos.md §6.3). Higgsfield y Gemini usan el mismo mecanismo: se valida contra el
// proveedor al guardar, vive en Vault y nunca vuelve al navegador.

const COPY: Record<ApiKeyProvider, { name: string; consoleUrl: string; consoleLabel: string; where: string; connected: string; empty: string; invalid: string }> = {
  higgsfield: {
    name: "Higgsfield",
    consoleUrl: "https://console.higgsfield.ai",
    consoleLabel: "Abrir la consola",
    where: "La encuentras en tu consola de Higgsfield, en API keys.",
    connected: "Generas con tu cuenta y tus créditos de Higgsfield. Cada imagen cuesta cerca de US$0,10.",
    empty: "Pega la clave de tu cuenta de Higgsfield para generar anuncios de imagen. Cada imagen cuesta cerca de US$0,10 de tus créditos.",
    invalid: "Higgsfield rechazó tu clave. Pega una nueva.",
  },
  gemini: {
    name: "Gemini",
    consoleUrl: "https://aistudio.google.com/apikey",
    consoleLabel: "Abrir Google AI Studio",
    where: "La creas en Google AI Studio, en Get API key. Tu proyecto necesita facturación activa para generar imágenes.",
    connected: "Generas con tu cuenta y tu cuota de Google (Gemini 3 Pro Image). Cada imagen cuesta cerca de US$0,14.",
    empty: "Pega la clave de tu cuenta de Google AI Studio para generar imágenes con Gemini. Cada imagen cuesta cerca de US$0,14 de tu cuenta de Google.",
    invalid: "Google rechazó tu clave de Gemini. Pega una nueva.",
  },
};

export function ApiKeySettings({
  provider,
  keyHint,
  status,
  error: savedError,
}: {
  provider: ApiKeyProvider;
  keyHint: string | null;
  status: "connected" | "invalid" | null;
  error: string | null;
}) {
  const copy = COPY[provider];
  const router = useRouter();
  const [editing, setEditing] = useState(!status);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);
  const [error, setError] = useState<string>();
  const [armed, setArmed] = useState(false);

  async function save() {
    setBusy("save");
    setError(undefined);
    try {
      await apiKeyApi.connect(provider, key);
      setKey("");
      setEditing(false);
      notify(`${copy.name} conectado`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos guardar la clave. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!armed) return setArmed(true);
    setBusy("disconnect");
    try {
      await apiKeyApi.disconnect(provider);
      setArmed(false);
      setEditing(true);
      notify(`${copy.name} desconectado`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : `No pudimos desconectar ${copy.name}.`);
    } finally {
      setBusy(null);
    }
  }

  const state = status === "connected" ? "connected" : status === "invalid" ? "error" : "idle";
  const detail = status === "invalid" ? (savedError ?? copy.invalid) : status === "connected" ? copy.connected : copy.empty;

  return (
    <ConnectionCard
      provider={provider}
      state={state}
      account={keyHint ? `Clave terminada en ${keyHint}` : undefined}
      detail={detail}
      actions={
        editing ? (
          <div className="flex w-full flex-col gap-2">
            <Field
              label={`Clave de ${copy.name}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onValueChange={setKey}
              placeholder={`Pega tu API key de ${copy.name}`}
              hint={copy.where}
              error={error}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="link" loading={busy === "save"} disabled={!key.trim()} onClick={save}>
                {status ? "Guardar clave" : "Conectar"}
              </Button>
              {status ? (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              ) : null}
              <Button variant="ghost" iconEnd="chevron-right" href={copy.consoleUrl} target="_blank" rel="noreferrer">
                {copy.consoleLabel}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button size="sm" onClick={() => setEditing(true)}>
              Cambiar clave
            </Button>
            <Button size="sm" variant={armed ? "destructive" : "ghost"} loading={busy === "disconnect"} onClick={disconnect}>
              {armed ? "Toca otra vez para desconectar" : "Desconectar"}
            </Button>
          </>
        )
      }
    />
  );
}
