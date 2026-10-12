"use client";

import * as React from "react";
import { Check, ChevronDown, LayoutGrid, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "cn";

/**
 * Which report cards are on, and which are not.
 *
 * The report page shows a lot of possible cards and most people want two or
 * three of them. Rather than guessing, the page asks — and remembers, so the
 * choice survives a reload and a navigation to another month.
 *
 * `defaultOn` is what a first-time visitor gets. It is deliberately the two
 * cards that answer "where did the money go" without needing a second glance,
 * because a page that opens empty looks broken even when it is not.
 */
export type CardId =
  | "trend"
  | "savings"
  | "daily"
  | "income"
  | "spending"
  | "year";

export type CardDefinition = {
  id: CardId;
  label: string;
  description: string;
  /** Renders wider than half the grid. */
  wide?: boolean;
};

export const REPORT_CARDS: CardDefinition[] = [
  {
    id: "trend",
    label: "Income vs expenses",
    description: "All twelve months, income beside spending",
    wide: true,
  },
  {
    id: "spending",
    label: "Where the money went",
    description: "A pie and a list, split by category",
    wide: true,
  },
  { id: "savings", label: "Savings rate", description: "What share of income you kept" },
  { id: "daily", label: "Day by day", description: "Which days the money moved", wide: true },
  { id: "income", label: "What came in", description: "Income by category" },
  {
    id: "year",
    label: "The year in one table",
    description: "Every month of the year, side by side",
    wide: true,
  },
];

export const DEFAULT_ENABLED_CARDS: CardId[] = ["trend", "spending"];

const STORAGE_KEY = "ownspece:finance:report-cards";

/**
 * Reads the saved selection, or the default.
 *
 * Exported so the report page can render the default set on the server and let
 * the client apply a saved one, rather than flashing the wrong cards.
 */
export function readEnabledCards(): CardId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Filtered against the known ids: a stale entry from a build that had a
    // card we have since removed must not leave a blank hole in the page.
    return parsed.filter((id): id is CardId =>
      REPORT_CARDS.some((card) => card.id === id)
    );
  } catch {
    return null;
  }
}

function saveEnabledCards(cards: CardId[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Private browsing, or storage full. The choice just will not persist.
  }
}

/**
 * The dropdown that turns cards on and off.
 *
 * Nothing is hidden behind it that cannot be turned on — this is a preference,
 * not a permissions screen. Showing the count on the trigger is what stops it
 * reading as "there are more cards somewhere" when the page looks short.
 */
export function CardPicker({
  enabled,
  onChange,
}: {
  enabled: CardId[];
  onChange: (next: CardId[]) => void;
}) {
  const [open, setOpen] = React.useState(false);

  function toggle(id: CardId) {
    onChange(
      enabled.includes(id) ? enabled.filter((entry) => entry !== id) : [...enabled, id]
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 />
            Cards
            <span className="rounded-full bg-primary/12 px-1.5 text-[10px] font-semibold text-primary">
              {enabled.length}
            </span>
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />

      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Pick the cards you want on this report.
        </p>

        <div className="flex flex-col">
          {REPORT_CARDS.map((card) => {
            const on = enabled.includes(card.id);
            return (
              <button
                key={card.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(card.id)}
                className="flex items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-accent/60"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  )}
                >
                  {on ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{card.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {card.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex gap-1.5 border-t pt-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="flex-1"
            disabled={enabled.length === DEFAULT_ENABLED_CARDS.length}
            onClick={() => onChange(DEFAULT_ENABLED_CARDS)}
          >
            <LayoutGrid /> Default
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="flex-1"
            disabled={enabled.length === REPORT_CARDS.length}
            onClick={() => onChange(REPORT_CARDS.map((card) => card.id))}
          >
            <Plus /> All
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Applies a saved selection on mount.
 *
 * The server rendered the default set, so the first client render has to match
 * it or React will warn about a mismatch — the swap happens after paint, the
 * same way the view preference in the workspace already works.
 */
export function useReportCards(): [CardId[], (next: CardId[]) => void] {
  const [enabled, setEnabled] = React.useState<CardId[]>(DEFAULT_ENABLED_CARDS);

  React.useEffect(() => {
    const saved = readEnabledCards();
    if (saved) {
      const id = window.requestAnimationFrame(() => setEnabled(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  // A plain callback rather than the setter itself: this also writes to
  // localStorage, which a raw setState would not do and callers would then have
  // to remember on top of.
  const update = React.useCallback((next: CardId[]) => {
    setEnabled(next);
    saveEnabledCards(next);
  }, []);

  return [enabled, update];
}
