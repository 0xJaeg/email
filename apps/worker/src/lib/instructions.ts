import { readFileSync, readdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// apps/worker/src/lib → repo root is four levels up
const INSTRUCTIONS_DIR = join(__dirname, "..", "..", "..", "..", "instructions")

const HEADER = `You are an email-support classifier for a ClickBank-listed digital-product business. Read the instructions below carefully. They contain the classification rubric, the refund policy your customers know about, an FAQ skeleton, and a tone-of-voice guide. Your job is to classify exactly one inbound email into one of three labels and return your reasoning. Follow the output format described in the classifier rubric exactly.`

function loadInstructions(): string {
  const files = readdirSync(INSTRUCTIONS_DIR, { recursive: true }) as string[]
  const mdFiles = files
    .filter((f) => typeof f === "string" && f.endsWith(".md"))
    .sort()

  if (mdFiles.length === 0) {
    throw new Error(`No .md files found in ${INSTRUCTIONS_DIR}`)
  }

  const blocks = mdFiles.map((relPath) => {
    const full = join(INSTRUCTIONS_DIR, relPath)
    const body = readFileSync(full, "utf8")
    return `# File: ${relPath}\n\n${body}`
  })

  return `${HEADER}\n\n---\n\n${blocks.join("\n\n---\n\n")}`
}

export const INSTRUCTIONS_TEXT = loadInstructions()

const estTokens = Math.round(INSTRUCTIONS_TEXT.length / 4)
console.log(
  `[worker] instructions loaded: ${INSTRUCTIONS_TEXT.length} chars, ~${estTokens} tokens`
)
if (estTokens < 4096) {
  console.warn(
    `[worker] WARNING: instructions are below Haiku 4.5's 4096-token cache floor; prompt caching will not activate. Add more content to instructions/*.md.`
  )
}
