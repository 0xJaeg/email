import { Hono } from "hono"
import { healthRoute } from "./routes/health.js"
import { webhooksRoute } from "./routes/webhooks.js"

export function createApp() {
  const app = new Hono()
  app.route("/health", healthRoute)
  app.route("/webhooks", webhooksRoute)
  return app
}
