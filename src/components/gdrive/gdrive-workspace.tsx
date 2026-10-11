"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  HardDriveDownload,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Unplug,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar } from "@/components/shared/workspace-toolbar";
import {
  attachDriveFileAction,
  createGDriveFolderAction,
  disconnectGDriveAction,
  getGDriveQuotaAction,
  listGDriveFilesAction,
  removeDriveFileRefAction,
  renameGDriveAccountAction,
  reconnectGDriveAccountAction,
  startGDriveAuthAction,
  trashGDriveFileAction,
} from "@/lib/actions/gdrive";
import type { GDriveLinkedFile, GDriveLinkSummary } from "@/lib/dal/gdrive";
import type { DriveItem, DriveQuota } from "@/lib/gdrive";
import { formatFileSize, formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import type { GDriveConnection, Project } from "@/types";

type Crumb = { id: string; name: string };

const PAGE_SIZE = 100;

/**
 * Google Drive.
 *
 * Every linked account is browsable independently — the previous version
 * hard-capped users at one (the table's primary key was `user_id`, so a second
 * account silently replaced the first) and threw away Drive's `nextPageToken`,
 * making anything past the first 100 items in a folder unreachable.
 *
 * Adding an account by email cannot grant access on its own: Google still has
 * to prove the person controls the account. The entered address is checked
 * against the account Google returns, and a mismatch is refused rather than
 * quietly connecting whichever account happened to be signed in.
 */
export function GDriveWorkspace({
  configured,
  accounts,
  error,
  fileRefs,
  linkSummary,
  projects,
  supabaseStorage,
  notice,
}: {
  configured: boolean;
  accounts: GDriveConnection[];
  error: string | null;
  fileRefs: GDriveLinkedFile[];
  linkSummary: GDriveLinkSummary;
  projects: Project[];
  supabaseStorage: { usedBytes: number; fileCount: number } | null;
  notice: { kind: "success" | "error"; message: string } | null;
}) {
  const router = useRouter();

  // `undefined` rather than "" so React remounts the browser subtree when the
  // selection moves to a different account, instead of resetting it via an
  // effect and flashing the previous Drive's folders under the new name.
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | undefined>(
    undefined
  );

  const activeAccountId = accounts[0]?.id ?? "";
  const effectiveAccountId =
    accounts.find((account) => account.id === selectedAccountId)?.id ?? activeAccountId;
  const account = accounts.find((entry) => entry.id === effectiveAccountId) ?? null;

  const [quota, setQuota] = React.useState<DriveQuota | null>(null);
  const [quotaError, setQuotaError] = React.useState<string | null>(null);
  // Fetching the account's real quota from Drive is synchronising with an
  // external system, which is what an effect is for. Every state update is
  // deferred out of the effect body — a synchronous setState here would
  // cascade a render on every mount.
  React.useEffect(() => {
    let cancelled = false;

    const id = window.setTimeout(() => {
      if (!account || account.status !== "active") {
        setQuota(null);
        setQuotaError(null);
        return;
      }

      void (async () => {
        const result = await getGDriveQuotaAction(account.id);
        if (cancelled) return;
        if (result.ok) {
          setQuota(result.data.quota);
          setQuotaError(null);
        } else {
          setQuota(null);
          setQuotaError(result.error);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [account]);

  const statItems: StatStripItem[] = [
    {
      id: "accounts",
      label: "Linked accounts",
      value: accounts.length,
      icon: Cloud,
      tone: accounts.length > 0 ? "success" : "warning",
      hint: `${accounts.filter((entry) => entry.status === "active").length} active`,
    },
    {
      id: "drive",
      label: "Drive used",
      value: quota ? Math.round((quota.used / Math.max(quota.limit, 1)) * 100) : 0,
      icon: HardDrive,
      tone: "info",
      hint: quota ? `${formatFileSize(quota.used)} of ${formatFileSize(quota.limit)}` : "Sign in to read",
    },
    {
      id: "linked",
      label: "Linked files",
      value: linkSummary.total,
      icon: Link2,
      tone: "neutral",
      hint: `${formatFileSize(linkSummary.linkedBytes)} linked`,
    },
    {
      id: "shared",
      label: "Shared links",
      value: linkSummary.byTarget.projects + linkSummary.byTarget.tasks + linkSummary.byTarget.notes,
      icon: Users,
      tone: "warning",
      hint: `${linkSummary.byTarget.unlinked} unlinked`,
    },
    {
      id: "app",
      label: "App files",
      value: supabaseStorage?.fileCount ?? 0,
      icon: HardDriveDownload,
      tone: "info",
      // No percentage: the app has no real storage ceiling to divide by, and
      // inventing one would show a number that means nothing.
      hint: supabaseStorage ? `${formatFileSize(supabaseStorage.usedBytes)} stored` : "—",
    },
  ];

  if (!configured) {
    return (
      <div className="flex flex-col gap-4">
        <StatStrip items={statItems} />
        <Notice kind="error" message={error ?? "Google Drive is not configured."} />
        <EmptyState
          icon={AlertTriangle}
          title="Google Drive is not configured"
          description="Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment, with this app's origin registered as an authorised redirect URI in the Google Cloud console."
        />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <StatStrip items={statItems} />
        {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
        <AddAccountCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} />

      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <AccountSwitcher
        accounts={accounts}
        activeId={effectiveAccountId}
        quota={quota}
        quotaError={quotaError}
        onSelect={setSelectedAccountId}
        onChanged={() => router.refresh()}
      />

      {account && account.status !== "active" ? (
        <Notice
          kind="error"
          message={
            account.last_error ??
            `Access to ${account.account_email} was withdrawn. Reconnect it to browse again.`
          }
        />
      ) : null}

      {account?.status === "active" ? (
        <DriveBrowser
          // Remounting per account is what scopes the folder path, search and
          // listing to that Drive.
          key={account.id}
          account={account}
          projects={projects}
          accounts={accounts}
          onChanged={() => router.refresh()}
        />
      ) : null}

      <LinkedFiles files={fileRefs} onRemoved={() => router.refresh()} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function AccountSwitcher({
  accounts,
  activeId,
  quota,
  quotaError,
  onSelect,
  onChanged,
}: {
  accounts: GDriveConnection[];
  activeId: string;
  quota: DriveQuota | null;
  quotaError: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2 px-1">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Linked accounts
        </h3>
        <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] tabular-nums">
          {accounts.length}
        </Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((entry) => (
          <AccountCard
            // Keyed by status too, so a revoked-then-reconnected account
            // rebuilds rather than keeping stale actions.
            key={`${entry.id}:${entry.status}`}
            account={entry}
            active={entry.id === activeId}
            quota={entry.id === activeId ? quota : null}
            quotaError={entry.id === activeId ? quotaError : null}
            onSelect={() => onSelect(entry.id)}
            onChanged={onChanged}
          />
        ))}
      </div>

      <AddAccountCard />
    </section>
  );
}

function AccountCard({
  account,
  active,
  quota,
  quotaError,
  onSelect,
  onChanged,
}: {
  account: GDriveConnection;
  active: boolean;
  quota: DriveQuota | null;
  quotaError: string | null;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [label, setLabel] = React.useState(account.label ?? "");
  const [pending, startTransition] = useTransition();

  const healthy = account.status === "active";
  const percent = quota && quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition",
        active && "border-primary ring-2 ring-primary/20",
        !healthy && "opacity-80"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            healthy ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
          )}
        >
          <Cloud className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={account.account_email}>
            {account.label || account.account_email}
          </p>
          {account.label ? (
            <p className="truncate text-[11px] text-muted-foreground">{account.account_email}</p>
          ) : null}
        </div>

        <Badge
          variant="secondary"
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize",
            !healthy && "bg-destructive/12 text-destructive"
          )}
        >
          {account.status}
        </Badge>
      </div>

      {quota ? (
        <QuotaBar quota={quota} percent={percent} />
      ) : quotaError ? (
        <p className="text-[11px] text-muted-foreground">{quotaError}</p>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        Connected {formatRelativeTime(account.last_connected_at ?? account.connected_at)}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1">
        {!active ? (
          <Button variant="outline" size="sm" onClick={onSelect}>
            Browse
          </Button>
        ) : null}

        {!renaming ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLabel(account.label ?? "");
              setRenaming(true);
            }}
          >
            Rename
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={account.account_email}
              className="h-7 w-32"
              autoFocus
            />
            <Button
              size="sm"
              aria-label="Save name"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await renameGDriveAccountAction(account.id, label);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  setRenaming(false);
                  onChanged();
                })
              }
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel rename"
              onClick={() => setRenaming(false)}
            >
              <X />
            </Button>
          </div>
        )}

        {!healthy ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await reconnectGDriveAccountAction(account.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                // The stale row is gone; the next step is Google's consent screen.
                const auth = await startGDriveAuthAction(result.data.email);
                if (!auth.ok) {
                  toast.error(auth.error);
                  return;
                }
                window.location.href = auth.data.url;
              })
            }
          >
            Reconnect
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Unplug /> Disconnect
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disconnect ${account.account_email}?`}
        description="Files linked from this account stay in your workspace, but they will no longer be downloadable."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          startTransition(async () => {
            const result = await disconnectGDriveAction(account.id);
            setConfirming(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Account disconnected.");
            onChanged();
          });
        }}
      />
    </article>
  );
}

function QuotaBar({ quota, percent }: { quota: DriveQuota; percent: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatFileSize(quota.used)} used</span>
        <span className="tabular-nums">
          {Math.round(percent)}% of {formatFileSize(quota.limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", percent > 90 ? "bg-destructive" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {quota.sharedLimit && quota.sharedUsed !== null ? (
        <p className="text-[10px] text-muted-foreground">
          Shared drives: {formatFileSize(quota.sharedUsed)} of{" "}
          {formatFileSize(quota.sharedLimit)}
        </p>
      ) : null}
    </div>
  );
}

function AddAccountCard() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3.5">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Add another account</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Enter the Google account you want to browse. You will be sent to Google to approve access
        to that account — an email on its own cannot open someone else&rsquo;s Drive.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await startGDriveAuthAction(email);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            window.location.href = result.data.url;
          });
        }}
      >
        <FormField label="Google account email" className="min-w-56 flex-1">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
        </FormField>

        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Connect
        </Button>
      </form>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser — one per account, remounted when the selection changes
// ---------------------------------------------------------------------------

function DriveBrowser({
  account,
  projects,
  accounts,
  onChanged,
}: {
  account: GDriveConnection;
  projects: Project[];
  accounts: GDriveConnection[];
  onChanged: () => void;
}) {
  const [files, setFiles] = React.useState<DriveItem[]>([]);
  const [pageToken, setPageToken] = React.useState<string | null>(null);
  const [crumbs, setCrumbs] = React.useState<Crumb[]>([]);
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [filesOnly, setFilesOnly] = React.useState(false);
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [browserError, setBrowserError] = React.useState<string | null>(null);
  const [addingFolder, setAddingFolder] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [linking, setLinking] = React.useState<DriveItem | null>(null);

  const parentId = crumbs.length > 0 ? crumbs[crumbs.length - 1].id : null;

  // Drive's `q` grammar is string-based, so an empty search must not be sent
  // as "contains ''" — the owner filter only makes sense alongside a term,
  // because Drive only surfaces `sharedWithMe` results in that case.
  const effectiveOwner = query ? ownerEmail : "";

  React.useEffect(() => {
    let cancelled = false;
    // Deferred so the fetch is not a synchronous setState in the effect body.
    const id = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        const result = await listGDriveFilesAction({
          connectionId: account.id,
          parentId,
          query: query || undefined,
          filesOnly,
          ownerEmail: effectiveOwner || undefined,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setLoading(false);
        if (!result.ok) {
          setBrowserError(result.error);
          setFiles([]);
          return;
        }
        setBrowserError(null);
        setFiles(result.data.items);
        setPageToken(result.data.nextPageToken);
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [account.id, parentId, query, filesOnly, effectiveOwner]);

  async function loadMore() {
    if (!pageToken) return;
    setLoading(true);
    const result = await listGDriveFilesAction({
      connectionId: account.id,
      parentId,
      query: query || undefined,
      filesOnly,
      ownerEmail: effectiveOwner || undefined,
      pageToken,
      pageSize: PAGE_SIZE,
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFiles((current) => [...current, ...result.data.items]);
    setPageToken(result.data.nextPageToken);
  }

  const totalVisibleBytes = files.reduce((sum, item) => sum + Number(item.size ?? 0), 0);
  const folderCount = files.filter((item) => item.isFolder).length;

  return (
    <>
      <WorkspaceToolbar
        search={{
          value: searchInput,
          onChange: (value) => {
            setSearchInput(value);
            setQuery(value);
          },
          placeholder: "Search this Drive…",
          label: "Search Drive",
        }}
        filters={[
          {
            param: "owner",
            label: "Shared by",
            value: ownerEmail,
            options: [
              { value: "", label: "Anyone" },
              ...accounts.map((entry) => ({
                value: entry.account_email,
                label: entry.account_email,
              })),
            ],
          },
        ]}
        onFilterChange={(_param, value) => setOwnerEmail(value)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setFilesOnly((value) => !value)}
              aria-pressed={filesOnly}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
                filesOnly
                  ? "border-primary/40 bg-primary/5"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              Files only
            </button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFiles([]);
                setPageToken(null);
                setCrumbs([]);
                setQuery("");
                setSearchInput("");
                setOwnerEmail("");
              }}
              disabled={loading}
            >
              <RefreshCw /> Reset
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFolderName("");
                setAddingFolder(true);
              }}
            >
              <FolderPlus /> New folder
            </Button>
          </>
        }
      />

      <Breadcrumbs
        crumbs={crumbs}
        onNavigate={(index) => setCrumbs((current) => current.slice(0, index + 1))}
        onHome={() => setCrumbs([])}
      />

      {browserError ? <Notice kind="error" message={browserError} /> : null}

      {files.length === 0 && !loading ? (
        <EmptyState
          icon={Search}
          title={query ? "Nothing matched" : "This folder is empty"}
          description={
            query
              ? "Try a different search term, or clear the “Shared by” filter."
              : "Create a folder here, or pick a different one from the breadcrumb."
          }
          action={
            query ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput("");
                  setQuery("");
                  setOwnerEmail("");
                }}
              >
                Clear search
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((item) => (
              <DriveItemCard
                key={item.id}
                item={item}
                connectionId={account.id}
                onOpenFolder={(entry) =>
                  setCrumbs((current) => [...current, { id: entry.id, name: entry.name }])
                }
                onLink={setLinking}
                onTrash={async (entry) => {
                  const result = await trashGDriveFileAction({
                    connectionId: account.id,
                    fileId: entry.id,
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(`“${entry.name}” moved to Drive trash.`);
                  setFiles((current) => current.filter((file) => file.id !== entry.id));
                  onChanged();
                }}
              />
            ))}
          </div>

          {pageToken ? (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" disabled={loading} onClick={() => void loadMore()}>
                {loading ? <Loader2 className="animate-spin" /> : null} Load more
              </Button>
            </div>
          ) : (
            files.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {files.length} item{files.length === 1 ? "" : "s"} · {folderCount} folder
                {folderCount === 1 ? "" : "s"} · {formatFileSize(totalVisibleBytes)}
              </p>
            )
          )}
        </div>
      )}

      <NewFolderDialog
        open={addingFolder}
        onOpenChange={setAddingFolder}
        name={folderName}
        onNameChange={setFolderName}
        onCreate={async () => {
          const result = await createGDriveFolderAction({
            connectionId: account.id,
            name: folderName,
            parentId,
          });
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(`Folder “${result.data.item.name}” created.`);
          setAddingFolder(false);
          setFolderName("");
          // Re-runs the listing effect through a changed breadcrumb target.
          setCrumbs((current) => [...current]);
          return true;
        }}
      />

      <LinkDialog
        // Keyed so switching between files remounts with a clean target
        // instead of resyncing state through an effect.
        key={linking?.id ?? "none"}
        item={linking}
        connectionId={account.id}
        projects={projects}
        onClose={() => setLinking(null)}
        onLinked={() => {
          setLinking(null);
          onChanged();
        }}
      />
    </>
  );
}

function Breadcrumbs({
  crumbs,
  onNavigate,
  onHome,
}: {
  crumbs: Crumb[];
  onNavigate: (index: number) => void;
  onHome: () => void;
}) {
  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={onHome}
        className="rounded px-1.5 py-0.5 font-medium hover:bg-accent"
      >
        My Drive
      </button>
      {crumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id}>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => onNavigate(index)}
            className={cn(
              "max-w-48 truncate rounded px-1.5 py-0.5 hover:bg-accent",
              index === crumbs.length - 1 && "font-medium"
            )}
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

/**
 * Picks the right glyph for a Drive item.
 *
 * Declared as a component rather than returning a component type from a
 * helper, because a component created during render is treated as new on every
 * pass and remounts its subtree.
 */
function DriveIcon({ item }: { item: DriveItem }) {
  if (item.isFolder) return <Folder className="size-4" />;
  if (item.isGoogleDoc) return <Cloud className="size-4" />;
  if (item.mimeType === "application/pdf") return <FileText className="size-4" />;
  return <File className="size-4" />;
}

function DriveItemCard({
  item,
  connectionId,
  onOpenFolder,
  onLink,
  onTrash,
}: {
  item: DriveItem;
  connectionId: string;
  onOpenFolder: (item: DriveItem) => void;
  onLink: (item: DriveItem) => void;
  onTrash: (item: DriveItem) => Promise<void>;
}) {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <article className="group flex items-center gap-2.5 rounded-xl border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          item.isFolder ? "bg-info/12 text-info" : "bg-muted text-muted-foreground"
        )}
      >
        <DriveIcon item={item} />
      </span>

      <div className="min-w-0 flex-1">
        {item.isFolder ? (
          <button
            type="button"
            onClick={() => onOpenFolder(item)}
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          >
            {item.name}
          </button>
        ) : (
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
        )}

        <p className="truncate text-[11px] text-muted-foreground">
          {item.isFolder ? "Folder" : item.size ? formatFileSize(Number(item.size)) : "Google doc"}
          {item.modifiedTime ? ` · ${formatRelativeTime(item.modifiedTime)}` : ""}
          {item.shared ? (
            <span className="ml-1 inline-flex items-center gap-0.5">
              <Users className="size-3" /> shared
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {item.webViewLink ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${item.name} in Drive`}
            render={
              <a href={item.webViewLink} target="_blank" rel="noreferrer noopener" />
            }
          >
            <ExternalLink className="size-3.5" />
          </Button>
        ) : null}

        {!item.isFolder && !item.isGoogleDoc ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${item.name}`}
            render={
              <a
                href={`/api/gdrive/download?fileId=${encodeURIComponent(item.id)}&connectionId=${encodeURIComponent(connectionId)}`}
              />
            }
          >
            <Download className="size-3.5" />
          </Button>
        ) : null}

        {!item.isFolder ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Link ${item.name} into your workspace`}
            onClick={() => onLink(item)}
          >
            <Link2 className="size-3.5" />
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${item.name} to Drive trash`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-3.5 opacity-0 transition group-hover:opacity-70" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Move “${item.name}” to Drive trash?`}
        description="It moves to the Drive trash and can be restored from Google Drive."
        confirmLabel="Move to trash"
        onConfirm={async () => {
          setConfirming(false);
          await onTrash(item);
        }}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Linked files
