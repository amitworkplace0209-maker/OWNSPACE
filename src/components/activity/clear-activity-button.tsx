"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { clearActivityHistoryAction } from "@/lib/actions/activity";

/**
 * Clears the activity feed.
 *
 * The feed is a log, not a workspace: nothing here points at a task or a note,
 * so deleting it loses the trail and not the work. That makes this safe to offer,
 * but only with two things spelled out — how many entries would go, and the fact
 * that there is no undo.
 *
 * The "keep the last 7 days" box is on by default. Somebody clearing a feed
 * that has run to thousands of entries almost always wants the clutter gone and
 * this week intact; making them un-tick a box to get that is the wrong default
 * for a destructive action.
 *
 * `count` comes from the page rather than being fetched here: the dialog can
 * only be opened from that page, and a second query at click time would be a
 * round trip whose answer is the same one the page already rendered.
 */
export function ClearActivityButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [keepRecent, setKeepRecent] = React.useState(true);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={count === 0}
        onClick={() => setOpen(true)}
        title={count === 0 ? "There is nothing to clear" : undefined}
      >
        <Trash2 /> Clear history
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !next && setOpen(false)}
        title="Clear your activity history?"
        description={
          count === 0 ? (
            "There is nothing to clear."
          ) : (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">
                {count} {count === 1 ? "entry" : "entries"}
              </span>{" "}
              from your activity feed. There is no undo.
            </>
          )
        }
        confirmLabel="Delete history"
        onConfirm={async () => {
          setOpen(false);
          const result = await clearActivityHistoryAction(
            keepRecent ? { keepRecentDays: 7 } : {}
          );
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(
            keepRecent
              ? "History cleared, the last 7 days kept."
              : "Activity history cleared."
          );
          router.refresh();
        }}
      >
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
          <Checkbox
            id="keep-recent"
            checked={keepRecent}
            onCheckedChange={(value) => setKeepRecent(value === true)}
            className="mt-0.5"
            // Nothing to protect when the feed is already empty.
            disabled={count === 0}
          />
          <label htmlFor="keep-recent" className="text-sm leading-snug">
            <span className="font-medium">Keep the last 7 days</span>
            <span className="block text-xs text-muted-foreground">
              Unticking this deletes everything, including this week.
            </span>
          </label>
        </div>
      </ConfirmDialog>
    </>
  );
}
