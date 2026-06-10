"use client"

import { Cell, Label, Pie, PieChart } from "recharts"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

// Semantic palette matching the status badges: blue = informational,
// amber/orange = retention, reds = money-out, gray = handed to a person.
const config = {
  send_faq_reply: { label: "FAQ replies", color: "#3b82f6" },
  send_offer_1: { label: "Retention offer (1st)", color: "#f59e0b" },
  send_offer_2: { label: "Retention offer (2nd)", color: "#f97316" },
  issue_refund: { label: "Refunds", color: "#ef4444" },
  issue_refund_chargeback: { label: "Refunds (chargeback)", color: "#b91c1c" },
  escalate: { label: "Escalated to a person", color: "#71717a" },
} satisfies ChartConfig

export function HandledChart({
  byDecision,
}: {
  byDecision: Record<string, number>
}) {
  const data = Object.entries(config)
    .map(([key]) => ({ key, value: byDecision[key] ?? 0 }))
    .filter((d) => d.value > 0)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>How tickets were handled</CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums">
          {total}{" "}
          <span className="text-muted-foreground text-sm font-normal">
            decisions
          </span>
        </CardTitle>
      </CardHeader>
      {total === 0 ? (
        <p className="text-muted-foreground px-6 py-10 text-center text-sm">
          No decisions yet.
        </p>
      ) : (
        <ChartContainer config={config} className="mx-auto h-[260px] w-full">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent nameKey="key" hideLabel />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius={62}
              strokeWidth={4}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={`var(--color-${d.key})`} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {total}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 20}
                          className="fill-muted-foreground text-xs"
                        >
                          tickets
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="key" />}
              className="flex-wrap gap-x-3 gap-y-1"
            />
          </PieChart>
        </ChartContainer>
      )}
    </Card>
  )
}
