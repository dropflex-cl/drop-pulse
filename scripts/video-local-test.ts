import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

async function main() {
  // Las claves locales pasan solo al proceso hijo; nunca se imprimen ni se escriben a disco.
  const { stdout } = await promisify(execFile)("supabase", ["status", "-o", "json"]);
  const state = JSON.parse(stdout);
  if (state.API_URL !== "http://127.0.0.1:55321") throw new Error("Esta prueba solo permite Supabase local de DropFlex.");
  const test = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "lib/product-intelligence/ugc.local.test.ts", ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, PI_LOCAL_TEST: "1", NEXT_PUBLIC_SUPABASE_URL: state.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: state.ANON_KEY },
  });
  test.on("exit", code => { process.exitCode = code ?? 1; });
  test.on("error", () => { process.exitCode = 1; });
}
main().catch(() => { console.error("No pudimos probar el flujo UGC. Inicia Supabase local y aplica sus migraciones."); process.exitCode = 1; });
