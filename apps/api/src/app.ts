import { Hono } from "hono"
import { healthRoute } from "./routes/health.js"
import { webhooksRoute } from "./routes/webhooks.js"
import { ordersWebhooksRoute } from "./routes/orders-webhooks.js"

export function createApp() {
  const app = new Hono()
  app.route("/health", healthRoute)
  app.route("/webhooks", webhooksRoute)
  // Platform order webhooks (JVZoo, Digistore) -> our own orders table.
  app.route("/webhooks", ordersWebhooksRoute)
  return app
}
