import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCompactNaira } from "@/lib/format";

type RevenuePoint = {
  label: string;
  revenue: number;
  target?: number;
  /** optional same-week revenue one period earlier, drawn as a faint comparison line */
  previous?: number;
};

const chartConfig = {
  revenue: { label: "Actual revenue", color: "var(--color-primary)" },
  target: { label: "Weekly target", color: "var(--color-chart-target)" },
  previous: { label: "Previous period", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

export function RevenueTrendChart({ data }: { data: RevenuePoint[] }) {
  const peak = data.reduce<RevenuePoint | null>(
    (highest, point) => (!highest || point.revenue > highest.revenue ? point : highest),
    null,
  );

  return (
    <div className="mt-5">
      <ChartContainer config={chartConfig} className="h-52 w-full aspect-auto sm:h-56">
        <ComposedChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.18} />
              <stop offset="92%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={62}
            tickFormatter={(value: number) => formatCompactNaira(value)}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-border)", strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(label) => `Fiscal ${String(label)}`}
                formatter={(value, name) => (
                  <div className="flex min-w-36 items-center justify-between gap-4">
                    <span className="font-light-copy text-muted-foreground">
                      {chartConfig[String(name) as keyof typeof chartConfig]?.label}
                    </span>
                    <strong className="font-semibold text-foreground">
                      {formatCompactNaira(Number(value))}
                    </strong>
                  </div>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            fill="url(#revenue-fill)"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            activeDot={{
              r: 4,
              fill: "var(--color-primary)",
              stroke: "var(--color-card)",
              strokeWidth: 2,
            }}
          />
          {data.some((d) => d.previous !== undefined) ? (
            <Line
              type="monotone"
              dataKey="previous"
              stroke="var(--color-muted-foreground)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
            />
          ) : null}
          {data.some((point) => point.target !== undefined) ? (
            <Line
              type="monotone"
              dataKey="target"
              stroke="var(--color-chart-target)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
            />
          ) : null}
          {peak ? (
            <ReferenceDot
              x={peak.label}
              y={peak.revenue}
              r={4.5}
              fill="var(--color-primary)"
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-[11px]">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-2 rounded-full bg-primary" />
          Actual revenue
        </span>
        {data.some((point) => point.target !== undefined) ? (
          <span className="flex items-center gap-2 font-light-copy text-muted-foreground">
            <span className="w-4 border-t border-dashed border-chart-target" />
            Weekly target
          </span>
        ) : null}
        {data.some((d) => d.previous !== undefined) ? (
          <span className="flex items-center gap-2 font-light-copy text-muted-foreground">
            <span className="w-4 border-t border-muted-foreground/50" />
            Previous period
          </span>
        ) : null}
        {peak ? (
          <span className="ml-auto font-light-copy text-muted-foreground">
            Peak:{" "}
            <strong className="font-medium text-foreground">
              {peak.label} · {formatCompactNaira(peak.revenue)}
            </strong>
          </span>
        ) : null}
      </div>
    </div>
  );
}
