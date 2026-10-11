import * as React from "react"
import { cn } from "cn"

export type CardVariant = "default" | "elevated" | "soft" | "outline" | "glass" | "compact"

/**
 * Card style system.
 *
 * The base card reads its surface from `--card-bg`, `--card-ring-color` and
 * `--card-shadow`, which are defined on `:root` (and optionally globally
 * re-mapped by a `[data-card-style]` appearance preset). A `variant` prop
 * overrides those variables locally so individual cards can opt in to a
 * different style without being affected by the global appearance setting.
 */
function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: CardVariant
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-(--card-bg) py-(--card-spacing) text-sm text-card-foreground ring-1 ring-(--card-ring-color) shadow-(--card-shadow) [--card-spacing:var(--card-spacing-var)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        variant === "elevated" && "shadow-(--card-shadow)",
        variant === "soft" &&
          "[--card-bg:color-mix(in_oklab,var(--primary)_7%,var(--background))] [--card-ring-color:transparent] [--card-shadow:none]",
        variant === "outline" &&
          "[--card-bg:transparent] [--card-ring-color:var(--border)] [--card-shadow:none]",
        variant === "glass" &&
          "[--card-bg:color-mix(in_oklab,var(--card)_72%,transparent)] [--card-ring-color:color-mix(in_oklab,var(--foreground)_14%,transparent)] [--card-shadow:none]",
        variant === "compact" && "data-[variant=compact]:[--card-spacing:0.625rem]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}