// ---------------------------------------------------------------------------

function LinkedFiles({
  files,
  onRemoved,
}: {
  files: GDriveLinkedFile[];
  onRemoved: () => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [pending, startTransition] = useTransition();

  // Derived, not pruned: anything off screen is simply absent from the set.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(files.map((file) => file.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, files]);

  function targetLabel(file: GDriveLinkedFile): string {
    if (file.project_name) return file.project_name;
    if (file.task_title) return file.task_title;
    if (file.note_title) return file.note_title;
    return "Not linked anywhere";
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center gap-2 px-1">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Linked into your workspace
        </h3>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {files.length}
        </span>
      </header>

      {files.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No linked files yet"
          description="Use the link button on any Drive file to attach it to a project, task or note."
        />
      ) : (
        <>
          {effectiveSelected.size > 0 ? (
            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
              <span className="px-1 text-sm font-medium">{effectiveSelected.size} selected</span>
              <div className="h-4 w-px bg-border" />
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => setBulkDeleting(true)}
              >
                <Trash2 /> Unlink
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setSelected(new Set())}
              >
                <X /> Clear
              </Button>
            </div>
          ) : null}

          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {files.map((file) => (
              <li
                key={file.id}
                className="group flex items-center gap-3 border-b border-border/50 p-3 transition last:border-0 hover:bg-accent/30"
              >
                <Checkbox
                  checked={selected.has(file.id)}
                  onCheckedChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(file.id)) next.delete(file.id);
                      else next.add(file.id);
                      return next;
                    })
                  }
                  aria-label={`Select ${file.drive_name}`}
                  className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
                />

                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <File className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.drive_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {targetLabel(file)}
                    {file.account_email ? ` · ${file.account_email}` : ""}
                    {file.size_bytes ? ` · ${formatFileSize(Number(file.size_bytes))}` : ""}
                    {file.modified_at ? ` · ${formatRelativeTime(file.modified_at)}` : ""}
                  </p>
                </div>

                {file.web_link ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Open ${file.drive_name} in Drive`}
                    render={<a href={file.web_link} target="_blank" rel="noreferrer noopener" />}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                ) : null}

                {file.connection_id ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Download ${file.drive_name}`}
                    render={
                      <a
                        href={`/api/gdrive/download?fileId=${encodeURIComponent(file.drive_file_id)}&connectionId=${encodeURIComponent(file.connection_id)}`}
                      />
                    }
                  >
                    <Download className="size-3.5" />
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unlink ${file.drive_name}`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeDriveFileRefAction(file.id);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("File unlinked.");
                      onRemoved();
                    })
                  }
                >
                  <Trash2 className="size-3.5 opacity-0 transition group-hover:opacity-70" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Unlink ${effectiveSelected.size} file${effectiveSelected.size === 1 ? "" : "s"}?`}
        description="This only removes the link. The files stay in Google Drive."
        confirmLabel="Unlink"
        onConfirm={async () => {
          const ids = [...effectiveSelected];
          setBulkDeleting(false);
          startTransition(async () => {
            let failed = 0;
            for (const id of ids) {
              const result = await removeDriveFileRefAction(id);
              if (!result.ok) failed += 1;
            }
            if (failed > 0) toast.error(`${failed} could not be unlinked.`);
            else toast.success(`Unlinked ${ids.length} file${ids.length === 1 ? "" : "s"}.`);
            setSelected(new Set());
            onRemoved();
          });
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function NewFolderDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  onCreate: () => Promise<boolean>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a folder in Drive"
      description={name.trim() || "Untitled folder"}
      confirmLabel="Create folder"
      destructive={false}
      onConfirm={async () => {
        await onCreate();
      }}
    >
      <Input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Folder name"
        autoFocus
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          void onCreate();
        }}
      />
    </ConfirmDialog>
  );
}

function LinkDialog({
  item,
  connectionId,
  projects,
  onClose,
  onLinked,
}: {
  item: DriveItem | null;
  connectionId: string;
  projects: Project[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const [projectId, setProjectId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!item) return null;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Link “${item.name}”`}
      description="Attach this Drive file to a project so it shows up there."
      confirmLabel="Link file"
      destructive={false}
      onConfirm={async () => {
        startTransition(async () => {
          const result = await attachDriveFileAction({
            connectionId,
            item,
            projectId,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(
            result.data.alreadyLinked ? "Already linked to that project." : "File linked."
          );
          onLinked();
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <FormField label="Project">
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
          >
            <option value="">Link without a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </FormField>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="size-3" />
          {item.size ? formatFileSize(Number(item.size)) : "Google doc"} · {item.mimeType}
        </p>

        {pending ? (
          <p className="text-xs text-muted-foreground">Linking…</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}

function Notice({ kind, message }: { kind: "success" | "error"; message: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-sm",
        kind === "error"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-success/40 bg-success/5 text-success"
      )}
    >
      {kind === "error" ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}