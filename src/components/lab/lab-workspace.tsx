"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  NotebookPen,
  HardDrive,
  Wallet,
  Link2,
  Unplug,
  FileText,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openCommandPalette } from "@/components/layout/command-palette";
import { startGDriveAuthAction, disconnectGDriveAction } from "@/lib/actions/gdrive";
import type { GDriveStatus } from "@/lib/dal/gdrive";
import { formatFileSize } from "@/lib/format";
import type { WorkspaceStats } from "@/lib/dal/stats";
import type { StorageStats } from "@/lib/dal/storage";
import type { FinanceOverview } from "@/lib/dal/finance";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function LabWorkspace({
  stats,
  storageStats,
  financeOverview,
  gdrive,
}: {
  stats: WorkspaceStats;
  storageStats: StorageStats;
  financeOverview: FinanceOverview;
  gdrive: GDriveStatus;
}) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [gdError, setGdError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  async function connectDrive() {
    setConnecting(true);
    setGdError(null);
    // Lab is a quick entry point; it asks for the address of the account the
    // user is already signed into, then hands off to the same consent flow the
    // /gdrive page uses.
    const email =
      typeof window !== "undefined" ? (prompt("Which Google account? (email)") ?? "") : "";
    if (!email.trim()) {
      setConnecting(false);
      return;
    }
    const result = await startGDriveAuthAction(email);
    setConnecting(false);
    if (!result.ok) {
      setGdError(result.error);
      return;
    }
    window.location.href = result.data!.url;
  }

  async function disconnectDrive() {
    setDisconnecting(true);
    setGdError(null);
    for (const account of gdrive.accounts) {
      const result = await disconnectGDriveAction(account.id);
      if (!result.ok) {
        setGdError(result.error);
        setDisconnecting(false);
        return;
      }
    }
    setDisconnecting(false);
    router.refresh();
  }

  const fileTypeRows = storageStats.byCategory.slice(0, 5).map((c) => ({
    label: c.label,
    value: formatFileSize(c.sizeBytes),
    count: c.count,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <LayoutDashboard className="size-4 text-primary" /> Workspace inspector
        </h2>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Projects</dt>
            <dd className="font-medium">{stats.projects.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tasks</dt>
            <dd className="font-medium">{stats.tasks.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Notes</dt>
            <dd className="font-medium">{stats.notes}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Daily notes</dt>
            <dd className="font-medium">{stats.dailyNotes}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Files</dt>
            <dd className="font-medium">{stats.files}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Storage</dt>
            <dd className="font-medium">{formatFileSize(stats.storageUsedBytes)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <CheckSquare className="size-4 text-primary" /> Task tracker
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{stats.tasks.total}</span>
          <span className="text-xs text-muted-foreground">tasks in workspace</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{stats.tasks.pending} open</Badge>
          <Badge variant="outline" className="h-5">
            {stats.tasks.done} done
          </Badge>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <NotebookPen className="size-4 text-primary" /> Notes index
        </h2>
        <p className="text-sm text-muted-foreground">
          {stats.notes} notes and {stats.dailyNotes} daily notes across your workspace.
        </p>
        <Link href="/notes">
          <Button variant="outline" size="sm" className="w-full">
            Open notes <ArrowUpRight className="size-3.5" />
          </Button>
        </Link>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <HardDrive className="size-4 text-primary" /> File type inspector
        </h2>
        {fileTypeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Upload files to analyse your storage mix.</p>
        ) : (
          <ul className="flex flex-col">
            {fileTypeRows.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0"
              >
                <span className="text-muted-foreground">
                  {row.label} <span className="text-xs">({row.count})</span>
                </span>
                <span className="font-medium">{row.value}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/storage">
          <Button variant="outline" size="sm" className="w-full">
            Full breakdown <ArrowUpRight className="size-3.5" />
          </Button>
        </Link>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Wallet className="size-4 text-primary" /> Finance snapshot
        </h2>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className="font-medium">{currency.format(financeOverview.balance)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">This month</dt>
            <dd className="font-medium">
              {currency.format(financeOverview.thisMonthIncome - financeOverview.thisMonthExpense)}
            </dd>
          </div>
        </dl>
        <Link href="/finance">
          <Button variant="outline" size="sm" className="w-full">
            Open finance <ArrowUpRight className="size-3.5" />
          </Button>
        </Link>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="size-4 text-primary" /> Google Drive
        </h2>
        {gdrive.connected && gdrive.configured ? (
          <>
            <p className="flex items-center gap-1.5 text-sm">
              <span className="size-2 rounded-full bg-emerald-500" />
              {gdrive.accounts.length === 1
                ? "Connected"
                : `${gdrive.accounts.length} accounts connected`}
            </p>
            <ul className="flex flex-col gap-0.5">
              {gdrive.accounts.slice(0, 4).map((account) => (
                <li key={account.id} className="truncate text-xs text-muted-foreground">
                  {account.label ?? account.account_email}
                  {account.status !== "active" ? ` · ${account.status}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <Link href="/gdrive">
                <Button variant="outline" size="sm">
                  Manage
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                disabled={disconnecting}
                onClick={disconnectDrive}
              >
                <Unplug /> {disconnecting ? "Disconnecting…" : "Disconnect all"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {gdrive.configured
                ? "Link a Google account to browse its Drive and pull files into your workspace."
                : "Drive integration is not configured on this server yet."}
            </p>
            {gdError ? <p className="text-sm text-destructive">{gdError}</p> : null}
            {gdrive.configured ? (
              <Button size="sm" disabled={connecting} onClick={connectDrive}>
                <Link2 /> {connecting ? "Opening Google…" : "Connect"}
              </Button>
            ) : (
              <Link href="/gdrive">
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="size-4" /> G Drive settings
                </Button>
              </Link>
            )}
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:col-span-2 lg:col-span-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Search className="size-4 text-primary" /> Search everything
        </h2>
           {/* Hands the text to the palette rather than rendering results here.
               A second search box would drift out of step with the palette's —
               this one has no results of its own to show, and pretending
               otherwise is how two search boxes end up disagreeing about what
               exists. */}
           <form
             className="flex gap-2"
             onSubmit={(e) => {
               e.preventDefault();
               const q = searchQuery.trim();
               if (!q) {
                 setSearchError("Enter a search term.");
                 return;
               }
               setSearchError(null);
               openCommandPalette(q);
             }}
           >
           <input
             value={searchQuery}
             onChange={(e) => { setSearchQuery(e.target.value); setSearchError(null); }}
             placeholder="Search projects, tasks, notes, files…"
             aria-label="Search everything"
             className="h-8 w-full min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
           />
           {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
           <Button type="submit">Search</Button>
         </form>
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:col-span-2 lg:col-span-3">
        <h2 className="text-sm font-medium">About the lab</h2>
        <p className="text-sm text-muted-foreground">
          The Lab hosts small, real-data utilities built on top of your workspace — every number here comes from
          your own data. Use the sidebar to explore more tools like Time tracking, Analytics and the Wiki.
        </p>
      </Card>
    </div>
  );
}