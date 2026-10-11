import type { ReactNode } from "react";
import { ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { StatusDot, toneGradient, toneGlow, toneText } from "@/components/dashboard/tone";
import type { SemanticTone } from "@/lib/dashboard-logic";

type TrendDirection = "up" | "down" | "flat";

interface StatCardProps {
  title: string;
  value: string | number;
  href?: string;
  icon?: LucideIcon;
  /** Real secondary line, e.g. "3 of 7 done". Never invented. */
  secondary?: ReactNode;
  /** Semantic state chip, e.g. { label: "Needs attention", tone: "danger" }. */
  status?: { label: string; tone: SemanticTone };
  /** Only supply when a genuine historical comparison exists. */
  trend?: {
    direction: TrendDirection;
    value: string;
  };
  /** Bottom affordance, e.g. "View projects". */
  action?: string;
  /**
   * Colour of the icon tile and leading edge. Defaults to the status tone, so a
   * card with a tone already reads correctly without being told twice.
   */
  tone?: SemanticTone;
  variant?: "default" | "stat";
  className?: string;
}

export function StatCard({
  title,
  value,
  href,
  icon: Icon,
  secondary,
  status,
  trend,
  action,
  tone,
  variant = "stat",
  className,
}: StatCardProps) {
  const resolvedTone: SemanticTone = tone ?? status?.tone ?? "neutral";

  // A warning or critical state tints the card's top edge so overdue work
  // reads as urgent from across the dashboard; anything else uses the accent.
  const edgeClass =
    resolvedTone === "danger"
      ? "before:bg-gradient-to-r before:from-danger before:to-rose-400"
      : resolvedTone === "warning"
        ? "before:bg-gradient-to-r before:from-warning before:to-orange-400"
        : resolvedTone === "success"
          ? "before:bg-gradient-to-r before:from-success before:to-emerald-400"
          : "before:bg-gradient-to-r before:from-primary before:to-[var(--primary-alt)]";

  const content = (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 transition",
        "hover:border-primary/30 hover:shadow-lg focus-within:border-primary/40",
        variant === "stat" &&
          cn(
            "before:absolute before:left-0 before:top-0 before:h-[3px] before:w-full",
            edgeClass
          ),
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          <p className="dash-kpi-value">{value}</p>
        </div>
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[calc(var(--radius)*0.9)] text-white transition-transform duration-200 group-hover:scale-105",
              toneGradient[resolvedTone],
              toneGlow[resolvedTone]
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      {secondary ? (
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      ) : null}

      {status ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            toneText[status.tone]
          )}
        >
          <StatusDot tone={status.tone} />
          {status.label}
        </p>
      ) : null}

      {trend ? (
        <div className="flex items-center gap-1">
          {trend.direction === "up" ? (
            <TrendingUp aria-hidden="true" className="size-3 text-success" />
          ) : trend.direction === "down" ? (
            <TrendingDown aria-hidden="true" className="size-3 text-destructive" />
          ) : (
            <Minus aria-hidden="true" className="size-3 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              trend.direction === "up"
                ? "text-success"
                : trend.direction === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {trend.value}
          </span>
        </div>
      ) : null}

      {action && href ? (
        <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-muted-foreground transition group-hover:text-primary">
          {action}
          <ArrowRight
            aria-hidden="true"
            className="size-3 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {content}
      </Link>
    );
  }

  return content;
}