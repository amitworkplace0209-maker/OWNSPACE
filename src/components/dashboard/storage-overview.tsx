import Link from "next/link";
import { File as FileIcon, HardDrive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { StatusDot, toneText } from "@/components/dashboard/tone";
import { getStorageStats } from "@/lib/dal/storage";
import { getGDriveStatus } from "@/lib/dal/gdrive";
import { categoryColors, categoryIcons } from "@/lib/storage-categories";
import { formatFileSize } from "@/lib/format";

function gdriveLabel(status: {
  configured: boolean;
  connected: boolean;
}): { text: string; tone: "success" | "warning" | "neutral" } {
  if (!status.configured) return { text: "Drive not configured", tone: "warning" };
  if (status.connected) return { text: "Drive connected", tone: "success" };
  return { text: "Drive not linked", tone: "neutral" };
}

/**
 * Storage overview — real byte totals computed from the `files` table plus the
 * Google Drive connection state, with configuration gaps stated plainly rather
 * than hidden.
 */
export async function StorageOverview() {
  const [stats, gdrive] = await Promise.all([
    getStorageStats(),
    getGDriveStatus(),
  ]);

  const totalBytes = stats.usedBytes || 1;
  const drive = gdriveLabel(gdrive);

  return (
    <SectionShell
      title="Storage"
      icon={HardDrive}
      description={`${stats.fileCount} file${stats.fileCount === 1 ? "" : "s"} · ${formatFileSize(stats.usedBytes)} used`}
      action="Manage"
      actionHref="/storage"
      interactive
    >
      {stats.fileCount === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="Storage is empty"
          description="Upload files from any project or task."
          className="py-8"
          action={
            <Button render={<Link href="/files" />}>
              <Plus /> Upload file
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {stats.byCategory.map((c) => (
              <div
                key={c.key}
                title={`${c.label}: ${formatFileSize(c.sizeBytes)}`}
                style={{
                  width: `${(c.sizeBytes / totalBytes) * 100}%`,
                  backgroundColor: categoryColors[c.key] ?? "var(--primary)",
                }}
              />
            ))}
          </div>

          <ul className="flex flex-col gap-1.5">
            {stats.byCategory.slice(0, 4).map((c) => {
              const Icon = categoryIcons[c.key] ?? FileIcon;
              const pct = Math.round((c.sizeBytes / totalBytes) * 100);
              return (
                <li
                  key={c.key}
                  className="flex items-center gap-2.5 text-xs"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: `${categoryColors[c.key] ?? "#94a3b8"}20`,
                      color: categoryColors[c.key],
                    }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {c.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.count}
                  </span>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                    {formatFileSize(c.sizeBytes)}
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        className={`mt-3 flex items-center gap-2 border-t pt-3 text-xs ${toneText[drive.tone]}`}
      >
        <StatusDot tone={drive.tone} />
        <span className="font-medium">{drive.text}</span>
        {gdrive.connected && gdrive.email ? (
          <span className="truncate text-muted-foreground">{gdrive.email}</span>
        ) : null}
        {!gdrive.configured ? (
          <span className="ml-auto shrink-0 text-muted-foreground">
            GOOGLE_CLIENT_ID / SECRET
          </span>
        ) : !gdrive.connected ? (
          <Link
            href="/gdrive"
            className="ml-auto shrink-0 font-medium underline-offset-2 hover:underline"
          >
            Connect
          </Link>
        ) : null}
      </div>

      {!gdrive.configured ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {gdrive.error}
        </p>
      ) : null}
    </SectionShell>
  );
}
