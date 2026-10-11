"use client";

import * as React from "react";
import { FolderOpen, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listGDriveFilesAction } from "@/lib/actions/gdrive";
import { formatFileSize } from "@/lib/format";
import { cn } from "cn";
import type { DriveItem } from "@/lib/gdrive";
import type { GDriveConnection } from "@/types";

export type PickedDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  webLink: string | null;
};

type BrowseResult = {
  /** Which account + folder + query these rows belong to. */
  key: string;
  items: DriveItem[];
  nextPageToken: string | null;
  error: string | null;
};

const EMPTY: BrowseResult = { key: "", items: [], nextPageToken: null, error: null };

/**
 * Google Drive file picker.
 *
 * A compact folder browser rather than a full Drive view: it exists to choose
 * one file, so folders are drilled into, search runs against Drive's own `q`
 * grammar, and paging is threaded through so a folder larger than one response
 * stays reachable.
 *
 * Results carry the key they were fetched for and are only shown when it still
 * matches, so switching account or drilling into a folder never paints the
 * previous folder's files under the new heading.
 */
export function DriveFilePicker({
  accounts,
  connectionId,
  pickedFileId,
  onChange,
  error,
}: {
  accounts: GDriveConnection[];
  /** The account whose files are being browsed. */
  connectionId: string | null;
  /** The file currently chosen, so the right row reads as selected. */
  pickedFileId?: string | null;
  onChange: (
    value: { connectionId: string | null; file: PickedDriveFile | null }
  ) => void;
  error?: string;
}) {
  const [result, setResult] = React.useState<BrowseResult>(EMPTY);
  const [crumbs, setCrumbs] = React.useState<Array<{ id: string; name: string }>>([]);
  const [searchInput, setSearchInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const parentId = crumbs.length > 0 ? crumbs[crumbs.length - 1].id : null;
  const browseKey = connectionId
    ? `${connectionId}|${parentId ?? "root"}|${query}`
    : null;

  React.useEffect(() => {
    if (!browseKey || !connectionId) return;

    let cancelled = false;

    void (async () => {
      // Inside the async body, so the loading flag is set after the effect has
      // already returned rather than cascading a render through it.
      setLoading(true);
      const response = await listGDriveFilesAction({
        connectionId,
        parentId,
        query: query || undefined,
        pageSize: 50,
      });
      if (cancelled) return;
      setLoading(false);
      setResult(
        response.ok
          ? {
              key: browseKey,
              items: response.data.items,
              nextPageToken: response.data.nextPageToken,
              error: null,
            }
          : {
              key: browseKey,
              items: [],
              nextPageToken: null,
              error: response.error,
            }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [browseKey, connectionId, parentId, query]);

  const ready = browseKey !== null && result.key === browseKey;
  const items = ready ? result.items : [];
  const pageToken = ready ? result.nextPageToken : null;
  const browseError = ready ? result.error : null;

  async function loadMore() {
    if (!connectionId || !pageToken) return;
    setLoading(true);
    const response = await listGDriveFilesAction({
      connectionId,
      parentId,
      query: query || undefined,
      pageToken,
      pageSize: 50,
    });
    setLoading(false);
    if (!response.ok) {
      setResult({ key: browseKey ?? "", items: [], nextPageToken: null, error: response.error });
      return;
    }
    const key = browseKey ?? "";
    setResult((current) =>
      current.key === key
        ? {
            ...current,
            items: [...current.items, ...response.data.items],
            nextPageToken: response.data.nextPageToken,
          }
        : {
            key,
            items: response.data.items,
            nextPageToken: response.data.nextPageToken,
            error: null,
          }
    );
  }

  function drillInto(item: DriveItem) {
    setCrumbs((current) => [...current, { id: item.id, name: item.name }]);
  }

  /**
   * Google-native Docs/Sheets/Slides have no bytes and cannot be attached as a
   * file, so they stay visible but unselectable — picking one would silently
   * produce a link rather than the file the user thought they had chosen.
   */
  function pick(item: DriveItem) {
    if (!connectionId || item.isFolder || item.isGoogleDoc) return;
    onChange({
      connectionId,
      file: {
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size ? Number(item.size) : null,
        webLink: item.webViewLink ?? item.webContentLink,
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Google account"
          value={connectionId ?? ""}
          onChange={(event) => {
            setCrumbs([]);
            onChange({ connectionId: event.target.value || null, file: null });
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
        >
          <option value="">Choose an account…</option>
          {accounts.map((account) => (
            <option
              key={account.id}
              value={account.id}
              disabled={account.status !== "active"}
            >
              {account.label ?? account.account_email}
              {account.status !== "active" ? " (needs reconnect)" : ""}
            </option>
          ))}
        </select>

        <div className="relative min-w-40 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setQuery(event.target.value);
              setCrumbs([]);
            }}
            placeholder="Search this Drive…"
            aria-label="Search Google Drive"
            className="h-8 pl-8"
            disabled={!connectionId}
          />
        </div>
      </div>

      {crumbs.length > 0 ? (
        <nav aria-label="Drive folder" className="flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setCrumbs([])}
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Drive root
          </button>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              <span className="text-muted-foreground/50">/</span>
              <button
                type="button"
                onClick={() => setCrumbs((current) => current.slice(0, index + 1))}
                className="max-w-40 truncate rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
      ) : null}

      <div className="relative min-h-40 overflow-hidden rounded-lg border">
        {loading && !ready ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : browseError ? (
          <p className="px-3 py-6 text-center text-sm text-destructive">{browseError}</p>
        ) : !connectionId ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Choose a connected Google account to browse its files.
          </p>
        ) : !ready ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query ? `Nothing in this Drive matches “${query}”.` : "This folder is empty."}
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {items.map((item) => {
              const selectable = !item.isFolder && !item.isGoogleDoc;
              const picked = pickedFileId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!selectable}
                    onClick={() => (item.isFolder ? drillInto(item) : pick(item))}
                    className={cn(
                      "flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-sm transition last:border-0",
                      selectable ? "hover:bg-accent/40" : "cursor-not-allowed opacity-50",
                      picked && "bg-primary/10"
                    )}
                  >
                    {item.isFolder ? (
                      <FolderOpen className="size-4 shrink-0 text-amber-500" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-primary/60"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.isGoogleDoc ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Google Doc
                      </Badge>
                    ) : item.size ? (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatFileSize(Number(item.size))}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pageToken ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={loadMore}
          disabled={loading}
          className="self-start"
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}