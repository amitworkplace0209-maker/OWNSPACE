import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The one card shape every dashboard section uses.
 *
 * Centralising the header/action/body structure keeps spacing, title weight
 * and the "View all" affordance identical across sections, and lets each
 * section opt into the hover and accent treatments without repeating them.
 */
export function SectionShell({
  title,
  description,
  icon: Icon,
  action,
  actionHref,
  badge,
  children,
  className,
  contentClassName,
  interactive = false,
  accentEdge = false,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Short affordance rendered in the header, e.g. "View all". */
  action?: string;
  actionHref?: string;
  /** Optional count chip next to the title. */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Adds the elevation/border hover treatment (desktop pointers only). */
  interactive?: boolean;
  /** Draws a slim accent edge on the leading side of the card. */
  accentEdge?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative",
        interactive && "dash-card-hover",
        accentEdge && "dash-accent-edge",
        className
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {Icon ? (
            <span aria-hidden="true" className="icon-tile size-6 shrink-0">
              <Icon className="size-3.5" />
            </span>
          ) : null}
          <span className="truncate">{title}</span>
          {badge}
        </CardTitle>
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
        {action && actionHref ? (
          <CardAction>
            <Link
              href={actionHref}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {action}
              <span className="sr-only"> — {title}</span>
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
