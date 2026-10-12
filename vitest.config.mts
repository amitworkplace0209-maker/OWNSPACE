import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Loads `.env.local` into `process.env` for tests, without overwriting anything
 * already set.
 *
 * Vite does not read Next's `.env.local`, so a test that needs real credentials
 * (the push transport's VAPID pair) would otherwise see them as absent and skip
 * itself — which looks like a pass while proving nothing.
 */
function loadEnvFile() {
  try {
    const file = fileURLToPath(new URL("./.env.local", import.meta.url));
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {
    // No .env.local — the credential-dependent tests skip themselves.
  }
}

loadEnvFile();

/**
 * `server-only` throws on import unless the `react-server` export condition is
 * resolved. Any test touching a `server-only` module — the push transport is the
 * first — would fail at *import* time rather than on an assertion.
 *
 * Setting `resolve.conditions` is not enough: the package lives in
 * `node_modules`, so vitest externalises it and Node resolves it with its own
 * default conditions. Aliasing it to the package's own `empty.js` — which is
 * exactly what the `react-server` condition points at — is the reliable fix.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});