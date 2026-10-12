"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  AlarmClock,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderKanban,
  Milestone,
  NotebookPen,
  BookOpen,
  Search,
  Sun,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { workspaceSearchAction, type PaletteHit } from "@/lib/actions/search";
import { allNavItems } from "@/config/navigation";
import type { LucideIcon } from "lucide-react";

const quickActions = [
  { label: "Create project", href: "/projects?new=1", icon: FolderKanban },
  { label: "Create task", href: "/tasks?new=1", icon: CheckSquare },
  { label: "Create note", href: "/notes?new=1", icon: NotebookPen },
  { label: "Add calendar event", href: "/calendar?new=1", icon: CalendarDays },
  { label: "Add reminder", href: "/reminders?new=1", icon: AlarmClock },
];

/** How each kind of workspace result is labelled. */
const KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  project: { label: "Projects", icon: FolderKanban },
  task: { label: "Tasks", icon: CheckSquare },
  note: { label: "Notes", icon: NotebookPen },
  wiki_page: { label: "Wiki", icon: BookOpen },
  daily_note: { label: "Daily notes", icon: Sun },
  file: { label: "Files", icon: FileText },
  milestone: { label: "Milestones", icon: Milestone },
};

const PALETTE_EVENT = "ownspece:open-command-palette";

/**
 * Opens the palette from anywhere.
 *
 * With a query, it opens *and* fills the box — that is how the topbar search
 * field and the Lab's search card reach it, so typing somewhere else and
 * pressing enter does not silently lose what was typed.
 */
export function openCommandPalette(query = "") {
  window.dispatchEvent(new CustomEvent<string>(PALETTE_EVENT, { detail: query }));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<PaletteHit[]>([]);
  const [searching, startSearch] = useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setQuery("");
        setOpen(!open);
      }
    }
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<string>).detail ?? "";
      setQuery(detail);
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Workspace search, debounced.
  //
  // Two characters is the floor: a single letter matches nearly every row in
  // seven tables and the list stops being useful.
  //
  // Every state change happens inside the timer or the await, never straight in
  // the effect body — that would re-render on each keystroke before the user had
  // finished typing. The request counter drops a reply that has been superseded,
  // so fast typing cannot leave the wrong names under the box; an AbortController
  // would not, because the server call is not actually wired to its signal.
  const latestRequest = React.useRef(0);

  React.useEffect(() => {
    const trimmed = query.trim();

    const timer = window.setTimeout(() => {
      if (trimmed.length < 2) {
        latestRequest.current += 1;
        setHits([]);
        return;
      }

      const ticket = ++latestRequest.current;
      startSearch(async () => {
        const result = await workspaceSearchAction(trimmed);
        if (ticket !== latestRequest.current || result.error) return;
        setHits(result.hits);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const q = query.trim().toLowerCase();
  // Page results only when there is nothing better to show — a list of fifteen
  // navigation links above fifteen real hits hides the hits.
  const navResults = q
    ? allNavItems.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 5)
    : allNavItems.slice(0, 8);
  const actionResults = q
    ? quickActions.filter((a) => a.label.toLowerCase().includes(q))
    : quickActions;

  const grouped = React.useMemo(() => {
    const byKind = new Map<string, PaletteHit[]>();
    for (const hit of hits) {
      const bucket = byKind.get(hit.kind) ?? [];
      bucket.push(hit);
      byKind.set(hit.kind, bucket);
    }
    return [...byKind.entries()].map(([kind, items]) => ({
      kind,
      meta: KIND_META[kind] ?? { label: kind, icon: Search },
      items,
    }));
  }, [hits]);

  function go(href: string) {
    setQuery("");
    setHits([]);
    setOpen(false);
    router.push(href);
  }

  // Enter follows the first thing in the list, whatever kind of thing it is.
  const firstHref = grouped[0]?.items[0]?.href ?? navResults[0]?.href ?? actionResults[0]?.href;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery("");
          setHits([]);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-w-md p-0 sm:max-w-xl"
      >
        <DialogHeader className="px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, tasks, notes, files — and jump to any page…"
              aria-label="Search your workspace"
              className="h-10 bg-muted/40 pl-9 pr-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && firstHref) go(firstHref);
              }}
            />
          </div>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-3 pb-3">
          {q.length >= 2 ? (
            searching && hits.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : hits.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                Nothing in your workspace matches “{query.trim()}”.
              </p>
            ) : (
              grouped.map(({ kind, meta, items }) => {
                const Icon = meta.icon;
                return (
                  <div key={kind}>
                    <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                      {meta.label}
                    </p>
                    <ul className="flex flex-col">
                      {items.map((hit) => (
                        <li key={`${hit.kind}-${hit.id}`}>
                          <button
                            type="button"
                            onClick={() => go(hit.href)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-accent"
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{hit.title}</span>
                              {hit.subtitle ? (
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {hit.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )
          ) : null}

          {navResults.length > 0 ? (
            <div>
              <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Navigate</p>
              <ul className="flex flex-col">
                {navResults.map((item) => (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-accent"
                    >
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {actionResults.length > 0 ? (
            <div>
              <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Quick create</p>
              <ul className="flex flex-col">
                {actionResults.map((action) => (
                  <li key={action.href}>
                    <button
                      type="button"
                      onClick={() => go(action.href)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-accent"
                    >
                      <action.icon className="size-4 text-muted-foreground" />
                      {action.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {q.length === 0 ? (
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">
              Search runs as you type. Press ⌘K anywhere to come back here.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
