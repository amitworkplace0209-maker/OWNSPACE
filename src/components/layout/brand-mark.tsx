import { cn } from "cn";

/**
 * The app mark: a rounded tile carrying the accent gradient.
 *
 * Used in the sidebar header and the mobile topbar, so the logo always picks up
 * the current accent instead of shipping one hardcoded colour.
 */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "brand-gradient inline-flex shrink-0 items-center justify-center rounded-[calc(var(--radius)*0.85)] font-heading font-bold text-white shadow-[0_6px_16px_-8px_var(--primary-glow)]",
        size === "sm" ? "size-7 text-sm" : "size-9 text-lg",
        className
      )}
    >
      O
    </span>
  );
}