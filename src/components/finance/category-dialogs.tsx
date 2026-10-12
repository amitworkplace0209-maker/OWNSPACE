"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  CreditCard,
  House,
  Landmark,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import {
  createFinanceCategoryAction,
  saveFinanceAccountAction,
  updateFinanceCategoryAction,
  type FinanceAccountFormState,
  type FinanceFormState,
} from "@/lib/actions/finance";
import {
  CATEGORY_ICON_CHOICES,
  CATEGORY_ICONS,
  DEFAULT_FINANCE_CATEGORIES,
  FALLBACK_CATEGORY_ICON,
  KIND_META,
} from "@/config/finance-categories";
import { monthLabel } from "@/lib/finance-logic";
import { FINANCE_KINDS, type FinanceCategoryType, type FinanceKind } from "@/types";
import { cn } from "cn";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none";

/** The books, as pickable options. `cash_bank` is listed first — it is "Hisab". */
const BOOK_CHOICES: FinanceKind[] = [...FINANCE_KINDS];

const BOOK_ICONS: Record<FinanceKind, React.ComponentType<{ className?: string }>> = {
  income: BadgeIndianRupee,
  cash_bank: Landmark,
  household: House,
  expense: ShoppingBag,
  investment: TrendingUp,
  liability: CreditCard,
};

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  existingNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted means "create". */
  category?: {
    id: string;
    name: string;
    kind: FinanceKind | null;
    color: string | null;
    icon: string | null;
    type: string;
  };
  /** Names the user already has, so the picker can mark them as taken. */
  existingNames?: string[];
}) {
  const router = useRouter();
  const editing = Boolean(category?.id);
  const existing = existingNames ?? [];

  const action = editing
    ? updateFinanceCategoryAction.bind(null, category!.id)
    : createFinanceCategoryAction;
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(action, {
    error: undefined,
  });

  const [name, setName] = React.useState(category?.name ?? "");
  const [kind, setKind] = React.useState<FinanceKind | "">(category?.kind ?? "");
  const [type, setType] = React.useState<FinanceCategoryType>(
    (category?.type as FinanceCategoryType) ?? "expense"
  );
  const [icon, setIcon] = React.useState(category?.icon ?? "");
  const [color, setColor] = React.useState(category?.color ?? "#6366f1");

  // No effect re-seeds these when the dialog switches category: the caller keys
  // this component by category id, so a change remounts it and the useState
  // initialisers run again against the new row.

  React.useEffect(() => {
    if (state.data && !pending) {
      toast.success(editing ? "Category updated." : "Category added.");
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, editing, onOpenChange, router]);

  // Picking a book implies its transaction type — you cannot have an account
  // outside Cash & bank, and an "income" book with an expense type would never
  // show up in an income breakdown.
  function chooseKind(next: FinanceKind) {
    setKind(next);
    setType(KIND_META[next].categoryType);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            Every category gets its own monthly and yearly report, whichever book it belongs to.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {!editing ? (
            <PredefinedCategoryPicker
              // A category the user already has is shown as taken rather than
              // hidden, so the list still reads as the full starter set and it is
              // obvious why a name is unavailable.
              existing={existing}
              onPick={(preset) => {
                setKind(preset.kind);
                setType(preset.type);
                setIcon(preset.icon);
                setName(preset.name);
                setColor(preset.color);
              }}
            />
          ) : null}

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {editing ? "Details" : "Ya apna banao"}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <FormField label="Name" htmlFor="cat-name" error={state.error}>
            <Input
              id="cat-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ghar ka kirana"
              required
              autoFocus
            />
          </FormField>

          <FormField
            label="Which book"
            hint="Decides the report — balance, portfolio, what's owed, or plain spending"
          >
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {BOOK_CHOICES.map((value) => {
                const Icon = BOOK_ICONS[value];
                const active = kind === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseKind(value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{KIND_META[value].short}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {KIND_META[value].label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </FormField>

          {kind ? (
            <FormField label="Counts as">
              <div className="flex gap-1.5">
                {(["expense", "income", "account"] as const)
                  // `account` only makes sense for a book that holds money, so it
                  // is not offered for the others.
                  .filter((value) => value !== "account" || kind === "cash_bank")
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      aria-pressed={type === value}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        type === value
                          ? value === "income"
                            ? "border-success/40 bg-success/10 text-success"
                            : value === "expense"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-primary/40 bg-primary/10 text-primary"
                          : "hover:bg-accent/50"
                      )}
                    >
                      {value === "account" ? "Account (in & out)" : value === "income" ? "Income" : "Expense"}
                    </button>
                  ))}
              </div>
              <input type="hidden" name="type" value={type} />
            </FormField>
          ) : (
            <>
              <FormField label="Counts as">
                <select
                  name="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as FinanceCategoryType)}
                  className={selectClass}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </FormField>
              <input type="hidden" name="kind" value="" />
            </>
          )}

          <FormField label="Colour" hint="Used by the charts">
            <div className="flex items-center gap-2">
              <Input
                name="color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-16 p-1"
              />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
          </FormField>

          <FormField label="Icon">
            <div className="grid grid-cols-9 gap-1">
              {CATEGORY_ICON_CHOICES.map((name) => {
                const Icon = CATEGORY_ICONS[name] ?? FALLBACK_CATEGORY_ICON;
                const active = icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(active ? "" : name)}
                    aria-pressed={active}
                    aria-label={name}
                    title={name}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border transition",
                      active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/50"
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="icon" value={icon} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The starter categories, as cards you can tap.
 *
 * Asking someone to remember which of thirty names the app already ships, and to
 * type it exactly, is a bad way to say "these are the ones most people want". One
 * tap fills the form below instead — and the form stays editable, because a
 * preset is a starting point, not a constraint.
 */
function PredefinedCategoryPicker({
  existing,
  onPick,
}: {
  existing: string[];
  onPick: (preset: (typeof DEFAULT_FINANCE_CATEGORIES)[number]) => void;
}) {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  const [book, setBook] = React.useState<FinanceKind>("household");

  const presets = DEFAULT_FINANCE_CATEGORIES.filter((preset) => preset.kind === book);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Pick one to start from</p>
        <span className="text-[11px] text-muted-foreground">tap to fill the form</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {BOOK_CHOICES.map((value) => {
          const Icon = BOOK_ICONS[value];
          const count = DEFAULT_FINANCE_CATEGORIES.filter(
            (preset) => preset.kind === value
          ).length;
          const active = book === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setBook(value)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "hover:bg-accent/50"
              )}
            >
              <Icon className="size-3.5 text-primary" />
              {KIND_META[value].short}
              <span className="text-[10px] text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
        {presets.map((preset) => {
          const Icon = CATEGORY_ICONS[preset.icon] ?? FALLBACK_CATEGORY_ICON;
          const already = taken.has(preset.name.toLowerCase());
          return (
            <button
              key={`${preset.kind}-${preset.name}`}
              type="button"
              disabled={already}
              onClick={() => onPick(preset)}
              title={already ? "You already have this one" : preset.hint}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 text-left transition",
                already
                  ? "cursor-not-allowed border-border/60 opacity-45"
                  : "hover:border-primary/50 hover:bg-accent/50"
              )}
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: `color-mix(in oklab, ${preset.color} 16%, transparent)`,
                  color: preset.color,
                }}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {already ? `${preset.name} ✓` : preset.name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {already ? "already added" : preset.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The opening balance for one category.
 *
 * This is the number that makes the carry-forward work: everything before the
 * month named here is treated as already settled, and the balance on any later
 * day is this figure plus the transactions after it. A credit card starts
 * negative, which is why the amount is not restricted to positive values.
 */
export function OpeningBalanceDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  current,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  current: number;
  month: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FinanceAccountFormState, FormData>(
    saveFinanceAccountAction,
    { error: undefined }
  );

  React.useEffect(() => {
    if (state.data && !pending) {
      toast.success("Opening balance saved.");
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opening balance — {categoryName}</DialogTitle>
          <DialogDescription>
            How much was in hand on the 1st of the month you pick. Every later balance builds on it, so
            no month ever restarts from zero.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="opening_month" value={month} />

          <FormField label="Amount" htmlFor="opening-amount" error={state.error}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                &#8377;
              </span>
              <Input
                id="opening-amount"
                name="opening_balance"
                type="number"
                step="0.01"
                // No `min`: a credit card balance is negative, and that is the
                // normal case for this field, not an edge case.
                className="pl-7"
                defaultValue={current || ""}
                placeholder="0"
                required
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Use a negative number for what you owe, e.g. -25000 for a credit card.
            </p>
          </FormField>

          <FormField label="As of" hint="The month this amount is measured at">
            {/* Shown, not submitted: the month comes from the hidden input above,
                so the two can never be edited out of step. Changing the month
                means moving the page, and reopening this. */}
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              1st of {monthLabel(month)}
            </p>
          </FormField>

          <FormField label="Notes">
            <Textarea name="notes" rows={2} placeholder="Optional" />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save balance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
