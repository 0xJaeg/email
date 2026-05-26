# Instructions Store

This directory contains the markdown files that shape the Email Support Agent's behavior. Every file here is read at worker startup and concatenated into a single system prompt that gets sent to Claude on every classification call, with prompt caching applied to the combined block.

## Layout

```
instructions/
  README.md                       this file (loaded into the prompt as preamble)
  classifier.md                   classification rubric — labels, signals, edge cases
  policies/
    refund.md                     refund policy summary and retention offer templates
    common-questions.md           FAQ skeleton — example questions and canned answers
  tone/
    voice.md                      tone-of-voice guide for any outbound replies
```

## How to edit

1. Edit any file in this directory.
2. Restart the worker (`Ctrl+C` then `pnpm dev`, or `pnpm --filter worker dev`).
3. The new prompt is loaded at startup. Token count is logged so you can confirm you're still above the 4096-token cache floor.
4. The first classification request after restart is a cache write; subsequent requests within an hour are cache reads (~90% discount).

## Why one big system prompt

Anthropic prompt caching is a prefix match. Splitting the rubric, FAQ, and refund policy into separate `cache_control` blocks would multiply maintenance work without buying much — every request reads the full prefix anyway. We attach a single `cache_control: {type: "ephemeral", ttl: "1h"}` breakpoint to the concatenated text. Editing any file invalidates the whole cache on the next worker restart, which is fine for human-editing cadence.
