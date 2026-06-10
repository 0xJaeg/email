import { describe, it, expect } from "vitest"
import {
  estimateCostUsd,
  bucketVolumeByDay,
  type TokenUsage,
} from "../reports.js"

describe("estimateCostUsd", () => {
  it("returns 0 for no usage", () => {
    expect(estimateCostUsd([])).toBe(0)
  })

  it("prices Haiku input + output tokens", () => {
    // 1M Haiku input ($1) + 1M Haiku output ($5) = $6
    const usage: TokenUsage[] = [
      {
        model: "claude-haiku-4-5",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
      },
    ]
    expect(estimateCostUsd(usage)).toBeCloseTo(6, 5)
  })

  it("prices cached reads far below fresh input", () => {
    const cached: TokenUsage[] = [
      {
        model: "claude-haiku-4-5",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      },
    ]
    // cache read is a fraction of the $1/M input price
    expect(estimateCostUsd(cached)).toBeLessThan(1)
    expect(estimateCostUsd(cached)).toBeGreaterThan(0)
  })

  it("prices Sonnet higher than Haiku for the same tokens", () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 }
    const haiku = estimateCostUsd([{ model: "claude-haiku-4-5", ...tokens }])
    const sonnet = estimateCostUsd([{ model: "claude-sonnet-4-6", ...tokens }])
    expect(sonnet).toBeGreaterThan(haiku)
  })
})

describe("bucketVolumeByDay", () => {
  const now = new Date("2026-06-03T12:00:00Z")

  it("buckets timestamps into an ordered last-N-days series", () => {
    const pts = bucketVolumeByDay(
      [
        "2026-06-03T01:00:00Z",
        "2026-06-03T09:00:00Z",
        "2026-06-01T10:00:00Z",
      ],
      now,
      3
    )
    expect(pts.map((p) => p.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ])
    expect(pts.map((p) => p.count)).toEqual([1, 0, 2])
    expect(pts[0]?.label).toBe("Jun 1")
  })

  it("ignores timestamps outside the window", () => {
    const pts = bucketVolumeByDay(["2026-05-01T00:00:00Z"], now, 3)
    expect(pts.reduce((s, p) => s + p.count, 0)).toBe(0)
  })
})
