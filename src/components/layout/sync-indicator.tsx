"use client";

import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSyncStatus } from "@/hooks/use-sync-status";
import {
  formatLastSync,
  SYNC_PHASE_LABEL,
  type SyncPhase,
} from "@/lib/offline/sync-status";
import { cn } from "cn";

const PHASE_STYLE: Record<SyncPhase, string> = {
  online: "text-muted-foreground",
  offline: "text-warning",
  syncing: "text-primary",
  pending: "text-warning",
  error: "text-destructive",
  synced: "text-success",
};

function PhaseIcon({ phase, spinning }: { phase: SyncPhase; spinning: boolean }) {
  if (phase === "offline") return <CloudOff className="size-4" />;
  if (phase === "syncing") return <LoaderCircle className={cn("size-4", spinning && "animate-spin")} />;
  if (phase === "error") return <AlertTriangle className="size-4" />;
  if (phase === "pending") return <Cloud className="size-4" />;
  if (phase === "synced") return <Check className="size-4" />;
  return <Cloud className="size-4" />;
}

/**
 * Always-visible sync state.
 *
 * A single chip in the topbar answers the three questions an offline-first app
 * owes its user: is the device online, are there unsent changes, and when did
 * the last successful sync happen. The full detail lives in one dropdown so a
 * flaky connection does not need a permanent banner on every page.
 */
export function SyncIndicator({ userId }: { userId: string }) {
  const { report, phase, syncNow } = useSyncStatus(userId);
  const lastSync = formatLastSync(report.lastSuccessAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Sync status: ${SYNC_PHASE_LABEL[phase]}${report.pending ? `, ${report.pending} changes pending` : ""}`}
            title={`${SYNC_PHASE_LABEL[phase]}${report.pending ? ` · ${report.pending} pending` : ""}${lastSync ? ` · last synced ${lastSync}` : ""}`}
            className={cn("relative shrink-0", PHASE_STYLE[phase])}
          >
            <PhaseIcon phase={phase} spinning={report.syncing} />
            {report.pending > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-warning px-0.5 text-center font-mono text-[9px] leading-3.5 text-foreground">
                {report.pending}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72 p-3">
        <DropdownMenuLabel className="flex items-center gap-2 px-0 pb-2">
          <span className={PHASE_STYLE[phase]}>
            <PhaseIcon phase={phase} spinning={report.syncing} />
          </span>
          <span>{SYNC_PHASE_LABEL[phase]}</span>
        </DropdownMenuLabel>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Connection</dt>
          <dd className="text-right">{report.online ? "Online" : "Offline"}</dd>
          <dt className="text-muted-foreground">Changes pending</dt>
          <dd className="text-right tabular-nums">{report.pending}</dd>
          <dt className="text-muted-foreground">Failed operations</dt>
          <dd className="text-right tabular-nums">{report.failed}</dd>
          <dt className="text-muted-foreground">Last successful sync</dt>
          <dd className="text-right">{lastSync ?? "Never"}</dd>
        </dl>
        {report.lastError ? (
          <p role="alert" className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {report.lastError}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {report.online
            ? "Changes saved on this device are synced automatically."
            : "Everything you change is saved on this device and sent when you reconnect."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          disabled={!report.online || report.syncing}
          onClick={syncNow}
        >
          <RefreshCw className={report.syncing ? "animate-spin" : undefined} />
          Sync now
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
