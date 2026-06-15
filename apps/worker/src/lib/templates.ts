import type { ServerClient } from "@workspace/db/client"

export type TemplateRow = { title: string; content: string }

// Render the active templates into a compact reference block for the reply
// prompt. Empty string when there are none (so no block is injected).
export function renderTemplates(rows: TemplateRow[]): string {
  return rows.map((t) => `### ${t.title}\n${t.content}`).join("\n\n")
}

// Load the active response templates and render them. Called lazily when a
// reply is being drafted (not on every ticket).
export async function loadTemplateBlock(
  supabase: ServerClient
): Promise<string> {
  const { data } = await supabase
    .from("prompt_templates")
    .select("title, content")
    .eq("is_active", true)
    .order("name")
  return renderTemplates(data ?? [])
}
