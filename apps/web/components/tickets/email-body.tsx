"use client"

import { useState } from "react"
import { splitQuotedReply } from "@/lib/quoted-reply"
import { cn } from "@workspace/ui/lib/utils"

// Render plain text with bare URLs turned into clickable links. URLs are
// rendered as React <a> nodes (never dangerouslySetInnerHTML), so customer text
// can't inject markup; long links are truncated in display but keep the real
// href, and break-all keeps them from blowing out the layout.
function Linkified({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline"
          >
            {part.length > 60 ? `${part.slice(0, 57)}…` : part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  )
}

// An email body in the conversation timeline: shows the customer's new message,
// and tucks the quoted reply/forward history behind a toggle (collapsed by
// default) so the thread reads like an email instead of a raw dump.
export function EmailBody({ text }: { text: string | null }) {
  const [showQuoted, setShowQuoted] = useState(false)
  if (!text) {
    return <p className="text-muted-foreground">(no text body)</p>
  }
  const { body, quoted } = splitQuotedReply(text)
  return (
    <div>
      <Linkified text={body} />
      {quoted ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
          {showQuoted ? (
            <Linkified
              text={quoted}
              className="mt-1.5 border-l-2 pl-3 text-xs text-muted-foreground"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
