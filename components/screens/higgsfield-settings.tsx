"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ConnectionCard, Field, notify } from "@/components/df";
import { ProductApiClientError, higgsfieldApi } from "@/lib/products/client";

// Ajustes › Conexiones › Higgsfield (docs/spec-creativos.md §6.3): cada comerciante usa su propia
// clave y sus créditos. Se valida contra Higgsfield al guardar; la clave nunca vuelve al navegador.

const CONSOLE_URL = "https://console.higgsfield.ai";

export function HiggsfieldSettings({ keyHint, status, error: savedError }: { keyHint: string | null; status: "connected" | "invalid" | null; error: string | null }) {
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
      await higgsfieldApi.connect(key);
      setKey("");
      setEditing(false);
      notify("Higgsfield conectado");
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
      await higgsfieldApi.disconnect();
      setArmed(false);
      setEditing(true);
      notify("Higgsfield desconectado");
      router.refresh();
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos desconectar Higgsfield.");
    } finally {
      setBusy(null);
    }
  }

  const state = status === "connected" ? "connected" : status === "invalid" ? "error" : "idle";
  const detail =
    status === "invalid"
      ? (savedError ?? "Higgsfield rechazó tu clave. Pega una nueva.")
      : status === "connected"
        ? "Generas con tu cuenta y tus créditos de Higgsfield. Cada imagen cuesta cerca de US$0,10."
        : "Pega la clave de tu cuenta de Higgsfield para generar anuncios de imagen. Cada imagen cuesta cerca de US$0,10 de tus créditos.";

  return (
    <ConnectionCard
      provider="higgsfield"
      state={state}
      account={keyHint ? `Clave terminada en ${keyHint}` : undefined}
      detail={detail}
      actions={
        editing ? (
          <div className="flex w-full flex-col gap-2">
            <Field
              label="Clave de Higgsfield"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onValueChange={setKey}
              placeholder="KEY_ID:KEY_SECRET"
              hint="La encuentras en tu consola de Higgsfield, en API keys."
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
              <Button variant="ghost" iconEnd="chevron-right" href={CONSOLE_URL} target="_blank" rel="noreferrer">
                Abrir la consola
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
