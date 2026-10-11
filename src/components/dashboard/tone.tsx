import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { SemanticTone } from "@/lib/dashboard-logic";

/**
 * Semantic tone → Tailwind class maps.
 *
 * Everything routes through the `--success / --warning / --danger / --info`
 * tokens, so indicators follow the active theme (light, dark, AMOLED) without
 * any hardcoded color ever entering a dashboard component.
 */

export const toneText: Record<SemanticTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted-foreground",
};

export const toneBg: Record<SemanticTone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  neutral: "bg-muted text-muted-foreground",
};

export const toneDot: Record<SemanticTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
};

export const toneBorder: Record<SemanticTone, string> = {
  success: "border-success/30",
  warning: "border-warning/40",
  danger: "border-danger/35",
  info: "border-info/30",
  neutral: "border-border",
};

/**
 * Gradient fills for icon tiles and leading edges.
 *
 * `primary` is the only one that is not a status colour — it defers to the
 * accent gradient so the neutral cards still read as "part of this app" rather
 * than four identical grey squares.
 */
export const toneGradient: Record<SemanticTone, string> = {
  success: "bg-gradient-to-br from-success to-emerald-400",
  warning: "bg-gradient-to-br from-warning to-orange-400",
  danger: "bg-gradient-to-br from-danger to-rose-400",
  info: "bg-gradient-to-br from-info to-sky-400",
  neutral: "brand-gradient",
};

export const toneGlow: Record<SemanticTone, string> = {
  success: "shadow-[0_6px_16px_-8px_var(--success)]",
  warning: "shadow-[0_6px_16px_-8px_var(--warning)]",
  danger: "shadow-[0_6px_16px_-8px_var(--danger)]",
  info: "shadow-[0_6px_16px_-8px_var(--info)]",
  neutral: "shadow-[0_6px_16px_-8px_var(--primary-glow)]",
};

/** Small round status indicator. Decorative — always paired with a label. */
export function StatusDot({
  tone,
  className,
}: {
  tone: SemanticTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone], className)}
    />
  );
}

/** Compact pill carrying a semantic tone. */
export function ToneBadge({
  tone,
  children,
  className,
  dot = false,
}: {
  tone: SemanticTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("rounded-full", toneBg[tone], className)}
    >
      {dot ? <StatusDot tone={tone} className="bg-current" /> : null}
      {children}
    </Badge>
  );
}
