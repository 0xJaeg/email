import { describe, it, expect, beforeEach } from "vitest"
import { encryptSecret, decryptSecret } from "../crypto.js"

describe("crypto (AES-256-GCM secret storage)", () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENC_KEY = "test-only-encryption-key"
  })

  it("round-trips a secret without storing it in cleartext", () => {
    const secret = "sk_live_abc123XYZ"
    const cipher = encryptSecret(secret)
    expect(cipher).not.toContain(secret)
    expect(decryptSecret(cipher)).toBe(secret)
  })

  it("produces different ciphertext each call (random IV)", () => {
    expect(encryptSecret("same-secret")).not.toBe(encryptSecret("same-secret"))
  })

  it("rejects tampered ciphertext (auth tag fails)", () => {
    const buf = Buffer.from(encryptSecret("secret"), "base64")
    buf[20] = buf[20]! ^ 0x01 // flip a byte in the ciphertext region
    expect(() => decryptSecret(buf.toString("base64"))).toThrow()
  })

  it("throws when CREDENTIALS_ENC_KEY is not set", () => {
    delete process.env.CREDENTIALS_ENC_KEY
    expect(() => encryptSecret("x")).toThrow(/CREDENTIALS_ENC_KEY/)
  })
})
