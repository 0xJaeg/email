"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
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
      <ChartContainer config={config} className="h-[220px] w-full px-2">
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fillVolume" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <Area
            dataKey="count"
            type="monotone"
            stroke="var(--color-count)"
            strokeWidth={2}
            fill="url(#fillVolume)"
          />
        </AreaChart>
      </ChartContainer>
    </Card>
  )
}
