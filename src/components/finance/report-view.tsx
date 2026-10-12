"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildYearSummary,
  monthLabel,
  monthsWithData,
  shiftMonth,
  type LedgerEntry,
} from "@/lib/finance-logic";
import { CardPicker, useReportCards } from "@/components/finance/report-cards";
import { ReportCardGrid } from "@/components/finance/report-card-grid";

/**
 * The charts page shell: month navigation, the card picker, and the cards.
 *
 * The card list is a client-side preference rather than a route or a query
 * parameter, because it is a reading preference, not a fact about the data —
 * nobody wants it in a link they paste to someone else. It lives in
 * localStorage, so it survives a reload and does not need a database round trip
 * to change.
 */
export function ReportView({
  month,
  entries,
  openingBalance,
  allTimeTruncated,
}: {
  month: string;
  entries: LedgerEntry[];
  openingBalance: number;
  allTimeTruncated: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useReportCards();
  const activeMonth = month;
  const year = React.useMemo(
    () => buildYearSummary(entries, activeMonth.slice(0, 4), openingBalance),
    [entries, activeMonth, openingBalance]
  );
  const availableMonths = React.useMemo(() => monthsWithData(entries), [entries]);

  function goTo(next: string) {
    router.push(`/finance/report?month=${next}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {allTimeTruncated ? (
        <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 text-warning" />
          This ledger is past 20,000 transactions, so the carried-forward balance is calculated from
          the most recent 20,000 and may not include the very first entries.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/finance?month=${activeMonth}`} />}
          >
            <ArrowLeft /> Money
          </Button>
          <span className="h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => goTo(shiftMonth(activeMonth, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => goTo(shiftMonth(activeMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-1 text-lg font-semibold tracking-tight">
            {monthLabel(activeMonth)}
          </h2>
          {availableMonths.length > 0 ? (
            <select
              value={activeMonth}
              onChange={(event) => goTo(event.target.value)}
              aria-label="Jump to a month with data"
              className="ml-2 h-7 rounded-lg border border-input bg-transparent px-2 text-xs outline-none"
            >
              {availableMonths.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <CardPicker enabled={enabled} onChange={setEnabled} />
      </div>

      <ReportCardGrid
        enabled={enabled}
        month={activeMonth}
        entries={entries}
        year={year}
        openingBalance={openingBalance}
      />
    </div>
  );
}
