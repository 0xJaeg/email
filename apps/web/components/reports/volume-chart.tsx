"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import type { VolumePoint } from "@/lib/reports"

const config = {
  count: { label: "Emails", color: "var(--chart-1)" },
} satisfies ChartConfig

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>Email volume</CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums">
          {total}{" "}
          <span className="text-muted-foreground text-sm font-normal">
            in the last {data.length} days
          </span>
        </CardTitle>
      </CardHeader>
      <ChartContainer config={config} className="h-[340px] w-full px-2">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            fontSize={11}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ChartContainer>
    </Card>
  )
}
