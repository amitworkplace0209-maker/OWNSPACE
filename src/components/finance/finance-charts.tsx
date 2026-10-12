"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "cn";
import type { MonthBucket } from "@/lib/finance-logic";

const CURRENCY = "INR";

/**
 * Charts.
 *
 * Colours are the CSS custom properties the rest of the app uses rather than hex
 * literals, so a chart follows the active theme — including the accent the user
 * picked in Settings — without this file knowing anything about themes.
 *
 * Every chart is wrapped in a fixed-height div because ResponsiveContainer
 * measures its parent: inside an auto-height card it would collapse to nothing.
 */

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const axisLine = { stroke: "var(--border)" } as const;

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "var(--foreground)",
} as const;

function moneyTick(value: number): string {
  return formatCurrency(value, CURRENCY, { compact: true });
}

// ---------------------------------------------------------------------------
// Income vs expense, month by month
// ---------------------------------------------------------------------------

export function IncomeExpenseChart({
  data,
  height = "h-56",
  activeMonth,
}: {
  data: MonthBucket[];
  height?: string;
  /** Highlights the month the report is open on. */
  activeMonth?: string;
}) {
  if (data.every((point) => !point.hasData)) {
    return <ChartEmpty height={height} message="No transactions in these months yet." />;
  }

  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            tickLine={false}
            axisLine={axisLine}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={56} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.35 }}
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), CURRENCY),
              name === "income" ? "Income" : name === "expense" ? "Expenses" : String(name),
            ]}
            labelFormatter={(label, payload) => {
              const month = payload?.[0]?.payload?.month;
              return month ? `Month of ${label}` : String(label);
            }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) =>
              value === "income" ? "Income" : value === "expense" ? "Expenses" : value
            }
          />
          <Bar dataKey="income" fill="var(--success)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
          {activeMonth ? (
            <ReferenceLine
              x={data.find((point) => point.month === activeMonth)?.label}
              stroke="var(--primary)"
              strokeDasharray="4 2"
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One category, day by day
// ---------------------------------------------------------------------------

export function DailySpendChart({
  data,
  color = "var(--primary)",
  height = "h-52",
}: {
  data: MonthBucket[];
  color?: string;
  height?: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty height={height} message="Nothing recorded in this month." />;
  }

  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} minTickGap={12} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={56} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.35 }}
            contentStyle={tooltipStyle}
            formatter={(value) => [formatCurrency(Number(value ?? 0), CURRENCY), "Spent"]}
          />
          <Bar dataKey="expense" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// An account's running balance
// ---------------------------------------------------------------------------

/**
 * The balance line for a "Hisab" account.
 *
 * A zero reference line matters here more than anywhere else: cash in hand is
 * usually above it, a credit card entirely below it, and without the line the
 * chart has no obvious way to say which side you are on.
 */
export function BalanceLineChart({
  data,
  height = "h-56",
  color = "var(--primary)",
}: {
  data: Array<{ date: string; label: string; balance: number; income: number; expense: number }>;
  height?: string;
  color?: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty height={height} message="No movement recorded this month." />;
  }

  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} minTickGap={16} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={60} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), CURRENCY),
              name === "balance" ? "Balance" : name === "income" ? "Came in" : "Went out",
            ]}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={color}
            strokeWidth={2}
            fill="url(#balance-fill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the money went
// ---------------------------------------------------------------------------

export function CategoryPieChart({
  data,
  height = "h-56",
}: {
  data: Array<{ id: string | null; name: string; value: number; color: string | null }>;
  height?: string;
}) {
  const slices = data.filter((slice) => slice.value > 0).slice(0, 8);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <ChartEmpty height={height} message="Nothing to split up for this period." />;
  }

  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {slices.map((slice) => (
              <Cell key={slice.id ?? slice.name} fill={slice.color ?? "var(--primary)"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              `${formatCurrency(Number(value ?? 0), CURRENCY)} · ${formatPercent(Number(value ?? 0), total, 1)}`,
              String(name),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twelve-month shape for one category
// ---------------------------------------------------------------------------

export function MonthlyTrendChart({
  data,
  height = "h-56",
  color = "var(--primary)",
}: {
  data: MonthBucket[];
  height?: string;
  color?: string;
}) {
  if (!data.some((point) => point.hasData)) {
    return <ChartEmpty height={height} message="No transactions in this year." />;
  }

  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} minTickGap={14} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={60} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), CURRENCY),
              name === "expense" ? "Spent" : name === "income" ? "Earned" : "Net",
            ]}
          />
          <Line type="monotone" dataKey="expense" stroke={color} strokeWidth={2} dot={false} connectNulls />
          <Line
            type="monotone"
            dataKey="income"
            stroke="var(--success)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The empty state a chart shows instead of an empty frame.
 *
 * Kept at the chart's own height on purpose: a card that collapses to one line
 * of text makes the page jump as data arrives.
 */
function ChartEmpty({ height, message }: { height: string; message: string }) {
  return (
    <div className={cn(height, "flex items-center justify-center")}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
