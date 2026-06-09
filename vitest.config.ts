import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve apps/web's "@/..." tsconfig path alias so web lib code that imports
// via "@/" can be unit-tested. Scoped to a leading "@/" so it never shadows
// "@workspace/*" package imports.
const webDir = fileURLToPath(new URL("./apps/web", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${webDir}/` }],
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
})
