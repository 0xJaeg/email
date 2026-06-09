import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// AES-256-GCM at-rest encryption for per-product API credentials. The key is
// derived (sha256) from CREDENTIALS_ENC_KEY so any sufficiently-random string
// works as the env value (generate one with e.g. `openssl rand -base64 32`).
// Ciphertext is base64(iv[12] | authTag[16] | ciphertext); the GCM tag makes
// tampering fail closed on decrypt.
function key(): Buffer {
  const secret = process.env.CREDENTIALS_ENC_KEY
  if (!secret) throw new Error("CREDENTIALS_ENC_KEY is not set")
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
