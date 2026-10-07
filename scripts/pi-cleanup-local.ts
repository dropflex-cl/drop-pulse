// Comprueba contracción e integridad antes de aplicar la migración en Supabase local.
// El contenedor es fijo; no recibe credenciales ni puede apuntar a producción.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const migration = readFileSync("supabase/migrations/20261118000000_retire_legacy_analysis.sql", "utf8");
const include = String.fromCharCode(92) + "ir ../supabase/migrations/20261118000000_retire_legacy_analysis.sql";
const probe = readFileSync("scripts/pi-cleanup-local.sql", "utf8").replace(include, migration);
execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: probe, stdio: ["pipe", "inherit", "inherit"] });
