import type { ProductAdapter } from "./types.js"
import { MockAdapter } from "./adapters/mock.js"
import { ClickbankAdapter } from "./adapters/clickbank.js"
import { JvzooAdapter } from "./adapters/jvzoo.js"
import { DigistoreAdapter } from "./adapters/digistore.js"

const ADAPTERS: Record<string, ProductAdapter> = {
  mock: MockAdapter,
  clickbank: ClickbankAdapter,
  jvzoo: JvzooAdapter,
  digistore: DigistoreAdapter,
}

// Resolves a product's adapter_key to its integration. Throws on an unknown key
// so a misconfigured product fails loudly rather than silently no-op'ing.
export function getAdapter(key: string): ProductAdapter {
  const adapter = ADAPTERS[key]
  if (!adapter) throw new Error(`unknown_adapter: ${key}`)
  return adapter
}
