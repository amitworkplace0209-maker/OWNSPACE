"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Cloud,
  Database,
  ExternalLink,
  File,
  FileQuestion,
  FolderOpen,
  HardDrive,
  Link2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar, VIEW_ICONS } from "@/components/shared/workspace-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { categoryColors, categoryIcons } from "@/lib/storage-categories";
import type { StorageReport, StorageStats } from "@/lib/dal/storage";
import type { StorageObjectRow } from "@/lib/dal/storage";
import {
  bucketHealth,
  bySizeDescending,
  clampedPercent,
  percentOf,
  shareOf,
  summariseOrphans,
  type DriveUsageSummary,
  type HealthLevel,
} from "@/lib/storage-logic";
import { formatDateShort, formatFileSize } from "@/lib/format";
import { cn } from "cn";
import type { GDriveConnection, StoredFile } from "@/types";

type BucketInfo = {
  name: string;
  public: boolean;
  fileSizeLimitBytes: number | null;
  allowedMimeTypes: string[] | null;
  storedBytes: number;
  storedCount: number;
  largestObjectBytes: number;
  unavailable: boolean;
};

type Source = "all" | "supabase" | "drive";

const HEALTH_TONE: Record<HealthLevel, string> = {
  ok: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * Storage.
 *
 * Supabase and Google Drive are rendered as two separate sections with their
 * own totals, and never summed into one number. A Drive byte and a Supabase
 * byte do not share a quota, so a combined total would imply a ceiling that
 * does not exist — and only real API-reported limits are ever shown.
 */
export function StorageWorkspace({
  stats,
  files,
  category,
  source,
  bucket,
  untracked,
  bucketConfigError,
  storageReport,
  drive,
}: {
  stats: StorageStats;
  files: Array<StoredFile & { category: string }>;
  category: string | null;
  source: Source;
  bucket: BucketInfo;
  untracked: { objects: StorageObjectRow[]; bytes: number; error: string | null };
  bucketConfigError: string | null;
  storageReport?: StorageReport;
  drive: {
    configured: boolean;
    accounts: GDriveConnection[];
    error: string | null;
    usage: DriveUsageSummary;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<"files" | "objects">("files");

  const orphans = summariseOrphans({
    storedBytes: bucket.unavailable ? null : bucket.storedBytes,
    storedCount: bucket.unavailable ? null : bucket.storedCount,
    trackedBytes: stats.usedBytes,
    trackedCount: stats.fileCount,
    error: bucket.unavailable ? "listing failed" : null,
  });

  const health = bucketHealth({
    usedBytes: bucket.storedBytes,
    limitBytes: null,
    largestObjectBytes: bucket.largestObjectBytes,
    fileSizeLimitBytes: bucket.fileSizeLimitBytes,
    error: bucket.unavailable ? "The bucket listing could not be read." : null,
  });

  const drivePercent = drive.usage.totalQuotaLimit
    ? clampedPercent(drive.usage.totalQuotaUsed, drive.usage.totalQuotaLimit)
    : 0;

  const statItems: StatStripItem[] = [
    {
      id: "supabase",
      label: "App storage",
      value: stats.fileCount,
      icon: Database,
      tone: "info",
      hint: `${formatFileSize(stats.usedBytes)} in ${stats.byCategory.length} categor${stats.byCategory.length === 1 ? "y" : "ies"}`,
    },
    {
      id: "bucket",
      label: "Bucket objects",
      value: bucket.storedCount,
      icon: HardDrive,
      tone: bucket.unavailable ? "warning" : "neutral",
      hint: bucket.unavailable ? "Could not read the bucket" : `${formatFileSize(bucket.storedBytes)} stored`,
    },
    {
      id: "orphans",
      label: "Untracked",
      value: orphans.unavailable ? 0 : orphans.orphanCount,
      icon: FileQuestion,
      tone: orphans.unavailable
        ? "warning"
        : orphans.orphanCount > 0
          ? "danger"
          : "success",
      hint: orphans.unavailable
        ? "Scan unavailable"
        : orphans.orphanCount > 0
          ? `${formatFileSize(orphans.orphanBytes)} with no file record`
          : "Everything is tracked",
    },
    {
      id: "drive",
      label: "Drive accounts",
      value: drive.accounts.length,
      icon: Cloud,
      tone: drive.accounts.length > 0 ? "success" : "neutral",
      hint: `${drivePercent}% of reported quota used`,
    },
    {
      id: "linked",
      label: "Drive linked",
      value: drive.usage.totalLinkedCount,
      icon: Link2,
      tone: "warning",
      hint: `${formatFileSize(drive.usage.totalLinkedBytes)} into workspace`,
    },
  ];

  function setFilter(param: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (!value || value === "all") params.delete(param);
    else params.set(param, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const filteredFiles = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter(
      (file) =>
        file.name.toLowerCase().includes(needle) ||
        (file.mime_type ?? "").toLowerCase().includes(needle)
    );
  }, [files, query]);

  const filteredObjects = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = bySizeDescending(
      untracked.objects.map((object) => ({
        key: object.name,
        label: object.name,
        count: 1,
        sizeBytes: object.sizeBytes,
      }))
    );
    if (!needle) return sorted;
    return sorted.filter((entry) => entry.label.toLowerCase().includes(needle));
  }, [untracked.objects, query]);

  const showSupabase = source !== "drive";
  const showDrive = source !== "supabase";

  return (
    <div className="flex flex-col gap-6">
      <StatStrip items={statItems} activeId={source === "drive" ? "drive" : "supabase"} />

      <WorkspaceToolbar
        filters={[
          {
            param: "source",
            label: "Provider",
            value: source,
            options: [
              { value: "all", label: "Both" },
              { value: "supabase", label: "Supabase", count: stats.fileCount },
              { value: "drive", label: "Google Drive", count: drive.usage.totalLinkedCount },
            ],
          },
          {
            param: "category",
            label: "Type",
            value: category ?? "",
            options: [
              { value: "", label: "All types" },
              ...stats.byCategory.map((entry) => ({
                value: entry.key,
                label: entry.label,
                count: entry.count,
              })),
            ],
          },
        ]}
        onFilterChange={setFilter}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: source === "drive" ? "Search linked files…" : "Search files…",
          label: "Search storage",
        }}
        view={{
          value: view,
          onChange: (value) => setView(value as "files" | "objects"),
          options: [
            { value: "files", label: "Files", icon: VIEW_ICONS.list },
            { value: "objects", label: "Untracked", icon: VIEW_ICONS.grid },
          ],
        }}
        actions={
          <Link href="/resources">
            <Button variant="outline" size="sm">
              <FolderOpen /> Manage files
            </Button>
          </Link>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Supabase — never mixed with Drive figures                          */}
      {/* ------------------------------------------------------------------ */}
      {showSupabase ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            icon={Database}
            title="Supabase"
            subtitle="Files uploaded to Supabase Storage"
            badge={`${stats.fileCount} files`}
          />

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{formatFileSize(stats.usedBytes)} used (tracked)</h3>
              <span className={cn("text-xs font-medium", HEALTH_TONE[health])}>
                {health === "unknown" ? "No account-level quota reported" : health}
              </span>
            </div>

              {stats.byCategory.length > 0 ? (
                <>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {stats.byCategory.map((entry) => (
                      <div
                        key={entry.key}
                        title={`${entry.label}: ${formatFileSize(entry.sizeBytes)}`}
                        style={{
                          width: `${shareOf(entry.sizeBytes, stats.usedBytes) * 100}%`,
                          backgroundColor: categoryColors[entry.key] ?? "var(--primary)",
                        }}
                      />
                    ))}
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {bySizeDescending(stats.byCategory).map((entry) => {
                      const Icon = categoryIcons[entry.key] ?? File;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() =>
                            setFilter("category", category === entry.key ? "" : entry.key)
                          }
                          aria-pressed={category === entry.key}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition hover:bg-accent/50",
                            category === entry.key && "border-primary/40 bg-primary/5"
                          )}
                        >
                          <Icon
                            className="size-4 shrink-0"
                            style={{ color: categoryColors[entry.key] ?? "var(--primary)" }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {percentOf(entry.sizeBytes, stats.usedBytes)}%
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {entry.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing uploaded yet. Files you attach to a project or task land here.
                </p>
              )}
            </article>

            <article className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Database className="size-4" /> Database &amp; storage
              </h3>
              <dl className="flex flex-col gap-1.5 text-xs">
                <Row label="Database (Postgres)">
                  {storageReport?.databaseBytes !== null && storageReport?.databaseBytes !== undefined
                    ? formatFileSize(storageReport.databaseBytes)
                    : "Unavailable"}
                </Row>
                <Row label="Storage (total)">
                  {storageReport ? formatFileSize(storageReport.storageBytes) : "Unavailable"}
                </Row>
                <Row label="Storage objects (total)">
                  {storageReport ? storageReport.storageObjects : "—"}
                </Row>
                <Row label="Name">{bucket.name}</Row>
                <Row label="Visibility">{bucket.public ? "Public" : "Private"}</Row>
                <Row label="Stored (bucket)">
                  {bucket.unavailable ? (
                    <span className="text-warning">Could not read</span>
                  ) : (
                    `${formatFileSize(bucket.storedBytes)} · ${bucket.storedCount} objects`
                  )}
                </Row>
                <Row label="Largest object">
                  {bucket.unavailable ? "—" : formatFileSize(bucket.largestObjectBytes)}
                </Row>
                <Row label="Per-object limit">
                  {bucket.fileSizeLimitBytes
                    ? formatFileSize(bucket.fileSizeLimitBytes)
                    : "Not set"}
                </Row>
                <Row label="Allowed MIME types">
                  {bucket.allowedMimeTypes?.length ? bucket.allowedMimeTypes.join(", ") : "Any"}
                </Row>
                <Row label="Bucket report">
                  {storageReport?.error ? "Unavailable (RPC error)" : storageReport?.buckets && storageReport.buckets.length > 0 ? storageReport.buckets.map(b => `${b.bucket}:${formatFileSize(b.bytes)}`).join(", ") : "—"}
                </Row>
              </dl>

              {bucketConfigError ? (
                <p className="text-[11px] text-muted-foreground">
                  Bucket settings unavailable: {bucketConfigError}
                </p>
              ) : null}

              {orphans.unavailable ? (
                <p className="text-[11px] text-warning">
                  Could not compare stored objects against tracked files.
                </p>
              ) : orphans.orphanCount > 0 ? (
                <div className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    {orphans.orphanCount} object{orphans.orphanCount === 1 ? "" : "s"} (
                    {formatFileSize(orphans.orphanBytes)}) exist in the bucket with no file record —
                    nothing in the app can reach them.
                  </span>
                </div>
              ) : null}
            </article>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Google Drive — separate totals, real quota only                     */}
      {/* ------------------------------------------------------------------ */}
      {showDrive ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            icon={Cloud}
            title="Google Drive"
            subtitle="Quota reported by Drive itself"
            badge={drive.configured ? `${drive.accounts.length} accounts` : "Not configured"}
          />

          {!drive.configured ? (
            <div className="rounded-xl border border-dashed p-4">
              <p className="text-sm text-muted-foreground">{drive.error}</p>
              <Link href="/gdrive" className="mt-2 inline-block">
                <Button variant="outline" size="sm">
                  <ExternalLink /> Set up Drive
                </Button>
              </Link>
            </div>
          ) : drive.usage.accounts.length === 0 ? (
            <EmptyState
              icon={Cloud}
              title="No Drive account linked"
              description="Connect a Google account to browse its folders and link files into your projects."
              action={
                <Link href="/gdrive">
                  <Button>
                    <Cloud /> Connect Google Drive
                  </Button>
                </Link>
              }
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {formatFileSize(drive.usage.totalQuotaUsed)} used across{" "}
                    {drive.usage.accounts.filter((a) => a.quotaLimit !== null).length} account(s)
                  </h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {drive.usage.totalQuotaLimit > 0
                      ? `${drivePercent}% of ${formatFileSize(drive.usage.totalQuotaLimit)}`
                      : "Quota unavailable"}
                  </span>
                </div>

                {drive.usage.totalQuotaLimit > 0 ? (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        drivePercent >= 95 ? "bg-destructive" : "bg-primary"
                      )}
                      style={{ width: `${drivePercent}%` }}
                    />
                  </div>
                ) : null}

                {drive.usage.unavailable > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {drive.usage.unavailable} account(s) could not be read and are excluded from
                    this total.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {drive.usage.accounts.map((account, index) => (
                  <article
                    key={account.connectionId}
                    className="flex flex-col gap-2 rounded-xl border bg-card p-3.5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          account.status === "active"
                            ? "bg-success/12 text-success"
                            : "bg-destructive/12 text-destructive"
                        )}
                      >
                        <Cloud className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {index + 1}. {account.label || account.email}
                        </p>
                        {account.label ? (
                          <p className="truncate text-[11px] text-muted-foreground">{account.email}</p>
                        ) : null}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize",
                          account.status !== "active" && "bg-destructive/12 text-destructive"
                        )}
                      >
                        {account.status}
                      </Badge>
                    </div>

                    <dl className="flex flex-col gap-1 text-xs">
                      <Row label="Used">
                        {account.quotaUsed === null ? (
                          <span className="text-muted-foreground">Unavailable</span>
                        ) : (
                          formatFileSize(account.quotaUsed)
                        )}
                      </Row>
                      <Row label="Limit">
                        {account.quotaLimit === null
                          ? "Unavailable"
                          : formatFileSize(account.quotaLimit)}
                      </Row>
                      {account.sharedDriveLimit ? (
                        <Row label="Shared drives">
                          {formatFileSize(account.sharedDriveUsed ?? 0)} of{" "}
                          {formatFileSize(account.sharedDriveLimit)}
                        </Row>
                      ) : null}
                      <Row label="Linked here">
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="size-3" />
                          {account.linkedCount} file{account.linkedCount === 1 ? "" : "s"} ·{" "}
                          {formatFileSize(account.linkedBytes)}
                        </span>
                      </Row>
                    </dl>

                    {account.quotaLimit && account.quotaUsed !== null ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            clampedPercent(account.quotaUsed, account.quotaLimit) >= 95
                              ? "bg-destructive"
                              : "bg-primary"
                          )}
                          style={{
                            width: `${clampedPercent(account.quotaUsed, account.quotaLimit)}%`,
                          }}
                        />
                      </div>
                    ) : null}

                    {account.error ? (
                      <p className="text-[11px] text-destructive">{account.error}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* File listing                                                        */}
      {/* ------------------------------------------------------------------ */}
      {showSupabase ? (
        <section className="flex flex-col gap-2">
          <SectionHeading
            icon={File}
            title={view === "objects" ? "Untracked bucket objects" : category ? `${category} files` : "Recent files"}
            subtitle={
              view === "objects"
                ? "Present in the bucket with no matching file record"
                : "Everything the app still tracks"
            }
            badge={
              view === "objects"
                ? `${untracked.objects.length} objects`
                : `${filteredFiles.length} files`
            }
          />

          {view === "objects" ? (
            filteredObjects.length === 0 ? (
              <EmptyState
                icon={Check}
                title="No untracked objects"
                description="Every object in the bucket has a matching file record."
              />
            ) : (
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {filteredObjects.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center gap-3 border-b border-border/50 p-3 text-sm last:border-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/12 text-warning">
                      <FileQuestion className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatFileSize(entry.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : filteredFiles.length === 0 ? (
            <EmptyState
              icon={Search}
              title={category ? `No ${category.toLowerCase()} files` : "No files yet"}
              description={
                category
                  ? "Try a different type filter."
                  : "Files attached to a project or task show up here."
              }
              action={
                category ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      router.push(pathname);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/resources">
                    <Button>
                      <FolderOpen /> Upload a file
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {filteredFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-3 border-b border-border/50 p-3 text-sm transition last:border-0 hover:bg-accent/30"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${categoryColors[file.category] ?? "var(--primary)"} 14%, transparent)`,
                      color: categoryColors[file.category] ?? "var(--primary)",
                    }}
                  >
                    <File className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {file.mime_type ?? "Unknown type"} · {formatDateShort(file.created_at)}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatFileSize(file.size_bytes ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: typeof Database;
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-2 px-1">
      <Icon className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] tabular-nums">
        {badge}
      </Badge>
    </header>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words tabular-nums">{children}</dd>
    </div>
  );
}

