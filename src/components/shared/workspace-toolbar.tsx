"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Shared toolbar for the list-style workspaces (tasks, projects, notes, …).
 *
 * These pages each grew their own three-stacks-of-pills filter bar, which is
 * both noisy and impossible to make consistent. This is the one place that
 * decides how filters, search, grouping, the view switch and the primary action
 * sit relative to each other.
 *
 * Every part is optional, so a page uses only the controls it actually has.
 */

export type ToolbarFilter = {
  /** Query-string key. An empty string means "this is the unset state". */
  param: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string; count?: number }>;
  /** Rendered on the trigger so the current choice is always visible. */
  showValue?: boolean;
};

export function WorkspaceToolbar({
  filters,
  onFilterChange,
  search,
  grouping,
  view,
  actions,
  className,
}: {
  filters?: ToolbarFilter[];
  /** Called with the query-string key and the new value ("" clears it). */
  onFilterChange?: (param: string, value: string) => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
  };
  grouping?: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  };
  view?: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string; icon: ReactNode }>;
  };
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2",
        className
      )}
    >
      {filters?.map((filter) => (
        <FilterSelect
          key={filter.param}
          {...filter}
          onSelect={(value) => onFilterChange?.(filter.param, value)}
        />
      ))}

      {grouping ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                Group
                <span className="font-medium text-foreground">
                  {grouping.options.find((o) => o.value === grouping.value)?.label ??
                    "None"}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            {grouping.options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => grouping.onChange(option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {search ? (
        <div className="relative min-w-40 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            aria-label={search.label ?? "Search"}
            className="h-8 bg-muted/50 pl-8 pr-8"
          />
          {search.value ? (
            <button
              type="button"
              onClick={() => search.onChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {view ? (
        <div
          role="group"
          aria-label="View"
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {view.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => view.onChange(option.value)}
              aria-pressed={view.value === option.value}
              aria-label={option.label}
              title={option.label}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition",
                view.value === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {option.icon}
            </button>
          ))}
        </div>
      ) : null}

      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  showValue = false,
  onSelect,
}: Omit<ToolbarFilter, "param"> & { onSelect: (value: string) => void }) {
  const active = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1.5",
              value ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {showValue && value ? active?.label : label}
            {value ? (
              <Badge
                variant="secondary"
                className="rounded-full px-1.5 py-0 text-[10px] tabular-nums"
              >
                {active?.count ?? value}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value || "all"}
            // Re-picking the active option clears it, so the menu doubles as a
            // toggle and there is no separate "All" row to hunt for.
            onClick={() => onSelect(option.value === value ? "" : option.value)}
          >
            <span className="flex-1">{option.label}</span>
            {typeof option.count === "number" ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {option.count}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const VIEW_ICONS = {
  list: <List className="size-4" />,
  grid: <LayoutGrid className="size-4" />,
  kanban: (
    <span className="flex gap-0.5" aria-hidden="true">
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  ),
};