// Runner con claves del stack local, sin cargar .env ni usar el proyecto enlazado.
import { execFileSync, spawn } from "node:child_process";
const state = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
if (state.API_URL !== "http://127.0.0.1:55321") throw new Error("Solo Supabase local de DropFlex.");
const test = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2), "--fileParallelism=false"], {
  stdio: "inherit", env: { ...process.env, PI_LOCAL_TEST: "1", NEXT_PUBLIC_SUPABASE_URL: state.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: state.ANON_KEY },
});
test.on("exit", code => { process.exitCode = code ?? 1; });
test.on("error", () => { process.exitCode = 1; });
