import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(thisFileDir, "..");
const repoRoot = resolve(appRoot, "..", "..");

for (const envPath of [
  resolve(appRoot, ".env.local"),
  resolve(appRoot, ".env"),
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
]) {
  loadEnv({ path: envPath, quiet: true });
}
