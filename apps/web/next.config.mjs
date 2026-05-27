import nextEnv from "@next/env"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const { loadEnvConfig } = nextEnv

// apps/web has no .env.local of its own — load the repo-root one so
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY /
// SUPABASE_SECRET_KEY resolve here too (matches the dotenv-flow-from-root
// pattern apps/api and apps/worker use).
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
loadEnvConfig(rootDir)

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
}

export default nextConfig
