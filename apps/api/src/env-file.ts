import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads apps/api/.env into process.env when present. Variables already set win. */
export function loadEnvFile(): void {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
