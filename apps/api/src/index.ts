import { config as dotenvFlowConfig } from "dotenv-flow"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { serve } from "@hono/node-server"
import { createApp } from "./app.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvFlowConfig({ path: resolve(__dirname, "../../..") })

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
