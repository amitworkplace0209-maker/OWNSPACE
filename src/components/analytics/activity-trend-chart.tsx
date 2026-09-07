"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { ActivityDay } from "@/lib/dal/analytics";

export function ActivityTrendChart({ data }: { data: ActivityDay[] }) {
  const chartData = data.map((d) => ({
    ...d,
    label: d.day.slice(5), // MM-DD
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
            labelFormatter={(label) => `Date ${label}`}
            formatter={(value, name) => {
              const key = typeof name === "string" ? name : "";
              const labels: Record<string, string> = {
                tasksCompleted: "Tasks completed",
                minutesTracked: "Minutes tracked",
                pomodoros: "Pomodoros",
                notesCreated: "Notes created",
              };
              return [value ?? "", labels[key] ?? key];
            }}
          />
          <Area
            type="monotone"
            dataKey="tasksCompleted"
            name="tasksCompleted"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Bar dataKey="minutesTracked" name="minutesTracked" fill="var(--primary)" fillOpacity={0.35} radius={2} />
          <Bar dataKey="pomodoros" name="pomodoros" fill="var(--amber-500, #f59e0b)" radius={2} />
          <Bar dataKey="notesCreated" name="notesCreated" fill="var(--muted-foreground)" radius={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}